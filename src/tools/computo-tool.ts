import * as OBC from "@thatopen/components";
import * as OBF from "@thatopen/components-front";
import { getPropertySets, getItemData, getElementTypeName } from "../ifc/properties";
import { getQuantityForSelection, isCountedCategory } from "../computo/quantity-extractor";

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
  registerClick: (modelId: string, localId: number) => void;
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
  if (!model) return { tipoIfc: null, tipoElemento: null };

  let tipoIfc: string | null = null;
  try {
    tipoIfc = await model.getItem(localId).getCategory();
  } catch { /* sin categoría resoluble */ }

  const tipoElemento = await getElementTypeName(model, localId).catch(() => null);

  return { tipoIfc, tipoElemento };
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
    if (isCountedCategory(item.tipoIfc)) {
      item.cantidad = item.elementos.length;
      return;
    }
    const quantity = await getQuantityForSelection(toModelIdMap(item.elementos), fragments);
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
    let unidad = isCountedCategory(item.tipoIfc) ? "un" : (findPropertyValue(psets, UNIDAD_KEY) ?? "");
    if (!unidad) {
      const quantity = await getQuantityForSelection({ [modelId]: new Set([localId]) }, fragments);
      unidad = quantity?.unidad ?? "un";
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
      item = {
        id: `computo-${Date.now()}-${itemCounter}`,
        rubro: "", descripcion: "", unidad: "", cantidad: 0, precioUnitario: 0,
        elementos: [], tipoIfc: identity.tipoIfc, tipoElemento: identity.tipoElemento,
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
    const item: ComputoItem = { ...data, elementos: [...data.elementos] };
    list.set(item.id, item);
    onItemAdded.trigger(item);
  }

  return {
    get active() { return active; },
    activate: () => { active = true; },
    deactivate: () => { active = false; currentItemId = null; },
    getAddMode: () => addMode,
    setAddMode: (mode) => { addMode = mode; },
    list,
    onItemAdded,
    onItemChanged,
    onItemDeleted,
    registerClick,
    removeElementFromItem,
    updateItem,
    deleteItem,
    restoreItem,
    repaintHighlight,
  };
}
