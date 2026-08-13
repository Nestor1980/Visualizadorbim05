import * as OBC from "@thatopen/components";
import * as OBF from "@thatopen/components-front";
import * as BUI from "@thatopen/ui";
import { createModelsTree, SerializedCollections } from "./models-tree";
import { createDataLayersTree, SerializedDataLayers } from "./data-layers-tree";
import type { WorldLabelTool } from "../../tools/world-label-tool";
import type { DrawTool } from "../../tools/draw-tool";
import type { CotaTool } from "../../tools/cota-tool";
import { saveRecentFile } from "../../ifc/recent-files";
import { ensureExplicitThemeClass } from "../theme";

export interface LeftPanel {
  /** Frame "Escena": bim-panel propio con su header, para el split superior del panel derecho.
   *  Muestra una barra de herramientas (colecciones / cargar IFC) y el árbol de
   *  modelos IFC cargados, agrupables en colecciones (estilo outliner), cada uno
   *  explorable como árbol (Espacial / Tipos) desde su propia fila. */
  element: BUI.Panel;
  onElementClick: (handler: (modelId: string, localId: number) => void) => void;
  onTypeGroupClick: (handler: (modelIdMap: OBC.ModelIdMap, typeLabel: string, count: number) => void) => void;
  onTopicSelect: (handler: (topicGuid: string) => void) => void;
  onOpenTopicsTable: (handler: () => void) => void;
  clearTypesSelection: () => void;
  triggerLoadIfc: () => void;
  loadIfcBytes: (bytes: Uint8Array, name: string) => Promise<void>;
  /** Bytes IFC crudos de los modelos actualmente cargados en esta sesión, indexados
   *  por su nombre (= id del modelo en `fragments.list`). Usado para armar el
   *  paquete de "Guardar Proyecto". */
  getModelBytes: () => Map<string, Uint8Array>;
  serializeCollections: () => SerializedCollections;
  restoreCollections: (data: SerializedCollections) => void;
  serializeDataLayers: () => SerializedDataLayers;
  restoreDataLayers: (data: SerializedDataLayers) => void;
}

export function createLeftPanel(
  components: OBC.Components,
  fragments: OBC.FragmentsManager,
  ifcLoader: OBC.IfcLoader,
  highlighter: OBF.Highlighter,
  onModelLoaded: (model: any, name: string) => Promise<void>,
  measurer: OBF.LengthMeasurement,
  clipper: OBC.Clipper,
  topics: OBC.BCFTopics,
  labels: WorldLabelTool,
  drawings: DrawTool,
  cotas: CotaTool,
  world: OBC.World,
): LeftPanel {
  const modelsTree = createModelsTree(fragments, components, highlighter);
  let onTopicSelectCb: ((topicGuid: string) => void) | null = null;
  let onOpenTopicsTableCb: (() => void) | null = null;
  const dataLayersController = createDataLayersTree(
    measurer, clipper, topics, labels, drawings, cotas, world,
    () => modelsTree.refresh(),
    () => modelsTree.ensureDefaultCollectionId(),
    (topicGuid) => onTopicSelectCb?.(topicGuid),
    () => onOpenTopicsTableCb?.(),
  );
  modelsTree.attachDataLayers(dataLayersController);

  // tooltip-title/tooltip-text de bim-button están deprecados y ya no
  // renderizan nada visible en esta versión de @thatopen/ui (solo emiten un
  // warning). El tooltip real se arma con <bim-tooltip>, cuyo texto de
  // progreso mutamos vía esta referencia.
  const loadTooltipDesc = document.createElement("div");
  loadTooltipDesc.style.opacity = "0.75";
  loadTooltipDesc.textContent = "Cargar un archivo .ifc";

  /** Bytes crudos por modelo cargado en esta sesión (clave = nombre = modelId).
   *  Distinto del caché de "recientes" en IndexedDB: ese tiene un tope de
   *  entradas (MAX_RECENT) y podría descartar un modelo que sigue abierto. */
  const modelBytes = new Map<string, Uint8Array>();
  fragments.list.onItemDeleted.add((modelId) => modelBytes.delete(modelId));

  const loadIfcBytes = async (bytes: Uint8Array, name: string): Promise<void> => {
    if (loadIfcBtn.loading) return;
    loadIfcBtn.loading         = true;
    loadTooltipDesc.textContent = "Cargando… 0%";
    try {
      const model = await ifcLoader.load(bytes, true, name, {
        processData: {
          progressCallback: (p) => {
            loadTooltipDesc.textContent = `Cargando… ${Math.round(p * 100)}%`;
          },
        },
      });
      modelBytes.set(name, bytes);
      await onModelLoaded(model, name);
      saveRecentFile(name, bytes).catch((error) => console.error("No se pudo guardar en recientes:", error));
      loadTooltipDesc.textContent = "Cargar un archivo .ifc";
    } catch (error) {
      console.error("Error al cargar IFC:", error);
      loadTooltipDesc.textContent = "Error al cargar — reintentar";
    } finally {
      loadIfcBtn.loading = false;
    }
  };

  const onLoadClick = () => {
    if (loadIfcBtn.loading) return;
    const input    = document.createElement("input");
    input.type     = "file";
    input.accept   = ".ifc";
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      await loadIfcBytes(new Uint8Array(await file.arrayBuffer()), file.name);
    };
    input.click();
  };

  const loadIfcBtn = BUI.Component.create<BUI.Button>(() => {
    return BUI.html`
      <bim-button icon="mage:box-3d-fill" @click=${onLoadClick}>
        <bim-tooltip>
          <div style="font-weight:600;">Cargar IFC</div>
          ${loadTooltipDesc}
        </bim-tooltip>
      </bim-button>
    `;
  });

  const newCollectionBtn = BUI.Component.create<BUI.Button>(() => {
    return BUI.html`
      <bim-button icon="material-symbols:create-new-folder-outline" @click=${() => modelsTree.createCollection()}>
        <bim-tooltip>
          <div style="font-weight:600;">Nueva colección</div>
          <div style="opacity:0.75;">Agrupar modelos IFC en una colección</div>
        </bim-tooltip>
      </bim-button>
    `;
  });

  const newDataLayerBtn = BUI.Component.create<BUI.Button>(() => {
    return BUI.html`
      <bim-button icon="material-symbols:layers-outline" @click=${() => dataLayersController.createDataLayer()}>
        <bim-tooltip>
          <div style="font-weight:600;">Nueva capa de datos</div>
          <div style="opacity:0.75;">Agrupar mediciones y vistas de corte</div>
        </bim-tooltip>
      </bim-button>
    `;
  });

  ensureExplicitThemeClass();

  const panel = document.createElement("bim-panel") as BUI.Panel;
  panel.classList.add("scene-panel");

  const header = BUI.Component.create<HTMLElement>(() => {
    return BUI.html`
      <div class="panel-frame-header">
        <bim-icon icon="mage:box-3d-fill"></bim-icon>
        <span>Escena</span>
      </div>
    `;
  });

  const body = BUI.Component.create<HTMLElement>(() => {
    return BUI.html`
      <div class="left-panel-content">
        <div class="scene-toolbar">
          ${newCollectionBtn}
          ${newDataLayerBtn}
          ${loadIfcBtn}
        </div>
        ${modelsTree.element}
      </div>
    `;
  });

  panel.append(header, body);

  return {
    element: panel,
    onElementClick: modelsTree.onElementClick,
    onTypeGroupClick: modelsTree.onTypeGroupClick,
    onTopicSelect: (handler) => { onTopicSelectCb = handler; },
    onOpenTopicsTable: (handler) => { onOpenTopicsTableCb = handler; },
    clearTypesSelection: modelsTree.clearTypesSelection,
    triggerLoadIfc: onLoadClick,
    loadIfcBytes,
    getModelBytes: () => modelBytes,
    serializeCollections: modelsTree.serialize,
    restoreCollections: modelsTree.restore,
    serializeDataLayers: dataLayersController.serialize,
    restoreDataLayers: dataLayersController.restore,
  };
}
