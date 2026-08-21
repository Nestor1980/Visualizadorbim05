import * as OBC from "@thatopen/components";
import * as OBF from "@thatopen/components-front";
import { getPropertySets, getItemData, getElementTypeName, getPredefinedType } from "../ifc/properties";
import { getQuantityForSelection, isCountedCategory, defaultUnidadForMethod } from "../computo/quantity-extractor";
import { getQuantityMethod } from "../computo/ifc-quantity-rules";
import { getCategoriaNombre } from "../computo/ifc-categoria-rules";

export interface ComputoItem {
  id: string;
  rubro: string;
  descripcion: string;
  unidad: string;
  cantidad: number;
  precioUnitario: number;
  elementos: { modelId: string; localId: number }[];
  /** Clase IFC (ej. "IFCWALL") del primer elemento del ítem — no editable:
   *  sirve para detectar cuándo un click en modo Agregar corresponde a un
   *  tipo distinto y hay que arrancar un ítem nuevo en vez de sumarlo. */
  tipoIfc: string | null;
  /** Nombre de tipo/familia (ej. "MUR_LHC200") del primer elemento del ítem
   *  — no editable: dos elementos pueden compartir clase IFC (ambos
   *  "IFCWALL") pero ser tipos distintos (espesor/material), y eso también
   *  tiene que separarlos en ítems distintos. */
  tipoElemento: string | null;
  /** PredefinedType IFC (ej. "BASESLAB", "SKIRTINGBOARD") del primer
   *  elemento del ítem — no editable: desambigua la regla de cuantificación
   *  cuando la sola clase IFC no alcanza (ver ifc-quantity-rules.ts), ej. una
   *  losa de fundación (volumen) contra una losa de piso (área) que
   *  comparten "IFCSLAB". */
  predefinedType: string | null;
  /** Sección de la tabla de cómputo a la que pertenece este ítem (ver
   *  `ComputoCategoria`), o `null` si todavía no se arrastró a ninguna. Hoy
   *  la asignación es manual (drag & drop en computo-manager.ts); a futuro se
   *  planea auto-agrupar por tipo IFC. */
  categoriaId: string | null;
}

/** Sección de la tabla de cómputo creada a mano por el usuario (botón
 *  "Agregar categoría") — un agrupador orthogonal al Rubro, pensado para que
 *  el usuario organice los ítems como quiera arrastrándolos entre secciones. */
export interface ComputoCategoria {
  id: string;
  nombre: string;
}

export type ComputoAddMode = "add" | "remove";

export interface ComputoTool {
  readonly active: boolean;
  activate: () => void;
  deactivate: () => void;
  getAddMode: () => ComputoAddMode;
  setAddMode: (mode: ComputoAddMode) => void;
  list: Map<string, ComputoItem>;
  onItemAdded: OBC.Event<ComputoItem>;
  onItemChanged: OBC.Event<ComputoItem>;
  onItemDeleted: OBC.Event<string>;
  /** Secciones de la tabla de cómputo (ver `ComputoCategoria`). */
  categorias: Map<string, ComputoCategoria>;
  onCategoriaAdded: OBC.Event<ComputoCategoria>;
  onCategoriaChanged: OBC.Event<ComputoCategoria>;
  onCategoriaDeleted: OBC.Event<string>;
  addCategoria: (nombre: string) => ComputoCategoria;
  renameCategoria: (id: string, nombre: string) => void;
  /** Borra la sección; los ítems que tenía quedan sin sección (`categoriaId: null`),
   *  no se borran. */
  deleteCategoria: (id: string) => void;
  /** Mueve un ítem a una sección (o a `null` para sacarlo de todas) — usado
   *  por el drag & drop de filas entre secciones en computo-manager.ts. */
  moveItemToCategoria: (itemId: string, categoriaId: string | null) => void;
  /** Recrea una sección ya armada (sin pasar por `addCategoria`) — usado al
   *  restaurar un proyecto guardado. */
  restoreCategoria: (data: ComputoCategoria) => void;
  registerClick: (modelId: string, localId: number) => void;
  /** Agrega todos los elementos visibles de todos los modelos cargados al
   *  cómputo, de una sola vez (botón "Seleccionar todo" del panel) — mismo
   *  agrupado por identidad que un click individual en modo Agregar
   *  (ver `handleAdd`), solo que iterado sobre todo el modelo. Respeta
   *  visibilidad (`getItemsByVisibility`) para no traer elementos ocultos. */
  addAllElements: () => Promise<void>;
  /** Saca un elemento puntual de un ítem (usado por la fila hija del árbol
   *  de Capas de Datos) — si era el último, borra el ítem entero. */
  removeElementFromItem: (itemId: string, modelId: string, localId: number) => void;
  updateItem: (
    id: string,
    patch: Partial<Pick<ComputoItem, "rubro" | "descripcion" | "unidad" | "cantidad" | "precioUnitario">>,
  ) => void;
  deleteItem: (id: string) => void;
  /** Recrea un ítem ya armado (sin pasar por clicks) — usado al restaurar un
   *  proyecto guardado. No repinta el highlight; el llamador debe llamar
   *  `repaintHighlight()` una sola vez después de restaurar todos los ítems. */
  restoreItem: (data: ComputoItem) => void;
  repaintHighlight: () => void;
}

const RUBRO_KEY = /rubro|categor/i;
const DESC_KEY = /descripcion|^description$|^name$/i;
const UNIDAD_KEY = /unidad|^unit$/i;
const PRECIO_KEY = /preciounitario|unitprice|^precio$/i;

function findPropertyValue(
  psets: { name: string; properties: Record<string, string> }[],
  pattern: RegExp,
): string | null {
  for (const pset of psets) {
    for (const [key, value] of Object.entries(pset.properties)) {
      if (pattern.test(key) && value && value !== "—") return value;
    }
  }
  return null;
}

/** Clave de agrupación por tipo: nombre de tipo/familia si se pudo resolver
 *  (más específico), si no la clase IFC, si no `null` (sin identidad
 *  conocida — nunca se fusiona con otro ítem en ese caso). */
function identityKey(identity: { tipoIfc: string | null; tipoElemento: string | null }): string | null {
  return identity.tipoElemento ?? identity.tipoIfc ?? null;
}

function toModelIdMap(elementos: { modelId: string; localId: number }[]): OBC.ModelIdMap {
  const map: OBC.ModelIdMap = {};
  for (const { modelId, localId } of elementos) {
    if (!map[modelId]) map[modelId] = new Set();
    map[modelId].add(localId);
  }
  return map;
}

interface IfcIdentity {
  tipoIfc: string | null;
  tipoElemento: string | null;
  predefinedType: string | null;
}

/** Mapa localId → clase IFC por modelo, cacheado: `model.getItem(id).getCategory()`
 *  invoca en el worker una acción ("getItemCategory", singular) que esta versión
 *  de @thatopen/fragments no expone y siempre tira TypeError, dejando la
 *  categoría en null para cualquier elemento. `getItemsOfCategories` sí existe
 *  en el worker (variante batch) — se pide una sola vez por modelo con un
 *  regex que matchea todo, y se invierte a un mapa localId → categoría. */
const categoryMapByModel = new Map<string, Promise<Map<number, string>>>();

function getCategoryMap(
  fragments: OBC.FragmentsManager,
  modelId: string,
): Promise<Map<number, string>> {
  let cached = categoryMapByModel.get(modelId);
  if (cached) return cached;

  cached = (async () => {
    const map = new Map<number, string>();
    const model = fragments.list.get(modelId);
    if (!model) return map;
    try {
      const byCategory = await model.getItemsOfCategories([/.*/]);
      for (const [category, localIds] of Object.entries(byCategory)) {
        for (const localId of localIds) map.set(localId, category);
      }
    } catch { /* sin categorías resolubles */ }
    return map;
  })();
  categoryMapByModel.set(modelId, cached);
  return cached;
}

/** Identidad de un elemento a los efectos de agrupar/separar ítems de
 *  cómputo: clase IFC (ej. "IFCWALL") + nombre de tipo/familia (ej.
 *  "MUR_LHC200") — dos elementos de la misma clase pero tipo distinto
 *  (espesor/material) no deben terminar en el mismo ítem. */
async function getIfcIdentity(
  fragments: OBC.FragmentsManager,
  modelId: string,
  localId: number,
): Promise<IfcIdentity> {
  const model = fragments.list.get(modelId);
  if (!model) return { tipoIfc: null, tipoElemento: null, predefinedType: null };

  const categoryMap = await getCategoryMap(fragments, modelId);
  const tipoIfc = categoryMap.get(localId) ?? null;

  const tipoElemento = await getElementTypeName(model, localId).catch(() => null);
  const predefinedType = await getPredefinedType(model, localId).catch(() => null);

  return { tipoIfc, tipoElemento, predefinedType };
}

/**
 * Herramienta de cómputo y presupuesto: mismo molde que CotaTool/DrawTool
 * (estado propio en `list`, eventos onItemAdded/onItemDeleted para que
 * data-layers-tree.ts anide cada ítem en la capa activa) pero, a diferencia
 * de esas, no raycastea geometría propia — necesita identidad de elemento
 * IFC, así que se apoya en el propio `highlighter` (ver `registerClick`,
 * invocado desde `highlighter.events["select"].onHighlight` en main.ts
 * cuando el modo activo es "computo") en vez de un listener de canvas propio.
 */
export function createComputoTool(
  fragments: OBC.FragmentsManager,
  highlighter: OBF.Highlighter,
): ComputoTool {
  const list = new Map<string, ComputoItem>();
  const onItemAdded = new OBC.Event<ComputoItem>();
  const onItemChanged = new OBC.Event<ComputoItem>();
  const onItemDeleted = new OBC.Event<string>();

  const categorias = new Map<string, ComputoCategoria>();
  const onCategoriaAdded = new OBC.Event<ComputoCategoria>();
  const onCategoriaChanged = new OBC.Event<ComputoCategoria>();
  const onCategoriaDeleted = new OBC.Event<string>();
  let categoriaCounter = 0;

  let active = false;
  let addMode: ComputoAddMode = "add";
  /** Ítem que está recibiendo clicks en modo Agregar. Se cierra (null) al
   *  salir de la herramienta. Un click de un tipo distinto al del ítem en
   *  curso no lo cierra "para siempre": si ya existe un ítem de ese mismo
   *  tipo en cualquier parte del cómputo, se reabre y se suma ahí; solo se
   *  crea uno nuevo cuando el tipo es realmente inédito. */
  let currentItemId: string | null = null;
  let itemCounter = 0;

  function aggregateModelIdMap(): OBC.ModelIdMap {
    const all: { modelId: string; localId: number }[] = [];
    for (const item of list.values()) all.push(...item.elementos);
    return toModelIdMap(all);
  }

  function repaintHighlight(): void {
    const aggregate = aggregateModelIdMap();
    highlighter.clear("select").catch(console.error);
    highlighter.highlightByID("computo", aggregate, true, false).catch(console.error);
  }

  async function recomputeCantidad(item: ComputoItem): Promise<void> {
    if (item.elementos.length === 0) {
      item.cantidad = 0;
      return;
    }
    if (isCountedCategory(item.tipoIfc, item.predefinedType)) {
      item.cantidad = item.elementos.length;
      // Se fuerza acá (no solo al sembrar el primer elemento) para que un
      // ítem que haya quedado con una unidad vieja (ej. de antes de que esta
      // categoría se marcara como "contada") se autocorrija apenas se le
      // suma o saca un elemento, sin depender de borrarlo y recrearlo.
      item.unidad = "un";
      return;
    }
    const quantity = await getQuantityForSelection(
      toModelIdMap(item.elementos), fragments, item.tipoIfc, item.predefinedType,
    );
    item.cantidad = quantity?.cantidad ?? item.elementos.length;
  }

  async function seedFieldsFromElement(item: ComputoItem, modelId: string, localId: number): Promise<void> {
    const psets = await getPropertySets(modelId, localId, fragments);

    item.rubro = findPropertyValue(psets, RUBRO_KEY) ?? "";

    // Preferir el nombre de tipo/familia (compartido entre instancias del
    // mismo tipo, ej. "MUR_LHC200") por sobre el Name de la instancia (que
    // suele traer un sufijo único por elemento y ensucia la tabla).
    let descripcion = findPropertyValue(psets, DESC_KEY) ?? item.tipoElemento ?? "";
    if (!descripcion) {
      const model = fragments.list.get(modelId);
      const itemData = model ? await getItemData(model, localId, false) : null;
      const rawName = itemData?.Name;
      descripcion =
        typeof rawName === "string" ? rawName
        : rawName?.value !== undefined ? String(rawName.value)
        : "";
    }
    item.descripcion = descripcion;

    const precioStr = findPropertyValue(psets, PRECIO_KEY);
    item.precioUnitario = precioStr ? (parseFloat(precioStr) || 0) : 0;

    // Ventanas, puertas y similares se cuentan por pieza aunque tengan
    // superficie propia — no tiene sentido buscarles un área/volumen.
    const counted = isCountedCategory(item.tipoIfc, item.predefinedType);
    let unidad = counted ? "un" : (findPropertyValue(psets, UNIDAD_KEY) ?? "");
    if (!unidad) {
      const quantity = await getQuantityForSelection(
        { [modelId]: new Set([localId]) }, fragments, item.tipoIfc, item.predefinedType,
      );
      // Si no hay quantity set legible, la unidad igual debe reflejar la
      // magnitud del método resuelto (m2/m3/ml) y no caer siempre en "un" —
      // si no, un elemento medido por volumen o longitud sin Qto_* queda con
      // una unidad incorrecta que además invita a cargar la cantidad a mano
      // sin saber en qué magnitud.
      unidad = quantity?.unidad ?? defaultUnidadForMethod(getQuantityMethod(item.tipoIfc, item.predefinedType));
    }
    item.unidad = unidad;
  }

  async function handleAdd(modelId: string, localId: number): Promise<void> {
    const identity = await getIfcIdentity(fragments, modelId, localId);
    const key = identityKey(identity);

    let item = currentItemId ? list.get(currentItemId) : undefined;

    // El ítem en curso ya no sirve si es de otro tipo — no se cierra "para
    // siempre", solo deja de ser el "actual" (ver búsqueda debajo).
    if (item && key && identityKey(item) !== key) item = undefined;

    // Sin ítem en curso compatible: si ya existe un ítem de este mismo tipo
    // en cualquier parte del cómputo (aunque no sea el que se estaba
    // armando), se reabre y se suma ahí en vez de crear uno duplicado.
    if (!item && key) {
      for (const candidate of list.values()) {
        if (identityKey(candidate) === key) { item = candidate; break; }
      }
    }

    if (!item) {
      itemCounter += 1;
      // Auto-categoría por tipo IFC (ver ifc-categoria-rules.ts, configurable
      // desde el modal de Configuración) — de una sola vez, al crear el ítem,
      // igual que Rubro/Descripción: si el usuario después arrastra el ítem a
      // otra sección a mano, un click nuevo del mismo tipo reabre este mismo
      // ítem (ver búsqueda por `key` arriba) y no vuelve a tocar categoriaId.
      const categoriaNombre = getCategoriaNombre(identity.tipoIfc, identity.predefinedType);
      item = {
        id: `computo-${Date.now()}-${itemCounter}`,
        rubro: "", descripcion: "", unidad: "", cantidad: 0, precioUnitario: 0,
        elementos: [], tipoIfc: identity.tipoIfc, tipoElemento: identity.tipoElemento,
        predefinedType: identity.predefinedType,
        categoriaId: categoriaNombre ? findOrCreateCategoriaByName(categoriaNombre).id : null,
      };
      list.set(item.id, item);
      onItemAdded.trigger(item);
    }
    currentItemId = item.id;

    const already = item.elementos.some((e) => e.modelId === modelId && e.localId === localId);
    if (already) return;

    const isFirstElement = item.elementos.length === 0;
    item.elementos.push({ modelId, localId });
    if (isFirstElement) await seedFieldsFromElement(item, modelId, localId);
    await recomputeCantidad(item);
    onItemChanged.trigger(item);
  }

  function findItemContaining(modelId: string, localId: number): ComputoItem | undefined {
    for (const item of list.values()) {
      if (item.elementos.some((e) => e.modelId === modelId && e.localId === localId)) return item;
    }
    return undefined;
  }

  async function removeElement(item: ComputoItem, modelId: string, localId: number): Promise<void> {
    const idx = item.elementos.findIndex((e) => e.modelId === modelId && e.localId === localId);
    if (idx === -1) return;

    item.elementos.splice(idx, 1);
    if (item.elementos.length === 0) {
      list.delete(item.id);
      if (currentItemId === item.id) currentItemId = null;
      onItemDeleted.trigger(item.id);
    } else {
      await recomputeCantidad(item);
      onItemChanged.trigger(item);
    }
  }

  async function handleRemove(modelId: string, localId: number): Promise<void> {
    const item = findItemContaining(modelId, localId);
    if (item) await removeElement(item, modelId, localId);
  }

  function registerClick(modelId: string, localId: number): void {
    const task = addMode === "add" ? handleAdd(modelId, localId) : handleRemove(modelId, localId);
    task.then(repaintHighlight).catch(console.error);
  }

  async function addAllElements(): Promise<void> {
    for (const [modelId, model] of fragments.list) {
      const visibleIds = await model.getItemsByVisibility(true);
      for (const localId of visibleIds) {
        await handleAdd(modelId, localId);
      }
    }
    repaintHighlight();
  }

  function removeElementFromItem(itemId: string, modelId: string, localId: number): void {
    const item = list.get(itemId);
    if (!item) return;
    removeElement(item, modelId, localId).then(repaintHighlight).catch(console.error);
  }

  function updateItem(
    id: string,
    patch: Partial<Pick<ComputoItem, "rubro" | "descripcion" | "unidad" | "cantidad" | "precioUnitario">>,
  ): void {
    const item = list.get(id);
    if (!item) return;
    Object.assign(item, patch);
    onItemChanged.trigger(item);
  }

  function deleteItem(id: string): void {
    if (!list.has(id)) return;
    list.delete(id);
    if (currentItemId === id) currentItemId = null;
    onItemDeleted.trigger(id);
    repaintHighlight();
  }

  function restoreItem(data: ComputoItem): void {
    // `predefinedType`/`categoriaId` pueden faltar en proyectos guardados con
    // una versión anterior del cómputo — se completan con `null` (equivale a
    // "sin dato"/"sin sección", igual que antes de que existieran estos campos).
    const item: ComputoItem = {
      ...data,
      predefinedType: data.predefinedType ?? null,
      categoriaId: data.categoriaId ?? null,
      elementos: [...data.elementos],
    };
    list.set(item.id, item);
    onItemAdded.trigger(item);
  }

  function addCategoria(nombre: string): ComputoCategoria {
    categoriaCounter += 1;
    const categoria: ComputoCategoria = { id: `categoria-${Date.now()}-${categoriaCounter}`, nombre };
    categorias.set(categoria.id, categoria);
    onCategoriaAdded.trigger(categoria);
    return categoria;
  }

  /** Busca una categoría existente por nombre (case-insensitive) antes de
   *  crear una nueva — usado por la auto-asignación en `handleAdd` para que
   *  dos tipos IFC mapeados al mismo nombre (ej. IFCWALL e IFCCURTAINWALL →
   *  "Paredes") terminen en la misma sección en vez de una por tipo. */
  function findOrCreateCategoriaByName(nombre: string): ComputoCategoria {
    for (const categoria of categorias.values()) {
      if (categoria.nombre.toLowerCase() === nombre.toLowerCase()) return categoria;
    }
    return addCategoria(nombre);
  }

  function renameCategoria(id: string, nombre: string): void {
    const categoria = categorias.get(id);
    if (!categoria) return;
    categoria.nombre = nombre;
    onCategoriaChanged.trigger(categoria);
  }

  function deleteCategoria(id: string): void {
    if (!categorias.delete(id)) return;
    for (const item of list.values()) {
      if (item.categoriaId === id) {
        item.categoriaId = null;
        onItemChanged.trigger(item);
      }
    }
    onCategoriaDeleted.trigger(id);
  }

  function moveItemToCategoria(itemId: string, categoriaId: string | null): void {
    const item = list.get(itemId);
    if (!item) return;
    if (categoriaId !== null && !categorias.has(categoriaId)) return;
    if (item.categoriaId === categoriaId) return;
    item.categoriaId = categoriaId;
    onItemChanged.trigger(item);
  }

  function restoreCategoria(data: ComputoCategoria): void {
    categorias.set(data.id, { ...data });
    onCategoriaAdded.trigger(data);
  }

  return {
    get active() { return active; },
    activate: () => { active = true; repaintHighlight(); },
    deactivate: () => {
      active = false;
      currentItemId = null;
      highlighter.clear("computo").catch(console.error);
    },
    getAddMode: () => addMode,
    setAddMode: (mode) => { addMode = mode; },
    list,
    onItemAdded,
    onItemChanged,
    onItemDeleted,
    categorias,
    onCategoriaAdded,
    onCategoriaChanged,
    onCategoriaDeleted,
    addCategoria,
    renameCategoria,
    deleteCategoria,
    moveItemToCategoria,
    restoreCategoria,
    registerClick,
    addAllElements,
    removeElementFromItem,
    updateItem,
    deleteItem,
    restoreItem,
    repaintHighlight,
  };
}
