import * as THREE from "three";
import * as OBC from "@thatopen/components";

/**
 * Modos de visualización de la escena:
 *  - normal    → geometría sólida tal cual.
 *  - wireframe → vista alámbrica (solo aristas de la malla).
 *  - xray      → todos los modelos translúcidos ("rayos X"), para ver
 *                instalaciones/estructura a través de la envolvente.
 *
 * Además de este modo global, cada modelo puede tener una opacidad propia
 * (control por fila en el árbol "Escena"), que manda sobre el modo global:
 * un modelo con opacidad 25% se ve translúcido aunque el modo sea "normal",
 * y se ve sólido si su override es 100% aunque el modo global sea "rayos X".
 */
export type GlobalViewMode = "normal" | "wireframe" | "xray";

/** Opacidad aplicada a todos los modelos en modo "Rayos X". */
const XRAY_OPACITY = 0.18;

/** Presets por los que cicla el botón de opacidad de cada modelo. */
export const MODEL_OPACITY_PRESETS = [1, 0.5, 0.25] as const;

export interface ViewModesState {
  globalMode: GlobalViewMode;
  /** [modelId, opacidad] — solo los modelos con override (< 1). */
  modelOpacity: [string, number][];
}

export interface ViewModesController {
  setGlobalMode: (mode: GlobalViewMode) => Promise<void>;
  getGlobalMode: () => GlobalViewMode;
  /** Fija la opacidad de un modelo (1 = opaco). */
  setModelOpacity: (modelId: string, opacity: number) => Promise<void>;
  getModelOpacity: (modelId: string) => number;
  /** Cicla la opacidad de un modelo por los presets (1 → 0.5 → 0.25 → 1). Devuelve el nuevo valor. */
  cycleModelOpacity: (modelId: string) => Promise<number>;
  /** Re-aplica el estado actual a un modelo (llamar tras cargarlo). */
  applyToModel: (model: FragmentsModelLike) => Promise<void>;
  serialize: () => ViewModesState;
  restore: (state: ViewModesState | undefined) => Promise<void>;
}

interface FragmentsModelLike {
  modelId: string;
  object: THREE.Object3D;
  onViewUpdated: { add: (cb: () => void) => void; remove: (cb: () => void) => void };
  setOpacity: (localIds: number[] | undefined, opacity: number) => Promise<void>;
  resetOpacity: (localIds: number[] | undefined) => Promise<void>;
}

export function createViewModesController(fragments: OBC.FragmentsManager): ViewModesController {
  let globalMode: GlobalViewMode = "normal";
  const modelOpacity = new Map<string, number>();
  /** Listeners de onViewUpdated activos por modelo mientras el modo es wireframe. */
  const wireListeners = new Map<string, () => void>();

  const getModel = (modelId: string) => fragments.list.get(modelId) as unknown as FragmentsModelLike | undefined;
  const allModels = () => [...fragments.list.values()] as unknown as FragmentsModelLike[];

  // — Wireframe —
  // No hay API nativa para forzar la vista alámbrica de un modelo entero, así
  // que se recorren las mallas y se togglea material.wireframe. Fragments crea
  // y descarta "tiles" (y por lo tanto mallas) dinámicamente según la cámara,
  // por eso mientras el modo esté activo re-aplicamos en cada onViewUpdated.
  const paintWireframe = (model: FragmentsModelLike, on: boolean): void => {
    model.object.traverse((child) => {
      const mesh = child as THREE.Mesh;
      if (!(mesh as unknown as { isMesh?: boolean }).isMesh) return;
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const mat of mats) {
        const m = mat as THREE.Material & { wireframe?: boolean };
        if (m.wireframe === undefined) continue; // materiales LOD sin soporte
        m.wireframe = on;
      }
    });
  };

  const enableWireSync = (model: FragmentsModelLike): void => {
    if (!wireListeners.has(model.modelId)) {
      const cb = () => paintWireframe(model, true);
      model.onViewUpdated.add(cb);
      wireListeners.set(model.modelId, cb);
    }
    paintWireframe(model, true);
  };

  const disableWireSync = (model: FragmentsModelLike): void => {
    const cb = wireListeners.get(model.modelId);
    if (cb) {
      model.onViewUpdated.remove(cb);
      wireListeners.delete(model.modelId);
    }
    paintWireframe(model, false);
  };

  // — Opacidad efectiva: override del modelo > modo global —
  const effectiveOpacity = (modelId: string): number => {
    const override = modelOpacity.get(modelId);
    if (override !== undefined) return override;
    return globalMode === "xray" ? XRAY_OPACITY : 1;
  };

  const applyOpacity = async (model: FragmentsModelLike): Promise<void> => {
    const opacity = effectiveOpacity(model.modelId);
    // setOpacity/resetOpacity corren en el worker y preservan el color
    // original, así que sobreviven al streaming de tiles sin re-aplicar.
    if (opacity >= 1) await model.resetOpacity(undefined);
    else await model.setOpacity(undefined, opacity);
  };

  const applyToModel = async (model: FragmentsModelLike): Promise<void> => {
    if (globalMode === "wireframe") enableWireSync(model);
    else disableWireSync(model);
    await applyOpacity(model);
  };

  const applyToAll = async (): Promise<void> => {
    for (const model of allModels()) await applyToModel(model);
    await fragments.core.update(true);
  };

  const setGlobalMode = async (mode: GlobalViewMode): Promise<void> => {
    if (mode === globalMode) return;
    globalMode = mode;
    await applyToAll();
  };

  const setModelOpacity = async (modelId: string, opacity: number): Promise<void> => {
    if (opacity >= 1) modelOpacity.delete(modelId);
    else modelOpacity.set(modelId, opacity);
    const model = getModel(modelId);
    if (!model) return;
    await applyOpacity(model);
    await fragments.core.update(true);
  };

  const cycleModelOpacity = async (modelId: string): Promise<number> => {
    const current = modelOpacity.get(modelId) ?? 1;
    const idx = MODEL_OPACITY_PRESETS.findIndex((v) => Math.abs(v - current) < 0.01);
    const next = MODEL_OPACITY_PRESETS[(idx + 1) % MODEL_OPACITY_PRESETS.length];
    await setModelOpacity(modelId, next);
    return next;
  };

  fragments.list.onItemDeleted.add((modelId: string) => {
    modelOpacity.delete(modelId);
    wireListeners.delete(modelId);
  });

  return {
    setGlobalMode,
    getGlobalMode: () => globalMode,
    setModelOpacity,
    getModelOpacity: (modelId) => modelOpacity.get(modelId) ?? 1,
    cycleModelOpacity,
    applyToModel: (model) => applyToModel(model as unknown as FragmentsModelLike),
    serialize: () => ({ globalMode, modelOpacity: [...modelOpacity.entries()] }),
    restore: async (state) => {
      globalMode = state?.globalMode ?? "normal";
      modelOpacity.clear();
      for (const [id, op] of state?.modelOpacity ?? []) modelOpacity.set(id, op);
      await applyToAll();
    },
  };
}
