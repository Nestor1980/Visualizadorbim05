import * as OBC from "@thatopen/components";
import * as OBF from "@thatopen/components-front";
import { getPropertySets, getItemData, getElementTypeName, getPredefinedType } from "../ifc/properties";
import { getQuantityForSelection, isCountedCategory, defaultUnidadForMethod } from "../computo/quantity-extractor";
import { getQuantityMethod, subscribeQuantityRules } from "../computo/ifc-quantity-rules";
import { getCategoriaNombre } from "../computo/ifc-categoria-rules";
import { compareItemDesignacion } from "../computo/iapv-order";
import { psetValueKey } from "../computo/computo-columns";
import { registerSeen } from "../ifc/pset-visibility";

export interface ComputoItem {
  id: string;
  rubro: string;
  descripcion: string;
  unidad: string;
  cantidad: number;
  precioUnitario: number;
  /** Designación del Item del Presupuesto Oficial de IAPV (ej. "4_Mampostería
   *  de Elevación"), leída del PSet `IAPV_Item` del primer elemento del ítem
   *  — cadena vacía si el elemento no trae ese PSet. Determina el agrupamiento
   *  y la nomenclatura del Cómputo cuando está presente (ver `iapv-order.ts`
   *  y `computo-manager.ts`); si falta, se usa el agrupamiento por Rubro. */
  iapvItem: string;
  /** Designación del SubItem del Presupuesto Oficial de IAPV (ej. "4.1 De
   *  ladrillos huecos de 0,20m de espesor"), leída del PSet `IAPV_Suitem`. Si
   *  el elemento no trae ese PSet cae al nombre de tipo/familia (ej. "Basic
   *  Wall:4.4 De ladrillos"): el ítem agrupa todas las instancias de ese tipo,
   *  así que ese nombre es su designación — las instancias se despliegan como
   *  filas hijas debajo (ver `getInstancias`). */
  iapvSubItem: string;
  /** URL a la especificación técnica del Pliego que define este ítem —
   *  primera propiedad con VALOR con forma de URL que se encuentre entre los
   *  PSets del primer elemento (no depende de un nombre de propiedad fijo
   *  como "URL del Pliego" o "IAPV_URL": cada modelo puede llamarla distinto
   *  — ver `findUrlPropertyValue`), cadena vacía si no hay ninguna. Se
   *  muestra como link junto a la Designación de la Obra en
   *  computo-manager.ts (ver también properties-panel.ts, que hace lo mismo
   *  con cualquier propiedad URL en el panel de propiedades). */
  urlPliego: string;
  /** Valores de propiedades de Property Sets del primer elemento del ítem,
   *  aplanados con clave `"NombrePset::NombreProp"` (ver `psetValueKey` en
   *  computo-columns.ts). Alimenta las columnas extra "traídas de un PSet" que
   *  el usuario agrega desde el modal de Columnas — se captura entero al
   *  sembrar el ítem para que una columna nueva funcione también en ítems ya
   *  existentes, sin re-leer el modelo. */
  psetValues: Record<string, string>;
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

/**
 * Una instancia concreta de un ítem de cómputo: el elemento IFC tal como está
 * en el modelo, con su nombre propio y su magnitud individual. Un ítem agrupa
 * todas las instancias de un mismo tipo (ver `identityKey`), y su SubItem es el
 * nombre de ese tipo; estas filas son el detalle que lo compone — la suma de
 * sus cantidades es (salvo ajustes por fórmula, ver `getQuantityForSelection`)
 * la cantidad del ítem.
 *
 * No se persiste: se resuelve leyendo el modelo bajo demanda (ver
 * `getInstancias`), porque son datos derivados del IFC que no tiene sentido
 * guardar en el proyecto.
 */
export interface ComputoInstancia {
  modelId: string;
  localId: number;
  /** `Name` del elemento IFC (ej. "Basic Wall:4.4 De ladrillos:317645"), o
   *  `#<localId>` si no trae ninguno. */
  nombre: string;
  unidad: string;
  cantidad: number;
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
  /** Reordena las secciones por su nombre, en orden natural ("2" antes que
   *  "10" — ver `compareItemDesignacion`). Usado por el botón "Ordenar
   *  categorías" del panel. */
  sortCategorias: () => void;
  /** Mueve un ítem a una sección (o a `null` para sacarlo de todas) — usado
   *  por el drag & drop de filas entre secciones en computo-manager.ts. Si al
   *  moverlo la sección de origen queda sin ningún ítem, esa sección se
   *  elimina automáticamente (ver `pruneCategoriaIfEmpty`). */
  moveItemToCategoria: (itemId: string, categoriaId: string | null) => void;
  /** Recrea una sección ya armada (sin pasar por `addCategoria`) — usado al
   *  restaurar un proyecto guardado. */
  restoreCategoria: (data: ComputoCategoria) => void;
  registerClick: (modelId: string, localId: number) => void;
  /** Agrega (o quita, según el modo Agregar/Quitar activo) de una sola vez
   *  todos los elementos de un `ModelIdMap` — para aplicar el Cómputo a una
   *  selección hecha desde el Panel de Tipos (un tipo entero, o varias filas
   *  sumadas con Ctrl). Mismo agrupado por identidad IFC que `registerClick`
   *  (ver `handleAdd`), iterado sobre el mapa. */
  registerSelection: (modelIdMap: OBC.ModelIdMap) => void;
  /** Agrega todos los elementos visibles de todos los modelos cargados al
   *  cómputo, de una sola vez (botón "Seleccionar todo" del panel) — mismo
   *  agrupado por identidad que un click individual en modo Agregar
   *  (ver `handleAdd`), solo que iterado sobre todo el modelo. Respeta
   *  visibilidad (`getItemsByVisibility`) para no traer elementos ocultos. */
  addAllElements: () => Promise<void>;
  /** Saca un elemento puntual de un ítem (usado por la fila hija del árbol
   *  de Capas de Datos) — si era el último, borra el ítem entero. */
  removeElementFromItem: (itemId: string, modelId: string, localId: number) => void;
  /** Detalle por instancia de un ítem (ver `ComputoInstancia`): nombre y
   *  magnitud individual de cada uno de sus `elementos`, en el mismo orden.
   *  Lee el modelo, así que es asincrónico y viene cacheado por ítem (el cache
   *  se invalida al agregar/quitar elementos o al cambiar las reglas de
   *  cuantificación). `[]` si el ítem ya no existe. */
  getInstancias: (itemId: string) => Promise<ComputoInstancia[]>;
  updateItem: (
    id: string,
    patch: Partial<Pick<ComputoItem, "rubro" | "descripcion" | "unidad" | "cantidad" | "precioUnitario" | "iapvItem" | "iapvSubItem">>,
  ) => void;
  deleteItem: (id: string) => void;
  /** Recrea un ítem ya armado (sin pasar por clicks) — usado al restaurar un
   *  proyecto guardado. No repinta el highlight; el llamador debe llamar
   *  `repaintHighlight()` una sola vez después de restaurar todos los ítems. */
  restoreItem: (data: ComputoItem) => void;
  repaintHighlight: () => void;
}

const RUBRO_KEY = /rubro|categor/i;
// "Descripción" es el texto del rubro (lo que se lee en un presupuesto), no el
// nombre del elemento: por eso NO matchea `Name` — ese nombre identifica al
// tipo que el ítem agrupa y va al SubItem (ver `NAME_KEY` y
// `seedFieldsFromElement`).
const DESC_KEY = /descripcion|^description$/i;
const NAME_KEY = /^name$/i;
const UNIDAD_KEY = /unidad|^unit$/i;
const PRECIO_KEY = /preciounitario|unitprice|^precio$/i;
// Claves exactas (no laxas como las de arriba) porque son los nombres de PSet
// fijos del estándar IAPV — una regex laxa como la de RUBRO_KEY arriesgaría
// falsos positivos con otras propiedades "IAPV_*" del modelo (IAPV_Local,
// IAPV_Inspector).
const IAPV_ITEM_KEY = /^IAPV_Item$/i;
const IAPV_SUBITEM_KEY = /^IAPV_Suitem$/i;

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

/** URL_PATTERN, matching properties-panel.ts. */
const URL_PATTERN = /^https?:\/\//i;

/** Busca la primera propiedad cuyo VALOR (no el nombre) tenga forma de URL —
 *  a propósito no está atada a un nombre de propiedad fijo como "URL del
 *  Pliego": cada IFC/exportador puede llamarla distinto (`IAPV_URL`, `Weblink`,
 *  etc.), así que sirve para cualquier modelo IFC, no solo el de IAPV. Mismo
 *  criterio que ya usa properties-panel.ts para mostrar links en el panel de
 *  propiedades — acá se reutiliza para poblar `ComputoItem.urlPliego`. */
function findUrlPropertyValue(
  psets: { name: string; properties: Record<string, string> }[],
): string | null {
  for (const pset of psets) {
    for (const value of Object.values(pset.properties)) {
      if (value && URL_PATTERN.test(value.trim())) return value.trim();
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

/** Redondeo a 2 decimales — límite final antes de guardar/mostrar una
 *  cantidad (no se aplica en pasos intermedios de suma entre elementos, para
 *  no perder precisión acumulada). */
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Unidades que el propio cómputo pone al medir — `recomputeCantidad` puede
 *  reescribirlas al recalcular (ej. si cambia la regla del tipo), pero deja
 *  intacta cualquier otra (unidad traída del PSet `Unidad` del modelo o
 *  tipeada a mano). */
const AUTO_UNIDADES = new Set(["", "un", "m2", "m3", "ml"]);

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

/** `Name` del elemento IFC — el nombre de la INSTANCIA (ej. "Basic Wall:4.4 De
 *  ladrillos:317645", con el sufijo único que le pone el exportador), a
 *  diferencia de `getElementTypeName`, que da el del tipo compartido por todas
 *  ellas. `null` si el elemento no trae Name. */
async function getInstanceName(
  fragments: OBC.FragmentsManager,
  modelId: string,
  localId: number,
): Promise<string | null> {
  const model = fragments.list.get(modelId);
  if (!model) return null;
  try {
    const itemData = await getItemData(model, localId, false);
    const rawName = itemData?.Name;
    const name =
      typeof rawName === "string" ? rawName
      : rawName?.value !== undefined ? String(rawName.value)
      : "";
    return name.trim() || null;
  } catch {
    return null;
  }
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
    item.cantidad = round2(quantity?.cantidad ?? item.elementos.length);
    // Sincroniza la unidad con la magnitud que efectivamente se pudo medir
    // (m2/m3/ml) — así, si cambia la regla de cuantificación del tipo
    // (Configuración → Reglas), el ítem no queda con la unidad vieja. Solo se
    // pisa una unidad "automática" (vacía o una magnitud estándar): una unidad
    // traída del modelo (PSet `Unidad`) o tipeada a mano por el usuario se
    // respeta.
    if (quantity && AUTO_UNIDADES.has(item.unidad)) item.unidad = quantity.unidad;
  }

  /** Detalle por instancia ya resuelto, por ítem (ver `ComputoInstancia`):
   *  armarlo cuesta una vuelta al modelo por elemento, y la tabla se
   *  re-renderiza muchas veces sin que el ítem cambie. `sig` es la lista de
   *  elementos del ítem: si cambia (se agregó o quitó uno), la entrada se
   *  descarta sola. Un cambio de reglas de cuantificación lo limpia entero
   *  (ver `scheduleRecomputeAll`). */
  const instanciasCache = new Map<string, { sig: string; value: Promise<ComputoInstancia[]> }>();

  function elementosSig(item: ComputoItem): string {
    return item.elementos.map((e) => `${e.modelId}:${e.localId}`).join("|");
  }

  async function computeInstancias(item: ComputoItem): Promise<ComputoInstancia[]> {
    // Los tipos que se cuentan por pieza aportan 1 cada uno por definición —
    // no hace falta ir a buscarles quantity sets (ver isCountedCategory).
    const counted = isCountedCategory(item.tipoIfc, item.predefinedType);
    return Promise.all(
      item.elementos.map(async ({ modelId, localId }) => {
        const nombre = (await getInstanceName(fragments, modelId, localId)) ?? `#${localId}`;
        if (counted) return { modelId, localId, nombre, unidad: "un", cantidad: 1 };
        const quantity = await getQuantityForSelection(
          { [modelId]: new Set([localId]) }, fragments, item.tipoIfc, item.predefinedType,
        );
        return {
          modelId,
          localId,
          nombre,
          // Misma magnitud que mide el ítem; si el elemento no arroja ninguna,
          // se deja su unidad y 1 (el aporte por conteo, que es el respaldo
          // que usa `recomputeCantidad` para el total).
          unidad: quantity?.unidad ?? item.unidad,
          cantidad: round2(quantity?.cantidad ?? 1),
        };
      }),
    );
  }

  function getInstancias(itemId: string): Promise<ComputoInstancia[]> {
    const item = list.get(itemId);
    if (!item) return Promise.resolve([]);
    const sig = elementosSig(item);
    const cached = instanciasCache.get(itemId);
    if (cached && cached.sig === sig) return cached.value;
    const value = computeInstancias(item);
    instanciasCache.set(itemId, { sig, value });
    return value;
  }

  /** Recalcula la cantidad (y unidad) de TODOS los ítems del cómputo — se
   *  dispara cuando cambian las reglas de cuantificación por tipo IFC desde
   *  Configuración (método o Property Set de origen), para que la tabla
   *  refleje el nuevo criterio sin tener que borrar y recrear los ítems.
   *  Coalescido en un microtask porque `resetQuantityRule` hace dos escrituras
   *  seguidas (método + fuente) y no hace falta recomputar dos veces. */
  let recomputeAllPending = false;
  function scheduleRecomputeAll(): void {
    if (recomputeAllPending) return;
    recomputeAllPending = true;
    queueMicrotask(async () => {
      recomputeAllPending = false;
      // Las magnitudes por instancia salen de las mismas reglas que acaban de
      // cambiar, así que el detalle cacheado ya no vale.
      instanciasCache.clear();
      if (list.size === 0) return;
      for (const item of list.values()) await recomputeCantidad(item);
      const first = list.values().next().value as ComputoItem | undefined;
      if (first) onItemChanged.trigger(first); // un solo re-render de la tabla
      repaintHighlight();
    });
  }
  subscribeQuantityRules(scheduleRecomputeAll);

  async function seedFieldsFromElement(item: ComputoItem, modelId: string, localId: number): Promise<void> {
    const psets = await getPropertySets(modelId, localId, fragments);

    // Snapshot completo de PSet::prop → valor, para las columnas extra del
    // modal de Columnas (ver `psetValues` en la interfaz). Además registra los
    // PSets vistos para que el modal pueda ofrecerlos aunque el usuario nunca
    // haya abierto el panel de propiedades de ese elemento.
    const psetValues: Record<string, string> = {};
    for (const pset of psets) {
      registerSeen(pset.name, Object.keys(pset.properties));
      for (const [prop, value] of Object.entries(pset.properties)) {
        if (value && value !== "—") psetValues[psetValueKey(pset.name, prop)] = value;
      }
    }
    item.psetValues = psetValues;

    item.rubro = findPropertyValue(psets, RUBRO_KEY) ?? "";
    item.iapvItem = findPropertyValue(psets, IAPV_ITEM_KEY) ?? "";
    item.urlPliego = findUrlPropertyValue(psets) ?? "";

    // SubItem = designación del ítem. Con el PSet de IAPV manda ese; si no, es
    // el nombre de tipo/familia (compartido entre todas las instancias del
    // tipo, ej. "Basic Wall:4.4 De ladrillos"), que es justamente lo que el
    // ítem agrupa — cada instancia se ve como fila hija con su propio Name
    // (ver `getInstancias`). Se prefiere el nombre del tipo por sobre el Name
    // de la instancia, que trae un sufijo único por elemento y ensuciaría la
    // designación.
    const nombreTipo =
      item.tipoElemento
      ?? findPropertyValue(psets, NAME_KEY)
      ?? (await getInstanceName(fragments, modelId, localId));
    item.iapvSubItem = findPropertyValue(psets, IAPV_SUBITEM_KEY) ?? nombreTipo ?? "";

    // Descripción: el texto del rubro (Pliego). Solo se siembra si el modelo
    // trae una propiedad de descripción propiamente dicha — el nombre del
    // elemento ya no cae acá, va al SubItem (arriba).
    item.descripcion = findPropertyValue(psets, DESC_KEY) ?? "";

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
        iapvItem: "", iapvSubItem: "", urlPliego: "", psetValues: {},
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
      const categoriaId = item.categoriaId;
      list.delete(item.id);
      instanciasCache.delete(item.id);
      if (currentItemId === item.id) currentItemId = null;
      onItemDeleted.trigger(item.id);
      pruneCategoriaIfEmpty(categoriaId);
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

  async function registerSelection(modelIdMap: OBC.ModelIdMap): Promise<void> {
    for (const [modelId, ids] of Object.entries(modelIdMap)) {
      for (const localId of ids) {
        await (addMode === "add" ? handleAdd(modelId, localId) : handleRemove(modelId, localId));
      }
    }
    repaintHighlight();
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
    const item = list.get(id);
    if (!item) return;
    const categoriaId = item.categoriaId;
    list.delete(id);
    instanciasCache.delete(id);
    if (currentItemId === id) currentItemId = null;
    onItemDeleted.trigger(id);
    pruneCategoriaIfEmpty(categoriaId);
    repaintHighlight();
  }

  function restoreItem(data: ComputoItem): void {
    // Proyectos guardados antes de que el nombre del elemento pasara a ser el
    // SubItem (ver `seedFieldsFromElement`) lo traen en Descripción: se mueve
    // acá para que la tabla restaurada quede igual que una recién computada. Si
    // Descripción trae otra cosa (una descripción de verdad, de un PSet), se
    // respeta y el SubItem se arma con el nombre del tipo.
    const nombreTipo = data.tipoElemento ?? "";
    let iapvSubItem = data.iapvSubItem ?? "";
    let descripcion = data.descripcion ?? "";
    if (!iapvSubItem) {
      if (nombreTipo) {
        iapvSubItem = nombreTipo;
        if (descripcion === nombreTipo) descripcion = "";
      } else {
        iapvSubItem = descripcion;
        descripcion = "";
      }
    }

    // `predefinedType`/`categoriaId` pueden faltar en proyectos guardados con
    // una versión anterior del cómputo — se completan con `null` (equivale a
    // "sin dato"/"sin sección", igual que antes de que existieran estos campos).
    const item: ComputoItem = {
      ...data,
      predefinedType: data.predefinedType ?? null,
      categoriaId: data.categoriaId ?? null,
      iapvItem: data.iapvItem ?? "",
      iapvSubItem,
      descripcion,
      urlPliego: data.urlPliego ?? "",
      psetValues: data.psetValues ?? {},
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

  /** Elimina la sección `id` si ya no le queda ningún ítem — se llama cada vez
   *  que un ítem abandona una sección (drag & drop a otra, borrado del ítem, o
   *  pérdida de su último elemento). No toca la sección "Sin categoría"
   *  (`null`), ni las secciones recién creadas que todavía nadie pobló (a esas
   *  nunca las "abandona" un ítem, así que no pasan por acá). */
  function pruneCategoriaIfEmpty(id: string | null): void {
    if (!id || !categorias.has(id)) return;
    for (const item of list.values()) {
      if (item.categoriaId === id) return;
    }
    categorias.delete(id);
    onCategoriaDeleted.trigger(id);
  }

  function sortCategorias(): void {
    if (categorias.size < 2) return;
    const ordenadas = [...categorias.values()].sort((a, b) =>
      compareItemDesignacion(a.nombre, b.nombre));
    categorias.clear();
    for (const categoria of ordenadas) categorias.set(categoria.id, categoria);
    // El nuevo orden vive en el orden de inserción del Map; se avisa con
    // `onCategoriaChanged` (los suscriptores re-renderizan sin mirar el arg).
    onCategoriaChanged.trigger(ordenadas[0]);
  }

  function moveItemToCategoria(itemId: string, categoriaId: string | null): void {
    const item = list.get(itemId);
    if (!item) return;
    if (categoriaId !== null && !categorias.has(categoriaId)) return;
    if (item.categoriaId === categoriaId) return;
    const previa = item.categoriaId;
    item.categoriaId = categoriaId;
    onItemChanged.trigger(item);
    pruneCategoriaIfEmpty(previa);
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
    sortCategorias,
    moveItemToCategoria,
    restoreCategoria,
    registerClick,
    registerSelection: (modelIdMap) => { void registerSelection(modelIdMap); },
    addAllElements,
    removeElementFromItem,
    getInstancias,
    updateItem,
    deleteItem,
    restoreItem,
    repaintHighlight,
  };
}
