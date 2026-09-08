import * as THREE from "three";
import * as OBC from "@thatopen/components";
import { getPropertySets, getItemData, getExpressId } from "../ifc/properties";
import { getQuantityMethod, getQuantitySource, getQuantityAdjust, type QuantityMethod, type QuantitySource } from "./ifc-quantity-rules";
import { evalQuantityFormula } from "./quantity-formula";

export interface ExtractedQuantity {
  unidad: string;
  cantidad: number;
}

// Varias claves por unidad porque distintos exportadores IFC nombran las
// quantities de forma distinta (Net vs Gross, con o sin prefijo).
// "SideArea"/"FootprintArea" van primero porque son las claves reales que usa
// el schema IFC para paredes/losas (Qto_WallBaseQuantities, etc.) — "Area" a
// secas casi nunca aparece; dejarlo como único candidato hacía que las
// paredes nunca encontraran su área y cayeran al respaldo por conteo.
// "area" busca primero las claves Net* (consumo real de material, la
// convención por defecto — ver ifc-quantity-rules.ts); "area_bruta" invierte
// la prioridad para los rubros que piden la geometría idealizada sin
// descuentos (cubiertas inclinadas, contrapisos). Qué claves probar depende
// del método de cuantificación del tipo IFC: "auto" prueba las tres
// magnitudes (con la variante neta de área) en este orden, cualquier otro
// método restringe la búsqueda a su propia magnitud/convención.
// "TotalArea" es una clave de `Qto_RoofBaseQuantities` (suma real de la
// superficie desarrollada de las faldas de una cubierta) — se incluye para que
// un IfcRoof que la traiga la use. NO se busca "ProjectedArea": es la
// proyección horizontal y subestima una cubierta inclinada; cuando el techo
// solo trae eso, se prefiere bajar a sus componentes (chapas/losas) y sumar el
// área real — ver `getElementQuantity`.
const KEYS_BY_METHOD: Record<"area" | "area_bruta" | "volumen" | "longitud", { unidad: string; keys: string[] }> = {
  area: { unidad: "m2", keys: ["NetSideArea", "GrossSideArea", "NetFootprintArea", "GrossFootprintArea", "NetArea", "GrossArea", "Area", "TotalArea"] },
  area_bruta: { unidad: "m2", keys: ["GrossSideArea", "GrossFootprintArea", "GrossArea", "TotalArea", "NetSideArea", "NetFootprintArea", "NetArea", "Area"] },
  volumen: { unidad: "m3", keys: ["NetVolume", "GrossVolume", "Volume"] },
  longitud: { unidad: "ml", keys: ["Length", "NetLength", "Perimeter", "NetPerimeter"] },
};
const AUTO_ORDER: ("area" | "volumen" | "longitud")[] = ["area", "volumen", "longitud"];

/** Unidad por defecto de un método de cuantificación — se usa para no dejar
 *  el campo Unidad en "un" cuando el tipo se mide por volumen/longitud/área
 *  pero el modelo no trae ningún quantity set legible (ver
 *  `seedFieldsFromElement` en computo-tool.ts). */
export function defaultUnidadForMethod(method: QuantityMethod): string {
  if (method === "area" || method === "area_bruta") return "m2";
  if (method === "volumen") return "m3";
  if (method === "longitud") return "ml";
  return "un";
}

/** Ídem `getQuantityMethod(tipoIfc, predefinedType) === "cantidad"` — se
 *  mide por pieza ("un") aunque el elemento tenga área/volumen geométrico
 *  propio (una ventana o una puerta ocupan una superficie física, pero en un
 *  cómputo se cuentan, no se miden). */
export function isCountedCategory(tipoIfc: string | null, predefinedType?: string | null): boolean {
  return getQuantityMethod(tipoIfc, predefinedType) === "cantidad";
}

function isQuantitySet(name: string): boolean {
  return /^qto_/i.test(name) || /basequantities/i.test(name);
}

/** Unidad para un valor leído de una fuente explícita: la del método si lo
 *  fija (área→m2, volumen→m3, longitud→ml), y si el método es "auto" se
 *  infiere del nombre de la propiedad. */
function unidadForSource(method: QuantityMethod, propName: string): string {
  if (method === "area" || method === "area_bruta") return "m2";
  if (method === "volumen") return "m3";
  if (method === "longitud") return "ml";
  const n = propName.toLowerCase();
  if (n.includes("volume") || n.includes("volumen")) return "m3";
  if (n.includes("area") || n.includes("área") || n.includes("superfic")) return "m2";
  if (n.includes("length") || n.includes("perimeter") || n.includes("perimetro")
    || n.includes("perímetro") || n.includes("longitud") || n.includes("largo")) return "ml";
  return "un";
}

/** Lee el valor numérico de la propiedad indicada por `source` entre los
 *  Property Sets del elemento. `source.pset` vacío = cualquier PSet. Comparación
 *  de nombres sin distinguir mayúsculas. `null` si no está o no es numérica. */
function readFromSource(
  psets: { name: string; properties: Record<string, string> }[],
  source: QuantitySource,
): number | null {
  const wantPset = source.pset.trim().toLowerCase();
  const wantProp = source.prop.trim().toLowerCase();
  if (!wantProp) return null;

  for (const pset of psets) {
    if (wantPset && pset.name.trim().toLowerCase() !== wantPset) continue;
    for (const [key, raw] of Object.entries(pset.properties)) {
      if (key.trim().toLowerCase() !== wantProp) continue;
      const value = parseFloat(raw);
      if (Number.isFinite(value)) return value;
    }
  }
  return null;
}

async function getQuantityFromPsets(
  modelId: string,
  localId: number,
  fragments: OBC.FragmentsManager,
  method: QuantityMethod,
  source?: QuantitySource | null,
): Promise<ExtractedQuantity | null> {
  const psets = await getPropertySets(modelId, localId, fragments);

  // 1. Fuente explícita configurada para el tipo (Configuración → Reglas):
  //    manda por sobre la búsqueda automática. Si el elemento no la trae, se
  //    sigue con la búsqueda por método (una selección mezclada igual computa).
  if (source?.prop) {
    const value = readFromSource(psets, source);
    if (value !== null) return { unidad: unidadForSource(method, source.prop), cantidad: value };
  }

  // 2. Búsqueda automática por método sobre los quantity sets del elemento.
  const quantitySets = psets.filter((p) => isQuantitySet(p.name));
  if (quantitySets.length === 0) return null;

  const candidates =
    method === "auto" ? AUTO_ORDER.map((m) => KEYS_BY_METHOD[m])
    : method === "cantidad" ? []
    : [KEYS_BY_METHOD[method]];

  for (const { unidad, keys } of candidates) {
    for (const key of keys) {
      for (const qset of quantitySets) {
        const raw = qset.properties[key];
        if (raw === undefined) continue;
        const value = parseFloat(raw);
        if (Number.isFinite(value)) return { unidad, cantidad: value };
      }
    }
  }
  return null;
}

/**
 * Área de UNA cara de un elemento laminar (pared, losa, chapa), calculada
 * directamente de su geometría triangulada — respaldo para cuando el modelo no
 * trae quantity sets IFC (`Qto_*`), algo muy común en la práctica. Ni
 * `@thatopen/fragments` ni `@thatopen/components` exponen un método nativo de
 * "área de superficie" (`MeasurementUtils` solo trae `getItemsVolume`), así que
 * se arma acá.
 *
 * Método, por cada *sample* de la geometría del elemento (ver abajo): se detecta
 * el eje "espesor" (el de mayor Σ|n·eje|·área entre x/y/z — el eje contra el que
 * se enfrentan las dos caras grandes) y se suma el área de TODOS los triángulos
 * que miran hacia un lado de ese eje. Sumar un lado entero da la superficie
 * desarrollada real: en una chapa ondulada / "perfilada" cada tramo de la onda
 * tiene una normal distinta pero todos caen del mismo lado del eje espesor. Para
 * una pared los bordes (canto superior/inferior/extremos) tienen la normal
 * perpendicular al eje espesor → quedan afuera, así que da ~una cara.
 *
 * `getTriangles()` devuelve un arreglo por cada *sample* de la geometría del
 * elemento. En los export de Revit un mismo muro/losa suele traer varios samples
 * casi coincidentes (capas del material, o la misma malla repetida por
 * representación) y TODOS ocupan el mismo lugar. Sumar los samples multiplicaba
 * el área por su cantidad (un muro de 18 m² con 6 samples daba ~107 — este era
 * el bug). Por eso se mide cada sample por separado y se toma el MÁXIMO: las
 * copias colapsan a una sola cara. (Un elemento partido en piezas realmente
 * disjuntas se subestimaría, pero ese caso casi siempre trae quantity set propio
 * y no llega hasta acá.)
 */
async function getDominantFaceArea(
  modelId: string,
  localId: number,
  fragments: OBC.FragmentsManager,
): Promise<number | null> {
  const model = fragments.list.get(modelId);
  if (!model) return null;

  try {
    const item = model.getItem(localId);
    const geometry = await item.getGeometry();
    if (!geometry) return null;

    const trianglesBySample = await geometry.getTriangles();
    if (!trianglesBySample) return null;

    const normal = new THREE.Vector3();
    let best = 0;

    for (const triangles of trianglesBySample) {
      const axisWeight = [0, 0, 0]; // Σ |n·eje|·área → eje "espesor" de este sample
      const areaPos = [0, 0, 0];    // área de triángulos con n·eje > 0
      const areaNeg = [0, 0, 0];    // ídem con n·eje < 0
      let total = 0;

      for (const tri of triangles) {
        const area = tri.getArea();
        if (!Number.isFinite(area) || area <= 0) continue;
        tri.getNormal(normal);
        if (normal.lengthSq() === 0) continue;
        total += area;
        for (let a = 0; a < 3; a++) {
          const c = normal.getComponent(a);
          axisWeight[a] += Math.abs(c) * area;
          if (c > 0) areaPos[a] += area;
          else if (c < 0) areaNeg[a] += area;
        }
      }

      if (total === 0) continue;

      let axis = 0;
      if (axisWeight[1] > axisWeight[axis]) axis = 1;
      if (axisWeight[2] > axisWeight[axis]) axis = 2;

      const face = Math.max(areaPos[axis], areaNeg[axis]);
      // `total / 2` cubre una malla cerrada sin un eje espesor claro (elemento
      // macizo, no laminar): la mitad de la superficie total.
      const sampleArea = face > 0 ? face : total / 2;
      if (sampleArea > best) best = sampleArea;
    }

    return best > 0 ? best : null;
  } catch {
    return null;
  }
}

function refToLocalId(ref: any): number | null {
  if (typeof ref === "number") return ref;
  if (ref && typeof ref === "object") {
    if (typeof ref.value === "number") return ref.value;
    return getExpressId(ref);
  }
  return null;
}

/** localIds de los componentes que descomponen a un elemento contenedor:
 *  `IsDecomposedBy`/`IsNestedBy` → `IfcRelAggregates`/`IfcRelNests` →
 *  `RelatedObjects`, ej. las chapas `IfcPlate` o la losa `IfcSlab` que agregan
 *  un `IfcRoof`. Ojo: `model.getItemsChildren()` devuelve la estructura
 *  *espacial* (un `IfcRoof` es hoja ahí), no la descomposición — hay que leer
 *  la relación a mano. Se ignora la auto-referencia por las dudas. */
async function getAggregatedChildrenIds(
  modelId: string,
  localId: number,
  fragments: OBC.FragmentsManager,
): Promise<number[]> {
  const model = fragments.list.get(modelId);
  if (!model) return [];
  try {
    const itemData = await getItemData(model, localId, true);
    if (!itemData) return [];

    const rels: any[] = [
      ...(Array.isArray(itemData.IsDecomposedBy) ? itemData.IsDecomposedBy : []),
      ...(Array.isArray(itemData.IsNestedBy) ? itemData.IsNestedBy : []),
    ];

    const ids = new Set<number>();
    for (const relRef of rels) {
      let rel = relRef;
      if (typeof relRef === "number" || (relRef && typeof relRef.value === "number")) {
        rel = await getItemData(model, refToLocalId(relRef)!, true);
      }
      const related = rel?.RelatedObjects;
      const relatedArr = Array.isArray(related) ? related : related ? [related] : [];
      for (const childRef of relatedArr) {
        const childId = refToLocalId(childRef);
        if (childId !== null && childId !== localId) ids.add(childId);
      }
    }
    return [...ids];
  } catch {
    return [];
  }
}

/** Magnitud de un elemento a partir de lo que trae él mismo: quantity sets
 *  IFC primero, respaldo geométrico de área después. NO baja a sus
 *  componentes — eso lo hace `getElementQuantity`.
 *
 *  `preferGeometry` (checkbox "Calcular desde geometría" de la regla del
 *  tipo): saltea los Property Sets y calcula directo de la geometría. Como el
 *  cálculo geométrico solo produce área, para métodos de volumen/longitud no
 *  hay nada que calcular y se devuelve `null` (el ítem cae a carga manual). */
async function getOwnElementQuantity(
  modelId: string,
  localId: number,
  fragments: OBC.FragmentsManager,
  method: QuantityMethod,
  source?: QuantitySource | null,
  preferGeometry = false,
): Promise<ExtractedQuantity | null> {
  if (!preferGeometry) {
    const fromPsets = await getQuantityFromPsets(modelId, localId, fragments, method, source);
    if (fromPsets) return fromPsets;
  }

  // El respaldo geométrico solo tiene sentido para tipos que se miden por
  // área (o sin regla conocida, "auto") — un tipo que se mide por volumen o
  // longitud no debe terminar reportando el área de su cara más grande.
  if (method === "area" || method === "area_bruta" || method === "auto") {
    const area = await getDominantFaceArea(modelId, localId, fragments);
    if (area !== null && area > 0) return { unidad: "m2", cantidad: area };
  }

  return null;
}

/** Suma de magnitudes con la misma unidad, tomando la unidad del primer
 *  resultado — mismo criterio que `getQuantityForSelection`. */
function sumSameUnit(quantities: (ExtractedQuantity | null)[]): ExtractedQuantity | null {
  const found = quantities.filter((q): q is ExtractedQuantity => q !== null);
  if (found.length === 0) return null;
  const unidad = found[0].unidad;
  const cantidad = found
    .filter((q) => q.unidad === unidad)
    .reduce((sum, q) => sum + q.cantidad, 0);
  return cantidad > 0 ? { unidad, cantidad } : null;
}

/** Suma la magnitud (solo lo propio de cada uno, sin volver a bajar otro
 *  nivel) de los componentes que descomponen a `localId`. `null` si no está
 *  descompuesto o si ningún componente arroja una magnitud. */
async function getAggregatedChildrenQuantity(
  modelId: string,
  localId: number,
  fragments: OBC.FragmentsManager,
  method: QuantityMethod,
  preferGeometry = false,
): Promise<ExtractedQuantity | null> {
  const childIds = await getAggregatedChildrenIds(modelId, localId, fragments);
  if (childIds.length === 0) return null;
  const childQuantities = await Promise.all(
    childIds.map((childId) =>
      getOwnElementQuantity(modelId, childId, fragments, method, null, preferGeometry).catch(() => null),
    ),
  );
  return sumSameUnit(childQuantities);
}

async function getElementQuantity(
  modelId: string,
  localId: number,
  fragments: OBC.FragmentsManager,
  method: QuantityMethod,
  source?: QuantitySource | null,
  preferGeometry = false,
): Promise<ExtractedQuantity | null> {
  // Cubiertas (`area_bruta` es la regla de IFCROOF / IFCSLAB:ROOF): se prueba
  // PRIMERO sumar los componentes (chapas IfcPlate, losas IfcSlab que agrega el
  // IfcRoof). Esa suma es el área real de chapa desarrollada; la cantidad
  // propia del IfcRoof suele ser solo `ProjectedArea` (proyección horizontal,
  // subestima una cubierta inclinada) o una cara geométrica mal agrupada.
  // Sin esto, un techo-como-agregado caía al conteo de piezas ("2 m²" al
  // seleccionar 2 techos en vez de la suma de las áreas de la chapa).
  // Excepción: si el usuario configuró a mano una fuente de PSet para el tipo,
  // manda esa — se lee del propio elemento antes de bajar a los componentes.
  if (method === "area_bruta" && !source?.prop) {
    const fromChildren = await getAggregatedChildrenQuantity(modelId, localId, fragments, method, preferGeometry);
    if (fromChildren) return fromChildren;
  }

  const own = await getOwnElementQuantity(modelId, localId, fragments, method, source, preferGeometry);
  if (own) return own;

  // Resto de contenedores sin quantity set ni geometría propia: último recurso,
  // sumar la magnitud de sus componentes.
  return getAggregatedChildrenQuantity(modelId, localId, fragments, method, preferGeometry);
}

/**
 * Suma la magnitud de cantidad (m², m³, ml o unidades) de todos los
 * elementos seleccionados, según el método de cuantificación del tipo IFC
 * (ver ifc-quantity-rules.ts). Si el método es "cantidad" se cuenta
 * directamente, sin ir a buscar quantity sets. Para el resto, si ningún
 * elemento tiene quantity sets IFC (`Qto_*`/BaseQuantities) — muy común en
 * modelos reales — devuelve null y el llamador cae a carga manual (cantidad
 * = cant. de elementos seleccionados, editable).
 */
export async function getQuantityForSelection(
  modelIdMap: OBC.ModelIdMap,
  fragments: OBC.FragmentsManager,
  tipoIfc: string | null,
  predefinedType?: string | null,
): Promise<ExtractedQuantity | null> {
  const pairs: { modelId: string; localId: number }[] = [];
  for (const [modelId, ids] of Object.entries(modelIdMap)) {
    for (const localId of ids) pairs.push({ modelId, localId });
  }
  if (pairs.length === 0) return null;

  const method = getQuantityMethod(tipoIfc, predefinedType);
  const adjust = getQuantityAdjust(tipoIfc, predefinedType);

  // Fórmula del usuario ("macro") sobre el valor final ya medido: `x` = la
  // cantidad medida. Ej. `x * 0.9` para descontar 10% por solapamiento en
  // cubiertas. Se aplica a la suma total de la selección (no elemento por
  // elemento), y nunca deja la cantidad negativa. Una fórmula inválida se
  // ignora (el campo ya avisa en Configuración).
  const applyFactor = (q: ExtractedQuantity | null): ExtractedQuantity | null => {
    const formula = adjust?.factor?.trim();
    if (!q || !formula) return q;
    const adjusted = evalQuantityFormula(formula, q.cantidad);
    if (adjusted === null) return q;
    return { unidad: q.unidad, cantidad: Math.max(0, adjusted) };
  };

  if (method === "cantidad") return applyFactor({ unidad: "un", cantidad: pairs.length });

  // Si la regla pide calcular desde geometría, la fuente explícita de PSet no
  // aplica (son criterios contradictorios y geometría manda).
  const preferGeometry = adjust?.geometry ?? false;
  const source = preferGeometry ? null : getQuantitySource(tipoIfc, predefinedType);
  const quantities = await Promise.all(
    pairs.map(({ modelId, localId }) =>
      getElementQuantity(modelId, localId, fragments, method, source, preferGeometry)),
  );

  return applyFactor(sumSameUnit(quantities));
}
