import * as OBC from "@thatopen/components";
import { getPropertySets } from "./properties";
import { registerSeen } from "./pset-visibility";

// Cuántos elementos se procesan en paralelo — getPropertySets hace varios
// viajes de ida y vuelta al worker por elemento (getItemData de la relación,
// de cada Pset, del tipo...); recorrer todo secuencialmente (1 a la vez) es
// demasiado lento incluso en un modelo chico. Un pool moderado da la mayor
// parte de la mejora sin saturar al worker de mensajes en modelos grandes.
const CONCURRENCY = 12;

/**
 * Recorre todos los elementos visibles de todos los modelos cargados,
 * registrando cada PSet/propiedad que encuentre (ver `registerSeen`) — el
 * catálogo del Property Set Inspector (settings-modal.ts) se completa solo
 * a medida que el usuario selecciona elementos, lo cual puede dejar afuera
 * propiedades reales del modelo que todavía nadie clickeó (ej. una URL de
 * Pliego que solo tienen algunas ventanas). Esta función es la vía rápida
 * para no depender de ir clickeando elemento por elemento: se corre a
 * demanda (botón "Escanear modelo completo" en Configuración), no
 * automáticamente al cargar un modelo, porque recorrer cada elemento de un
 * modelo grande tiene un costo real.
 */
export async function scanAllModelsForPsets(
  fragments: OBC.FragmentsManager,
  onProgress?: (done: number, total: number) => void,
): Promise<{ elementos: number; psets: number }> {
  const pairs: { modelId: string; localId: number }[] = [];
  for (const [modelId, model] of fragments.list) {
    const visibleIds = await model.getItemsByVisibility(true);
    for (const localId of visibleIds) pairs.push({ modelId, localId });
  }

  const psetNames = new Set<string>();
  let done = 0;
  let cursor = 0;

  async function worker(): Promise<void> {
    while (cursor < pairs.length) {
      const { modelId, localId } = pairs[cursor++];
      const psets = await getPropertySets(modelId, localId, fragments);
      for (const pset of psets) {
        registerSeen(pset.name, Object.keys(pset.properties));
        psetNames.add(pset.name);
      }
      done += 1;
      onProgress?.(done, pairs.length);
    }
  }

  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, pairs.length) }, worker));

  return { elementos: pairs.length, psets: psetNames.size };
}
