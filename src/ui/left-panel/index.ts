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

  const panel = BUI.Component.create<BUI.PanelSection>(() => {
    return BUI.html`
      <bim-panel active label="Visualizador BIM" class="options-menu">

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
