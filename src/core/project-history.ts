import * as OBC from "@thatopen/components";
import { HistoryManager } from "./history";
import { toast } from "../ui/toast";
import type { LeftPanel } from "../ui/left-panel/index";
import type { SerializedDataLayers } from "../ui/left-panel/data-layers-tree";
import type { CotaTool } from "../tools/cota-tool";
import type { DrawTool } from "../tools/draw-tool";
import type { WorldLabelTool } from "../tools/world-label-tool";
import type { ComputoTool } from "../tools/computo-tool";

/**
 * Ventana (ms) durante la que se agrupan los cambios en un único paso
 * deshacible. Un gesto de usuario suele disparar varios eventos seguidos (ej.
 * agregar un ítem de cómputo: `onItemAdded` + `onItemChanged` tras sembrar
 * campos y recalcular cantidad; o crear una cota: evento de la tool + varios
 * re-render del árbol), y también sirve para fusionar ediciones inline
 * consecutivas. Valor conservador: dos gestos separados por más de esto quedan
 * como dos pasos.
 */
const COMMIT_DELAY_MS = 250;

/** Superficie mínima que consume la toolbar para pintar los botones. */
export interface HistoryControls {
  undo: () => void;
  redo: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;
  undoLabel: () => string | null;
  redoLabel: () => string | null;
  onChange: (cb: () => void) => void;
}

export interface ProjectHistory {
  history: HistoryManager;
  controls: HistoryControls;
  /** Fija el snapshot base. Llamar una vez, con la escena inicial ya armada. */
  begin: () => void;
  /** Vacía el historial y re-sincroniza el snapshot base (post carga / nuevo proyecto). */
  reset: () => void;
  /** Suspende la grabación mientras corre `fn` (carga masiva de proyecto). */
  suspendWhile: <T>(fn: () => Promise<T> | T) => Promise<T>;
}

/**
 * Undo / redo a nivel proyecto (Ctrl+Z / Ctrl+Shift+Z).
 *
 * Enfoque: cada paso deshacible guarda un snapshot serializado del estado
 * editable (capas de datos + todo lo que anidan: cotas, cortes, etiquetas,
 * trazos, ítems y categorías de cómputo, y la asignación de cada uno a su
 * capa) usando el `serializeDataLayers` / `restoreDataLayers` que ya existe
 * para guardar el proyecto. Deshacer = restaurar el snapshot anterior.
 *
 * La detección de "hubo un cambio" combina los eventos de cada herramienta
 * (`onItemAdded` / `onItemChanged` / `onItemDeleted`) con un aviso genérico de
 * mutación del árbol de capas (`onDataLayersMutated`: cubre drag & drop entre
 * capas, crear/renombrar/borrar capa, togglear visibilidad…), todo agrupado
 * con un debounce y contrastado contra el último snapshot: un re-render sin
 * cambios reales (expandir/colapsar un nodo) no genera ningún paso.
 *
 * BCF topics: quedan **fuera** del historial. El store nativo de @thatopen no
 * se puede reconstruir desde el snapshot (a diferencia de cotas/cortes/etc.),
 * así que un undo/redo nunca los crea, borra ni reasigna — se preserva siempre
 * el estado vivo de los topics y las capas que los alojan.
 */
export function setupProjectHistory(deps: {
  leftPanel: Pick<LeftPanel, "serializeDataLayers" | "restoreDataLayers" | "onDataLayersMutated">;
  cotas: CotaTool;
  drawings: DrawTool;
  labels: WorldLabelTool;
  clipper: OBC.Clipper;
  computos: ComputoTool;
}): ProjectHistory {
  const history = new HistoryManager();

  const capture = (): SerializedDataLayers => deps.leftPanel.serializeDataLayers();

  /**
   * Clave de comparación de dos snapshots: ignora lo que NO debe generar un
   * paso de undo — los BCF topics (no participan del historial) y el estado de
   * vista del árbol (flags `expanded`, capa activa).
   */
  const cmpKey = (s: SerializedDataLayers): string => {
    const layers = s.layers.map((l) => ({
      id: l.id, name: l.name, collectionId: l.collectionId, hidden: l.hidden,
    }));
    return JSON.stringify({
      layers,
      sections: s.sections,
      labels: s.labels,
      drawings: s.drawings,
      cotas: s.cotas,
      computo: s.computo,
      computoCategorias: s.computoCategorias ?? [],
    });
  };

  /**
   * Restaura `target`, pero re-inyectando el estado VIVO de los BCF topics y
   * garantizando que las capas que los alojan sobrevivan aunque el snapshot no
   * las tenga (así un undo nunca "pierde" un topic del árbol).
   */
  function apply(target: SerializedDataLayers): void {
    const snap: SerializedDataLayers = JSON.parse(JSON.stringify(target));
    const live = capture();

    const layerIds = new Set(snap.layers.map((l) => l.id));
    for (const t of live.topics) {
      if (!layerIds.has(t.layerId)) {
        const host = live.layers.find((l) => l.id === t.layerId);
        if (host) {
          snap.layers.push(host);
          layerIds.add(host.id);
        }
      }
    }
    snap.topics = live.topics;

    deps.leftPanel.restoreDataLayers(snap);
    committed = capture();
    committedKey = cmpKey(committed);
  }

  /** Último estado ya registrado en el historial. */
  let committed: SerializedDataLayers | null = null;
  let committedKey = "";
  let started = false;

  let pendingLabel: string | null = null;
  let timer: number | null = null;

  function clearTimer(): void {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  }

  /** Cierra la ventana de agrupamiento: si el estado cambió de verdad, apila el paso. */
  function flush(): void {
    clearTimer();
    if (!started || history.isApplying) {
      pendingLabel = null;
      return;
    }
    const label = pendingLabel ?? "Cambio";
    pendingLabel = null;

    const after = capture();
    const afterKey = cmpKey(after);
    if (!committed) {
      committed = after;
      committedKey = afterKey;
      return;
    }
    if (afterKey === committedKey) return;

    const before = committed;
    committed = after;
    committedKey = afterKey;

    history.push({
      label,
      undo: () => apply(before),
      redo: () => apply(after),
    });
  }

  function markChange(label: string): void {
    if (!started || history.isApplying) return;
    if (pendingLabel === null) pendingLabel = label;
    if (timer !== null) clearTimeout(timer);
    timer = window.setTimeout(flush, COMMIT_DELAY_MS);
  }

  // — Eventos de cada herramienta: dan una etiqueta específica al paso —
  deps.cotas.onItemAdded.add(() => markChange("Agregar cota"));
  deps.cotas.onItemDeleted.add(() => markChange("Eliminar cota"));

  deps.drawings.onItemAdded.add(() => markChange("Agregar trazo"));
  deps.drawings.onItemDeleted.add(() => markChange("Eliminar trazo"));

  deps.labels.onItemAdded.add(() => markChange("Agregar etiqueta"));
  deps.labels.onItemDeleted.add(() => markChange("Eliminar etiqueta"));

  deps.clipper.onAfterCreate.add(() => markChange("Agregar corte"));
  deps.clipper.list.onItemDeleted.add(() => markChange("Eliminar corte"));

  deps.computos.onItemAdded.add(() => markChange("Agregar ítem de cómputo"));
  deps.computos.onItemChanged.add(() => markChange("Editar cómputo"));
  deps.computos.onItemDeleted.add(() => markChange("Eliminar ítem de cómputo"));
  deps.computos.onCategoriaAdded.add(() => markChange("Agregar categoría"));
  deps.computos.onCategoriaChanged.add(() => markChange("Ordenar / editar categorías"));
  deps.computos.onCategoriaDeleted.add(() => markChange("Eliminar categoría"));

  // — Aviso genérico del árbol: cubre lo que no emite evento de tool (drag &
  //   drop entre capas, crear/renombrar/borrar capa, visibilidad…). El diff de
  //   `flush` descarta los re-render sin cambio real. —
  deps.leftPanel.onDataLayersMutated(() => markChange("Editar capas de datos"));

  const doUndo = (): void => {
    flush();
    if (!history.canUndo) return;
    const label = history.undoLabel;
    void history.undo().then(() => {
      if (label) toast.info(`Deshecho: ${label.toLowerCase()}`, { duration: 2200 });
    });
  };

  const doRedo = (): void => {
    flush();
    if (!history.canRedo) return;
    const label = history.redoLabel;
    void history.redo().then(() => {
      if (label) toast.info(`Rehecho: ${label.toLowerCase()}`, { duration: 2200 });
    });
  };

  setupShortcuts(doUndo, doRedo);

  const controls: HistoryControls = {
    undo: doUndo,
    redo: doRedo,
    canUndo: () => history.canUndo,
    canRedo: () => history.canRedo,
    undoLabel: () => history.undoLabel,
    redoLabel: () => history.redoLabel,
    onChange: (cb) => history.onChange.add(cb),
  };

  const syncBaseline = (): void => {
    clearTimer();
    pendingLabel = null;
    committed = capture();
    committedKey = cmpKey(committed);
    started = true;
  };

  return {
    history,
    controls,
    begin: syncBaseline,
    reset: () => {
      history.clear();
      syncBaseline();
    },
    suspendWhile: (fn) => history.suspendWhile(fn),
  };
}

/**
 * Ctrl+Z / Ctrl+Shift+Z (y Ctrl+Y como alias de rehacer) a nivel ventana, en
 * fase de captura para ganarle a los handlers de @thatopen/ui. Si el foco está
 * en un campo de texto con una edición sin confirmar (valor ≠ el renderizado),
 * se cede el atajo al undo nativo del campo.
 */
function setupShortcuts(undo: () => void, redo: () => void): void {
  window.addEventListener(
    "keydown",
    (e) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
      const isUndo = e.code === "KeyZ" && !e.shiftKey;
      const isRedo = (e.code === "KeyZ" && e.shiftKey) || (e.code === "KeyY" && !e.shiftKey);
      if (!isUndo && !isRedo) return;

      const target = e.composedPath()[0];
      const editingText =
        (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) &&
        target.value !== target.defaultValue;
      if (editingText) return;

      e.preventDefault();
      if (isRedo) redo();
      else undo();
    },
    { capture: true },
  );
}
