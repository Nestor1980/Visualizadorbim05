import * as OBC from "@thatopen/components";
import * as OBF from "@thatopen/components-front";
import * as BUI from "@thatopen/ui";
import { createTreePanel, TreePanel } from "./tree-panel";
import { createModelsTree } from "./models-tree";
import { createDataLayersTree } from "./data-layers-tree";
import { saveRecentFile } from "../../ifc/recent-files";

export interface LeftPanel {
  /** Frame "Escena": bim-panel propio con su header, para el split superior del panel derecho.
   *  Muestra una barra de herramientas (colecciones / cargar IFC) y el árbol de
   *  modelos IFC cargados, agrupables en colecciones (estilo outliner). */
  element: BUI.Panel;
  treePanel: TreePanel;
  /** Sección "Apariencia" (toggle de tema), para montar en el panel dinámico de abajo. */
  appearanceSection: BUI.PanelSection;
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
  const modelsTree = createModelsTree(fragments);
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

  const treePanel = createTreePanel(components, fragments, highlighter);

  const isLightTheme = (): boolean => {
    const html = document.documentElement;
    if (html.classList.contains("bim-ui-light")) return true;
    if (html.classList.contains("bim-ui-dark")) return false;
    return window.matchMedia("(prefers-color-scheme: light)").matches;
  };

  // BUI.Manager.toggleTheme() decide el próximo tema mirando únicamente si
  // <html> ya tiene la clase "bim-ui-light" o "bim-ui-dark": si no tiene
  // ninguna (estado inicial, antes del primer click), agrega "bim-ui-light"
  // sin mirar el tema ambiente real — así el sistema esté en modo oscuro, el
  // primer toggle "atascaba" el tema en claro y desincronizaba el ícono/label
  // del botón. Fijar la clase explícita una sola vez al iniciar hace que ese
  // primer toggle (y todos los siguientes) alternen de forma predecible.
  const ensureExplicitThemeClass = (): void => {
    const html = document.documentElement;
    if (html.classList.contains("bim-ui-light") || html.classList.contains("bim-ui-dark")) return;
    html.classList.add(isLightTheme() ? "bim-ui-light" : "bim-ui-dark");
  };
  ensureExplicitThemeClass();

  const applyTheme = (light: boolean): void => {
    themeToggleBtn.icon  = light ? "material-symbols:dark-mode" : "material-symbols:light-mode";
    themeToggleBtn.label = light ? "Modo oscuro" : "Modo claro";
  };

  const updateThemeToggleBtn = (): void => applyTheme(isLightTheme());

  // animate=false evita el overlay de "wipe" circular (el flash de pantalla
  // completa) que aplica @thatopen/ui por defecto; el cambio de variables CSS
  // ya se transiciona de forma suave y minimalista vía global.css.
  const onThemeToggleClick = () => {
    const nextLight = !isLightTheme();
    BUI.Manager.toggleTheme(false);
    applyTheme(nextLight);
  };

  const themeToggleBtn = BUI.Component.create<BUI.Button>(() => {
    return BUI.html`<bim-button @click=${onThemeToggleClick}></bim-button>`;
  });
  updateThemeToggleBtn();

  const appearanceSection = document.createElement("bim-panel-section") as BUI.PanelSection;
  appearanceSection.label = "Apariencia";
  appearanceSection.icon  = "material-symbols:contrast-rounded";
  appearanceSection.append(themeToggleBtn);

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
    treePanel,
    appearanceSection,
    triggerLoadIfc: onLoadClick,
    loadIfcBytes,
  };
}
