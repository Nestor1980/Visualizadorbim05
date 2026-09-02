import * as OBC from "@thatopen/components";
import { HistoryManager } from "./history";
import { toast } from "../ui/toast";
import type { LeftPanel } from "../ui/left-panel/index";
import type { SerializedDataLayers } from "../ui/left-panel/data-layers-tree";
import type { CotaTool } from "../tools/cota-tool";
import type { DrawTool } from "../tools/draw-tool";
import type { WorldLabelTool } from "../tools/world-label-tool";
import type { ComputoTool } from "../tools/computo-tool";
import type { SectionTool } from "../tools/section-tool";

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
  /** Fija el snapshot base. Llamar una vez, con la escena inicial ya armada.
   *  Es async porque el snapshot de BCF topics se toma exportando el `.bcf`. */
  begin: () => Promise<void>;
  /** Vacía el historial y re-sincroniza el snapshot base (post carga / nuevo proyecto). */
  reset: () => Promise<void>;
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
 * BCF topics + comentarios: SÍ participan del historial, pero por una vía
 * aparte. El store nativo de @thatopen no se reconstruye desde el snapshot JSON,
 * así que cada paso guarda además los bytes del `.bcf` exportado (mismo
 * round-trip `export()` / `load()` que usa guardar/abrir proyecto). El undo
 * sólo re-inyecta ese `.bcf` cuando el estado vivo de topics difiere del
 * objetivo (comparado por una firma liviana), y avisa vía `onTopicsRestored`
 * para que la UI cierre la solapa de detalle (queda con una referencia stale).
 * Limitación: editar campos sueltos de un topic (título/estado desde el form)
 * no emite evento propio → esa edición no es un paso individual, pero viaja con
 * el siguiente gesto que sí dispare un flush.
 */
export function setupProjectHistory(deps: {
  leftPanel: Pick<LeftPanel, "serializeDataLayers" | "restoreDataLayers" | "onDataLayersMutated">;
  cotas: CotaTool;
  drawings: DrawTool;
  labels: WorldLabelTool;
  sectionTool: SectionTool;
  computos: ComputoTool;
  topics: OBC.BCFTopics;
  viewpoints: OBC.Viewpoints;
  world: OBC.World;
  /** Se llama tras un undo/redo que reconstruyó el store de topics: la UI debe
   *  cerrar la solapa de detalle abierta (su objeto `Topic` quedó stale). */
  onTopicsRestored: () => void;
}): ProjectHistory {
  const clipper = deps.sectionTool.clipper;
  const history = new HistoryManager();

  const capture = (): SerializedDataLayers => deps.leftPanel.serializeDataLayers();

  /**
   * Clave de comparación de la parte "capas de datos" de un snapshot: ignora lo
   * que NO debe generar un paso de undo — el estado de vista del árbol (flags
   * `expanded`, capa activa) y el mapeo topic→capa (viaja aparte, ver abajo).
   */
  const layersCmpKey = (s: SerializedDataLayers): string => {
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
   * Firma liviana y determinista del estado vivo de los BCF topics (incluye
   * comentarios). Sirve para dos cosas: detectar que "hubo un cambio de topic"
   * en el diff de `flush`, y decidir en `apply` si hace falta reconstruir el
   * store nativo desde el `.bcf` (operación cara y disruptiva) o ya coincide.
   */
  const topicsSignature = (): string => {
    const arr = [...deps.topics.list.values()].map((t) => ({
      guid: t.guid,
      title: t.title,
      description: t.description ?? "",
      status: t.status,
      type: t.type,
      priority: t.priority ?? "",
      stage: t.stage ?? "",
      assignedTo: t.assignedTo ?? "",
      dueDate: t.dueDate ? t.dueDate.getTime() : 0,
      labels: [...t.labels].sort(),
      viewpoints: [...t.viewpoints].sort(),
      comments: [...t.comments.values()]
        .map((c) => ({
          guid: c.guid,
          text: c.comment ?? "",
          viewpoint: c.viewpoint ?? "",
          date: c.date ? c.date.getTime() : 0,
          modified: c.modifiedDate ? c.modifiedDate.getTime() : 0,
        }))
        .sort((a, b) => a.guid.localeCompare(b.guid)),
    }));
    arr.sort((a, b) => a.guid.localeCompare(b.guid));
    return JSON.stringify(arr);
  };

  /** Bytes del `.bcf` con todos los topics vivos, o `null` si no hay ninguno. */
  const exportTopics = async (): Promise<Uint8Array | null> => {
    const all = [...deps.topics.list.values()];
    if (all.length === 0) return null;
    const blob = await deps.topics.export(all);
    return new Uint8Array(await blob.arrayBuffer());
  };

  /** Suscribe (una sola vez por objeto) los eventos de comentarios de un topic. */
  const wiredTopics = new WeakSet<OBC.Topic>();
  const wireTopicComments = (topic: OBC.Topic): void => {
    if (wiredTopics.has(topic)) return;
    wiredTopics.add(topic);
    topic.comments.onItemSet.add(() => markChange("Agregar comentario"));
    topic.comments.onItemUpdated.add(() => markChange("Editar comentario"));
    topic.comments.onItemDeleted.add(() => markChange("Eliminar comentario"));
  };
  const wireAllTopicComments = (): void => {
    for (const topic of deps.topics.list.values()) wireTopicComments(topic);
  };

  interface Snapshot {
    layers: SerializedDataLayers;
    topicsSig: string;
    topicsBcf: Uint8Array | null;
  }

  const fullKey = (snap: Snapshot): string =>
    layersCmpKey(snap.layers) + " " + snap.topicsSig;

  /**
   * Restaura `target`:
   *  1. si el estado vivo de topics difiere del objetivo, reconstruye el store
   *     nativo desde el `.bcf` guardado (clear + `topics.load`) y avisa a la UI;
   *  2. restaura las capas de datos (los topics ya están en su lugar, así que
   *     `restoreDataLayers` reasigna cada uno a su capa por guid);
   *  3. reconstruye el relleno en sección (vive fuera del árbol).
   */
  async function apply(target: Snapshot): Promise<void> {
    if (target.topicsSig !== topicsSignature()) {
      for (const guid of [...deps.topics.list.keys()]) deps.topics.list.delete(guid);
      if (target.topicsBcf) {
        await deps.topics.load(target.topicsBcf);
        for (const vp of deps.viewpoints.list.values()) if (!vp.world) vp.world = deps.world;
      }
      wireAllTopicComments();
      deps.onTopicsRestored();
    }

    const snap: SerializedDataLayers = JSON.parse(JSON.stringify(target.layers));
    deps.leftPanel.restoreDataLayers(snap);
    deps.sectionTool.rebuildSectionFills();

    committed = {
      layers: capture(),
      topicsSig: topicsSignature(),
      topicsBcf: target.topicsBcf,
    };
    committedKey = fullKey(committed);
  }

  /** Último estado ya registrado en el historial. */
  let committed: Snapshot | null = null;
  let committedKey = "";
  let started = false;

  let pendingLabel: string | null = null;
  let timer: number | null = null;
  /** Flush en vuelo: un `await flush()` espera al que ya corre en vez de lanzar
   *  otro en paralelo (exportar el `.bcf` es async). */
  let flushInFlight: Promise<void> | null = null;

  function clearTimer(): void {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  }

  /** Cierra la ventana de agrupamiento: si el estado cambió de verdad, apila el paso. */
  function flush(): Promise<void> {
    if (flushInFlight) return flushInFlight;
    flushInFlight = doFlush().finally(() => { flushInFlight = null; });
    return flushInFlight;
  }

  async function doFlush(): Promise<void> {
    clearTimer();
    if (!started || history.isApplying) {
      pendingLabel = null;
      return;
    }
    {
      const label = pendingLabel ?? "Cambio";
      pendingLabel = null;

      const afterLayers = capture();
      const afterSig = topicsSignature();
      const afterKey = layersCmpKey(afterLayers) + " " + afterSig;

      if (!committed) {
        committed = { layers: afterLayers, topicsSig: afterSig, topicsBcf: await exportTopics() };
        committedKey = afterKey;
        return;
      }
      if (afterKey === committedKey) return;

      const topicsChanged = afterSig !== committed.topicsSig;
      const before = committed;
      const afterBcf = topicsChanged ? await exportTopics() : committed.topicsBcf;
      // Un undo/redo pudo arrancar mientras se exportaba el .bcf: no apilar un
      // paso contra un estado que ya cambio.
      if (history.isApplying) return;
      const after: Snapshot = { layers: afterLayers, topicsSig: afterSig, topicsBcf: afterBcf };

      committed = after;
      committedKey = afterKey;

      history.push({
        label,
        undo: () => apply(before),
        redo: () => apply(after),
      });
    }
  }

  function markChange(label: string): void {
    if (!started || history.isApplying) return;
    if (pendingLabel === null) pendingLabel = label;
    if (timer !== null) clearTimeout(timer);
    timer = window.setTimeout(() => void flush(), COMMIT_DELAY_MS);
  }

  // — Eventos de cada herramienta: dan una etiqueta específica al paso —
  deps.cotas.onItemAdded.add(() => markChange("Agregar cota"));
  deps.cotas.onItemDeleted.add(() => markChange("Eliminar cota"));

  deps.drawings.onItemAdded.add(() => markChange("Agregar trazo"));
  deps.drawings.onItemDeleted.add(() => markChange("Eliminar trazo"));
  deps.drawings.onItemChanged.add(() => markChange("Editar trazo"));

  deps.labels.onItemAdded.add(() => markChange("Agregar etiqueta"));
  deps.labels.onItemDeleted.add(() => markChange("Eliminar etiqueta"));
  deps.labels.onItemChanged.add(() => markChange("Editar etiqueta"));

  clipper.onAfterCreate.add(() => markChange("Agregar corte"));
  clipper.list.onItemDeleted.add(() => markChange("Eliminar corte"));
  clipper.onAfterDrag.add(() => markChange("Mover corte"));

  deps.computos.onItemAdded.add(() => markChange("Agregar ítem de cómputo"));
  deps.computos.onItemChanged.add(() => markChange("Editar cómputo"));
  deps.computos.onItemDeleted.add(() => markChange("Eliminar ítem de cómputo"));
  deps.computos.onCategoriaAdded.add(() => markChange("Agregar categoría"));
  deps.computos.onCategoriaChanged.add(() => markChange("Ordenar / editar categorías"));
  deps.computos.onCategoriaDeleted.add(() => markChange("Eliminar categoría"));

  // — BCF topics + comentarios: crear/editar/eliminar topic vía `topics.list`,
  //   y crear/editar/eliminar comentario vía `topic.comments` (se cablea cada
  //   topic la primera vez que aparece, incluidos los que llegan por un load). —
  deps.topics.list.onItemSet.add(({ value }) => {
    wireTopicComments(value);
    markChange("Editar topic BCF");
  });
  deps.topics.list.onItemUpdated.add(() => markChange("Editar topic BCF"));
  deps.topics.list.onItemDeleted.add(() => markChange("Eliminar topic BCF"));

  // — Aviso genérico del árbol: cubre lo que no emite evento de tool (drag &
  //   drop entre capas, crear/renombrar/borrar capa, visibilidad…). El diff de
  //   `flush` descarta los re-render sin cambio real. —
  deps.leftPanel.onDataLayersMutated(() => markChange("Editar capas de datos"));

  // Un undo/redo ahora puede ser async (recarga del `.bcf`): sin este cerrojo,
  // dos Ctrl+Z seguidos solaparían dos `apply()` y sus `topics.load`.
  let navigating = false;

  const doUndo = async (): Promise<void> => {
    if (navigating) return;
    navigating = true;
    try {
      await flush();
      if (!history.canUndo) return;
      const label = history.undoLabel;
      await history.undo();
      if (label) toast.info(`Deshecho: ${label.toLowerCase()}`, { duration: 2200 });
    } finally {
      navigating = false;
    }
  };

  const doRedo = async (): Promise<void> => {
    if (navigating) return;
    navigating = true;
    try {
      await flush();
      if (!history.canRedo) return;
      const label = history.redoLabel;
      await history.redo();
      if (label) toast.info(`Rehecho: ${label.toLowerCase()}`, { duration: 2200 });
    } finally {
      navigating = false;
    }
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

  const syncBaseline = async (): Promise<void> => {
    clearTimer();
    pendingLabel = null;
    wireAllTopicComments();
    committed = {
      layers: capture(),
      topicsSig: topicsSignature(),
      topicsBcf: await exportTopics(),
    };
    committedKey = fullKey(committed);
    started = true;
  };

  return {
    history,
    controls,
    begin: syncBaseline,
    reset: async () => {
      history.clear();
      await syncBaseline();
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
