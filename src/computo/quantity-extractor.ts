import * as OBC from "@thatopen/components";
import { getPropertySets } from "../ifc/properties";

export interface ExtractedQuantity {
  unidad: string;
  cantidad: number;
}

// Orden de prioridad: la primera magnitud con datos en el Qto_ del elemento
// gana. Varias claves por unidad porque distintos exportadores IFC nombran
// las quantities de forma distinta (Net vs Gross, con o sin prefijo).
const QUANTITY_KEYS_BY_UNIT: { unidad: string; keys: string[] }[] = [
  { unidad: "m2", keys: ["NetArea", "GrossArea", "Area"] },
  { unidad: "m3", keys: ["NetVolume", "GrossVolume", "Volume"] },
  { unidad: "ml", keys: ["Length", "NetLength", "Perimeter"] },
  { unidad: "un", keys: ["Count"] },
];

function isQuantitySet(name: string): boolean {
  return /^qto_/i.test(name) || /basequantities/i.test(name);
}

async function getElementQuantity(
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
