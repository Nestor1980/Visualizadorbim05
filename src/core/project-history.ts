import * as OBC from "@thatopen/components";
import { HistoryManager } from "./history";
import { toast } from "../ui/toast";
import type { LeftPanel } from "../ui/left-panel/index";
import type { CotaTool } from "../tools/cota-tool";
import type { DrawTool } from "../tools/draw-tool";
import type { WorldLabelTool } from "../tools/world-label-tool";
import type { ComputoTool } from "../tools/computo-tool";

/**
 * Ventana (ms) durante la que se agrupan los eventos de herramienta en un
 * único paso deshacible. Un gesto de usuario suele disparar varios eventos
 * seguidos (ej. agregar un ítem de cómputo: `onItemAdded` + `onItemChanged`
 * tras sembrar campos y recalcular cantidad), y también sirve para fusionar
 * ediciones inline consecutivas en la tabla. Es un valor conservador: dos
 * gestos realmente distintos separados por más de esto quedan como dos pasos.
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
 * Enfoque: cada paso deshacible guarda un snapshot serializado completo del
 * estado editable (capas de datos + todo lo que anidan: cotas, cortes,
 * etiquetas, trazos, ítems de cómputo y categorías) mediante el
 * `serializeDataLayers` / `restoreDataLayers` que ya existe para guardar el
 * proyecto. Deshacer = restaurar el snapshot anterior.
 *
 * La detección de "hubo un cambio" es por escucha de los eventos de cada
 * herramienta (`onItemAdded` / `onItemChanged` / `onItemDeleted`, etc.),
 * agrupados con un pequeño debounce. Quedan fuera del historial, por ahora,
 * las mutaciones que no emiten evento: renombrar una cota/corte/etiqueta,
 * togglear su visibilidad y mover un plano de corte con el gizmo.
 */
export function setupProjectHistory(deps: {
  leftPanel: Pick<LeftPanel, "serializeDataLayers" | "restoreDataLayers">;
  cotas: CotaTool;
  drawings: DrawTool;
  labels: WorldLabelTool;
  clipper: OBC.Clipper;
  computos: ComputoTool;
}): ProjectHistory {
  const history = new HistoryManager();

  const snap = (): string => JSON.stringify(deps.leftPanel.serializeDataLayers());

  /** Snapshot del último estado ya registrado en el historial. */
  let committed = "";
  let started = false;

  let pendingLabel: string | null = null;
  let timer: number | null = null;

  function applyJson(json: string): void {
    deps.leftPanel.restoreDataLayers(JSON.parse(json));
    committed = json;
  }

  function clearTimer(): void {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  }

  /** Cierra la ventana de agrupamiento: si el estado cambió, apila el paso. */
  function flush(): void {
    clearTimer();
    if (!started || history.isApplying) {
      pendingLabel = null;
      return;
    }
    const label = pendingLabel ?? "Cambio";
    pendingLabel = null;

    const after = snap();
    if (after === committed) return;
    const before = committed;
    committed = after;

    history.push({
      label,
      undo: () => applyJson(before),
      redo: () => applyJson(after),
    });
  }

  function markChange(label: string): void {
    if (!started || history.isApplying) return;
    if (pendingLabel === null) pendingLabel = label;
    if (timer !== null) clearTimeout(timer);
    timer = window.setTimeout(flush, COMMIT_DELAY_MS);
  }

  // — Suscripciones a los eventos de cada herramienta —
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

  return {
    history,
    controls,
    begin: () => {
      committed = snap();
      started = true;
    },
    reset: () => {
      clearTimer();
      pendingLabel = null;
      history.clear();
      committed = snap();
      started = true;
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
