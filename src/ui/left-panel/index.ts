import * as OBC from "@thatopen/components";
import * as OBF from "@thatopen/components-front";
import * as CUI from "@thatopen/ui-obc";
import * as BUI from "@thatopen/ui";
import { createTreePanel, TreePanel } from "./tree-panel";

export interface LeftPanel {
  element: BUI.Panel;
  treePanel: TreePanel;
}

export function createLeftPanel(
  components: OBC.Components,
  fragments: OBC.FragmentsManager,
  ifcLoader: OBC.IfcLoader,
  highlighter: OBF.Highlighter,
  onModelLoaded: (model: any) => Promise<void>,
): LeftPanel {
  const [modelsList] = CUI.tables.modelsList({
    components, metaDataTags: ["schema"], actions: { download: false },
  });

  const onLoadClick = () => {
    if (loadIfcBtn.loading) return;
    const input    = document.createElement("input");
    input.type     = "file";
    input.accept   = ".ifc";
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      loadIfcBtn.loading = true;
      loadIfcBtn.label   = "Cargando… 0%";
      try {
        const model = await ifcLoader.load(new Uint8Array(await file.arrayBuffer()), true, file.name, {
          processData: {
            progressCallback: (p) => {
              loadIfcBtn.label = `Cargando… ${Math.round(p * 100)}%`;
            },
          },
        });
        await onModelLoaded(model);
        loadIfcBtn.label = "Cargar IFC";
      } catch (error) {
        console.error("Error al cargar IFC:", error);
        loadIfcBtn.label = "Error al cargar — reintentar";
      } finally {
        loadIfcBtn.loading = false;
      }
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

  const updateThemeToggleBtn = (): void => {
    const light = isLightTheme();
    themeToggleBtn.icon  = light ? "material-symbols:dark-mode" : "material-symbols:light-mode";
    themeToggleBtn.label = light ? "Modo oscuro" : "Modo claro";
  };

  const onThemeToggleClick = () => {
    BUI.Manager.toggleTheme();
    updateThemeToggleBtn();
  };

  const themeToggleBtn = BUI.Component.create<BUI.Button>(() => {
    return BUI.html`<bim-button @click=${onThemeToggleClick}></bim-button>`;
  });
  updateThemeToggleBtn();

  const panel = BUI.Component.create<BUI.PanelSection>(() => {
    return BUI.html`
      <bim-panel active label="Visualizador BIM" class="options-menu">

        <bim-panel-section label="Apariencia" icon="material-symbols:contrast-rounded">
          ${themeToggleBtn}
        </bim-panel-section>

        <bim-panel-section label="Modelos IFC" icon="mage:box-3d-fill">
          ${loadIfcBtn}
          ${modelsList}
        </bim-panel-section>

      </bim-panel>
    `;
  });

  (panel as unknown as HTMLElement).append(treePanel.section);

  return { element: panel as unknown as BUI.Panel, treePanel };
}

const MIN_WIDTH = 240;
const MAX_WIDTH = 560;

/** Inserta el handle de arrastre del panel izquierdo entre el panel y el botón de colapso. */
export function attachLeftPanelResize(wrapper: HTMLElement): void {
  const panelEl = wrapper.firstElementChild as HTMLElement | null;
  if (!panelEl) return;

  const resizeHandle = document.createElement("div");
  resizeHandle.className = "panel-resize-handle";
  resizeHandle.setAttribute("role", "separator");
  resizeHandle.setAttribute("aria-orientation", "vertical");
  resizeHandle.setAttribute("aria-label", "Redimensionar panel izquierdo");
  wrapper.insertBefore(resizeHandle, panelEl.nextSibling);

  resizeHandle.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = parseFloat(getComputedStyle(wrapper).getPropertyValue("--panel-w")) || 300;
    resizeHandle.setPointerCapture(event.pointerId);
    document.body.classList.add("resizing-panel");

    const onMove = (moveEvent: PointerEvent) => {
      const next = startWidth + (moveEvent.clientX - startX);
      const clamped = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, next));
      wrapper.style.setProperty("--panel-w", `${clamped}px`);
    };
    const onUp = () => {
      resizeHandle.releasePointerCapture(event.pointerId);
      document.body.classList.remove("resizing-panel");
      resizeHandle.removeEventListener("pointermove", onMove);
      resizeHandle.removeEventListener("pointerup", onUp);
    };
    resizeHandle.addEventListener("pointermove", onMove);
    resizeHandle.addEventListener("pointerup", onUp);
  });
}
