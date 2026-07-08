import * as OBC from "@thatopen/components";
import * as OBF from "@thatopen/components-front";
import * as BUI from "@thatopen/ui";
import { createModelsTree } from "./models-tree";
import { createDataLayersTree } from "./data-layers-tree";
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
  clearTypesSelection: () => void;
  triggerLoadIfc: () => void;
  loadIfcBytes: (bytes: Uint8Array, name: string) => Promise<void>;
}

export function createLeftPanel(
  components: OBC.Components,
  fragments: OBC.FragmentsManager,
  ifcLoader: OBC.IfcLoader,
  highlighter: OBF.Highlighter,
  onModelLoaded: (model: any, name: string) => Promise<void>,
  measurer: OBF.LengthMeasurement,
  clipper: OBC.Clipper,
  world: OBC.World,
): LeftPanel {
  const modelsTree = createModelsTree(fragments, components, highlighter);
  const dataLayersController = createDataLayersTree(
    measurer, clipper, world,
    () => modelsTree.refresh(),
    () => modelsTree.ensureDefaultCollectionId(),
  );
  modelsTree.attachDataLayers(dataLayersController);

  // tooltip-title/tooltip-text de bim-button están deprecados y ya no
  // renderizan nada visible en esta versión de @thatopen/ui (solo emiten un
  // warning). El tooltip real se arma con <bim-tooltip>, cuyo texto de
  // progreso mutamos vía esta referencia.
  const loadTooltipDesc = document.createElement("div");
  loadTooltipDesc.style.opacity = "0.75";
  loadTooltipDesc.textContent = "Cargar un archivo .ifc";

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
    clearTypesSelection: modelsTree.clearTypesSelection,
    triggerLoadIfc: onLoadClick,
    loadIfcBytes,
  };
}
