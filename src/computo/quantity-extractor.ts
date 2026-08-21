import * as THREE from "three";
import * as OBC from "@thatopen/components";
import { getPropertySets } from "../ifc/properties";
import { getQuantityMethod, type QuantityMethod } from "./ifc-quantity-rules";

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
// Qué claves probar depende del método de cuantificación del tipo IFC (ver
// ifc-quantity-rules.ts): "auto" prueba las tres en este orden, cualquier
// otro método restringe la búsqueda a su propia magnitud.
const KEYS_BY_METHOD: Record<"area" | "volumen" | "longitud", { unidad: string; keys: string[] }> = {
  area: { unidad: "m2", keys: ["NetSideArea", "GrossSideArea", "NetFootprintArea", "GrossFootprintArea", "NetArea", "GrossArea", "Area"] },
  volumen: { unidad: "m3", keys: ["NetVolume", "GrossVolume", "Volume"] },
  longitud: { unidad: "ml", keys: ["Length", "NetLength", "Perimeter"] },
};
const AUTO_ORDER: ("area" | "volumen" | "longitud")[] = ["area", "volumen", "longitud"];

/** Ídem `getQuantityMethod(tipoIfc) === "cantidad"` — se mide por pieza
 *  ("un") aunque el elemento tenga área/volumen geométrico propio (una
 *  ventana o una puerta ocupan una superficie física, pero en un cómputo se
 *  cuentan, no se miden). */
export function isCountedCategory(tipoIfc: string | null): boolean {
  return getQuantityMethod(tipoIfc) === "cantidad";
}

function isQuantitySet(name: string): boolean {
  return /^qto_/i.test(name) || /basequantities/i.test(name);
}

async function getQuantityFromPsets(
  modelId: string,
  localId: number,
  fragments: OBC.FragmentsManager,
  method: QuantityMethod,
): Promise<ExtractedQuantity | null> {
  const psets = await getPropertySets(modelId, localId, fragments);
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
  method: QuantityMethod,
): Promise<ExtractedQuantity | null> {
  const fromPsets = await getQuantityFromPsets(modelId, localId, fragments, method);
  if (fromPsets) return fromPsets;

  // El respaldo geométrico solo tiene sentido para tipos que se miden por
  // área (o sin regla conocida, "auto") — un tipo que se mide por volumen o
  // longitud no debe terminar reportando el área de su cara más grande.
  if (method === "area" || method === "auto") {
    const area = await getDominantFaceArea(modelId, localId, fragments);
    if (area !== null && area > 0) return { unidad: "m2", cantidad: area };
  }

  return null;
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
): Promise<ExtractedQuantity | null> {
  const pairs: { modelId: string; localId: number }[] = [];
  for (const [modelId, ids] of Object.entries(modelIdMap)) {
    for (const localId of ids) pairs.push({ modelId, localId });
  }
  if (pairs.length === 0) return null;

  const method = getQuantityMethod(tipoIfc);
  if (method === "cantidad") return { unidad: "un", cantidad: pairs.length };

  const quantities = await Promise.all(
    pairs.map(({ modelId, localId }) => getElementQuantity(modelId, localId, fragments, method)),
  );

  const found = quantities.filter((q): q is ExtractedQuantity => q !== null);
  if (found.length === 0) return null;

  const unidad = found[0].unidad;
  const cantidad = found.filter((q) => q.unidad === unidad).reduce((sum, q) => sum + q.cantidad, 0);
  return { unidad, cantidad };
}
