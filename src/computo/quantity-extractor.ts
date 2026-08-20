import * as THREE from "three";
import * as OBC from "@thatopen/components";
import { getPropertySets } from "../ifc/properties";

export interface ExtractedQuantity {
  unidad: string;
  cantidad: number;
}

// Orden de prioridad: la primera magnitud con datos en el Qto_ del elemento
// gana. Varias claves por unidad porque distintos exportadores IFC nombran
// las quantities de forma distinta (Net vs Gross, con o sin prefijo).
// "SideArea"/"FootprintArea" van primero porque son las claves reales que usa
// el schema IFC para paredes/losas (Qto_WallBaseQuantities, etc.) — "Area" a
// secas casi nunca aparece; dejarlo como único candidato hacía que las
// paredes nunca encontraran su área y cayeran al respaldo por conteo.
const QUANTITY_KEYS_BY_UNIT: { unidad: string; keys: string[] }[] = [
  { unidad: "m2", keys: ["NetSideArea", "GrossSideArea", "NetFootprintArea", "GrossFootprintArea", "NetArea", "GrossArea", "Area"] },
  { unidad: "m3", keys: ["NetVolume", "GrossVolume", "Volume"] },
  { unidad: "ml", keys: ["Length", "NetLength", "Perimeter"] },
  { unidad: "un", keys: ["Count"] },
];

/**
 * Clases IFC que se miden por pieza ("un") aunque tengan área/volumen
 * geométrico propio — una ventana o una puerta ocupan una superficie física,
 * pero en un cómputo se cuentan, no se miden. Para estas categorías no tiene
 * sentido ni buscar Qto_*Area/Volume ni calcular área por geometría: la
 * cantidad es directamente la cantidad de elementos del ítem.
 */
const COUNTED_CATEGORIES = new Set([
  "IFCWINDOW",
  "IFCDOOR",
  "IFCFURNISHINGELEMENT",
  "IFCFURNITURE",
  "IFCSANITARYTERMINAL",
  "IFCLIGHTFIXTURE",
  "IFCOUTLET",
  "IFCSWITCHINGDEVICE",
  "IFCFLOWTERMINAL",
  "IFCSTAIRFLIGHT",
  "IFCRAMPFLIGHT",
]);

// IFC4 tiene variantes "StandardCase" de varias entidades (IfcWindowStandardCase,
// IfcDoorStandardCase, etc.) que muchos exportadores (Revit incluido) emiten en
// vez de la entidad simple cuando la geometría sigue la representación
// estándar — sin normalizar esto, una ventana exportada como
// "IFCWINDOWSTANDARDCASE" no matcheaba contra "IFCWINDOW" y se seguía
// midiendo por área.
function normalizeCategory(tipoIfc: string): string {
  const upper = tipoIfc.toUpperCase();
  return upper.endsWith("STANDARDCASE") ? upper.slice(0, -"STANDARDCASE".length) : upper;
}

export function isCountedCategory(tipoIfc: string | null): boolean {
  return !!tipoIfc && COUNTED_CATEGORIES.has(normalizeCategory(tipoIfc));
}

function isQuantitySet(name: string): boolean {
  return /^qto_/i.test(name) || /basequantities/i.test(name);
}

async function getQuantityFromPsets(
  modelId: string,
  localId: number,
  fragments: OBC.FragmentsManager,
): Promise<ExtractedQuantity | null> {
  const psets = await getPropertySets(modelId, localId, fragments);
  const quantitySets = psets.filter((p) => isQuantitySet(p.name));
  if (quantitySets.length === 0) return null;

  for (const { unidad, keys } of QUANTITY_KEYS_BY_UNIT) {
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
 * Área de la cara dominante de un elemento, calculada directamente de su
 * geometría triangulada — respaldo para cuando el modelo no trae quantity
 * sets IFC (`Qto_*`), algo muy común en la práctica. Ni `@thatopen/fragments`
 * ni `@thatopen/components` exponen un método nativo de "área de superficie"
 * (`MeasurementUtils` solo trae `getItemsVolume`, no área), así que se arma
 * acá: se agrupan los triángulos por dirección de normal (cuantizada, para
 * tolerar la triangulación) y se suma el área de cada grupo — cada grupo
 * representa una cara plana del elemento. Una pared tiene dos caras grandes
 * con normales opuestas (frente/dorso) más los bordes (arriba, abajo,
 * extremos), de área mucho menor: devolver el grupo con más área da el área
 * de UNA sola cara, no la suma de ambas.
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

    const trianglesByTile = await geometry.getTriangles();
    if (!trianglesByTile) return null;

    const areaByNormalKey = new Map<string, number>();
    const normal = new THREE.Vector3();

    for (const triangles of trianglesByTile) {
      for (const tri of triangles) {
        const area = tri.getArea();
        if (!Number.isFinite(area) || area <= 0) continue;
        tri.getNormal(normal);
        if (normal.lengthSq() === 0) continue;
        // Cuantizado a 1 decimal: agrupa triángulos casi-coplanares de la
        // misma cara (tolera ruido de triangulación) sin depender de que el
        // elemento esté alineado a los ejes globales — se agrupa por la
        // dirección real de la normal, no contra ejes fijos, así que
        // funciona igual para una pared rotada o inclinada.
        const key = `${normal.x.toFixed(1)}_${normal.y.toFixed(1)}_${normal.z.toFixed(1)}`;
        areaByNormalKey.set(key, (areaByNormalKey.get(key) ?? 0) + area);
      }
    }

    if (areaByNormalKey.size === 0) return null;
    return Math.max(...areaByNormalKey.values());
  } catch {
    return null;
  }
}

async function getElementQuantity(
  modelId: string,
  localId: number,
  fragments: OBC.FragmentsManager,
): Promise<ExtractedQuantity | null> {
  const fromPsets = await getQuantityFromPsets(modelId, localId, fragments);
  if (fromPsets) return fromPsets;

  const area = await getDominantFaceArea(modelId, localId, fragments);
  if (area !== null && area > 0) return { unidad: "m2", cantidad: area };

  return null;
}

/**
 * Suma la magnitud de cantidad (m², m³, ml o unidades) de todos los
 * elementos seleccionados, siempre que compartan el mismo tipo de magnitud
 * detectado en el primero que traiga datos. Si ningún elemento tiene
 * quantity sets IFC (`Qto_*`/BaseQuantities) — muy común en modelos reales —
 * devuelve null y el llamador cae a carga manual (cantidad = cant. de
 * elementos seleccionados, editable).
 */
export async function getQuantityForSelection(
  modelIdMap: OBC.ModelIdMap,
  fragments: OBC.FragmentsManager,
): Promise<ExtractedQuantity | null> {
  const pairs: { modelId: string; localId: number }[] = [];
  for (const [modelId, ids] of Object.entries(modelIdMap)) {
    for (const localId of ids) pairs.push({ modelId, localId });
  }
  if (pairs.length === 0) return null;

  const quantities = await Promise.all(
    pairs.map(({ modelId, localId }) => getElementQuantity(modelId, localId, fragments)),
  );

  const found = quantities.filter((q): q is ExtractedQuantity => q !== null);
  if (found.length === 0) return null;

  const unidad = found[0].unidad;
  const cantidad = found.filter((q) => q.unidad === unidad).reduce((sum, q) => sum + q.cantidad, 0);
  return { unidad, cantidad };
}
