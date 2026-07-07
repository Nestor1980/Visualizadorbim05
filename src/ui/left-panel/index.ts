import * as OBC from "@thatopen/components";
import * as OBF from "@thatopen/components-front";
import * as CUI from "@thatopen/ui-obc";
import * as BUI from "@thatopen/ui";
import { createTreePanel, TreePanel } from "./tree-panel";
import { saveRecentFile } from "../../ifc/recent-files";

export interface LeftPanel {
  /** Frame "Escena": bim-panel propio con su header, para el split superior del panel derecho.
   *  Muestra únicamente el árbol de modelos IFC cargados (estilo outliner). */
  element: BUI.Panel;
  treePanel: TreePanel;
  /** Sección "Apariencia" (toggle de tema), para montar en el panel dinámico de abajo. */
  appearanceSection: BUI.PanelSection;
  /** Botón "Cargar IFC", para montar en la toolbar. */
  loadIfcButton: BUI.Button;
  triggerLoadIfc: () => void;
  loadIfcBytes: (bytes: Uint8Array, name: string) => Promise<void>;
}

export function createLeftPanel(
  components: OBC.Components,
  fragments: OBC.FragmentsManager,
  ifcLoader: OBC.IfcLoader,
  highlighter: OBF.Highlighter,
  onModelLoaded: (model: any, name: string) => Promise<void>,
): LeftPanel {
  const [modelsList] = CUI.tables.modelsList({
    components,
    metaDataTags: ["schema"],
    actions: { visibility: true, download: false, dispose: true },
    missingDataMessage: "No hay modelos IFC cargados",
  });
  modelsList.style.fontSize = "12px";

  // Antepone un ícono de cubo a cada fila para identificar visualmente los
  // modelos IFC en el árbol de la "Escena" (estilo outliner).
  const originalNameTransform = modelsList.dataTransform?.Name;
  if (originalNameTransform) {
    modelsList.dataTransform = {
      ...modelsList.dataTransform,
      Name: (value, data, group) => BUI.html`
        <div style="display:flex;align-items:center;gap:6px;overflow:hidden;">
          <bim-icon icon="mage:box-3d-fill" style="flex-shrink:0;font-size:14px;opacity:0.75;"></bim-icon>
          <div style="flex:1;min-width:0;overflow:hidden;">
            ${originalNameTransform(value, data, group)}
          </div>
        </div>
      `,
    };
  }

  const loadIfcBytes = async (bytes: Uint8Array, name: string): Promise<void> => {
    if (loadIfcBtn.loading) return;
    loadIfcBtn.loading      = true;
    loadIfcBtn.tooltipText  = "Cargando… 0%";
    try {
      const model = await ifcLoader.load(bytes, true, name, {
        processData: {
          progressCallback: (p) => {
            loadIfcBtn.tooltipText = `Cargando… ${Math.round(p * 100)}%`;
          },
        },
      });
      await onModelLoaded(model, name);
      saveRecentFile(name, bytes).catch((error) => console.error("No se pudo guardar en recientes:", error));
      loadIfcBtn.tooltipText = "Cargar un archivo .ifc";
    } catch (error) {
      console.error("Error al cargar IFC:", error);
      loadIfcBtn.tooltipText = "Error al cargar — reintentar";
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
      <bim-button tooltip-title="Cargar IFC" tooltip-text="Cargar un archivo .ifc"
        icon="mage:box-3d-fill" @click=${onLoadClick}>
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
        ${modelsList}
      </div>
    `;
  });

  panel.append(header, body);

  return {
    element: panel,
    treePanel,
    appearanceSection,
    loadIfcButton: loadIfcBtn,
    triggerLoadIfc: onLoadClick,
    loadIfcBytes,
  };
}

