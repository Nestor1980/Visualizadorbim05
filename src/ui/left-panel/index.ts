import * as OBC from "@thatopen/components";
import * as OBF from "@thatopen/components-front";
import * as CUI from "@thatopen/ui-obc";
import * as BUI from "@thatopen/ui";
import { createTreePanel, TreePanel } from "./tree-panel";
import { saveRecentFile } from "../../ifc/recent-files";

export interface LeftPanel {
  /** Contenido a insertar al inicio del panel derecho combinado (sin bim-panel propio). */
  element: HTMLElement;
  treePanel: TreePanel;
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
    components, metaDataTags: ["schema"], actions: { download: false },
  });

  const loadIfcBytes = async (bytes: Uint8Array, name: string): Promise<void> => {
    if (loadIfcBtn.loading) return;
    loadIfcBtn.loading = true;
    loadIfcBtn.label   = "Cargando… 0%";
    try {
      const model = await ifcLoader.load(bytes, true, name, {
        processData: {
          progressCallback: (p) => {
            loadIfcBtn.label = `Cargando… ${Math.round(p * 100)}%`;
          },
        },
      });
      await onModelLoaded(model, name);
      saveRecentFile(name, bytes).catch((error) => console.error("No se pudo guardar en recientes:", error));
      loadIfcBtn.label = "Cargar IFC";
    } catch (error) {
      console.error("Error al cargar IFC:", error);
      loadIfcBtn.label = "Error al cargar — reintentar";
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
    return BUI.html`<bim-button label="Cargar IFC" icon="mage:box-3d-fill" @click=${onLoadClick}></bim-button>`;
  });

  const treePanel = createTreePanel(components, fragments, highlighter);

  const isLightTheme = (): boolean => {
    const html = document.documentElement;
    if (html.classList.contains("bim-ui-light")) return true;
    if (html.classList.contains("bim-ui-dark")) return false;
    return window.matchMedia("(prefers-color-scheme: light)").matches;
  };

  const brandLogo = document.createElement("img");
  brandLogo.className = "panel-brand-logo";
  brandLogo.alt = "Visualizador BIM";

  const applyTheme = (light: boolean): void => {
    themeToggleBtn.icon  = light ? "material-symbols:dark-mode" : "material-symbols:light-mode";
    themeToggleBtn.label = light ? "Modo oscuro" : "Modo claro";
    brandLogo.src = light
      ? "/img/visualizador_bim_logo_light.png"
      : "/img/visualizador_bim_logo_dark.png";
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

  const panel = BUI.Component.create<HTMLElement>(() => {
    return BUI.html`
      <div class="left-panel-content">
        <div class="panel-brand">${brandLogo}</div>

        <bim-panel-section label="Apariencia" icon="material-symbols:contrast-rounded">
          ${themeToggleBtn}
        </bim-panel-section>

        <bim-panel-section label="Modelos IFC" icon="mage:box-3d-fill">
          ${loadIfcBtn}
          ${modelsList}
        </bim-panel-section>

      </div>
    `;
  });

  panel.append(treePanel.section);

  return {
    element: panel,
    treePanel,
    triggerLoadIfc: onLoadClick,
    loadIfcBytes,
  };
}

