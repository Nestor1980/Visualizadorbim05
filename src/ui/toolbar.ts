import * as THREE from "three";
import * as OBC from "@thatopen/components";
import * as BUI from "@thatopen/ui";
import type { ToolManager } from "../tools/tool-manager";
import type { SelectionManager } from "../selection/selection-manager";

export function createToolbar(
  world: OBC.World,
  fragments: OBC.FragmentsManager,
  toolManager: ToolManager,
  selectionManager: SelectionManager,
  openBcfModal: () => void,
): BUI.Toolbar {
  const toolbar = BUI.Component.create<BUI.Toolbar>(() => {
    return BUI.html`
      <bim-toolbar vertical>

        <bim-toolbar-section label="Navegación">
          <bim-button tooltip-title="Navegar"
            tooltip-text="Orbitar la cámara y seleccionar elementos"
            icon="material-symbols:arrow-selector-tool"
            ${BUI.ref((el: Element | undefined) => { toolManager.navigateBtnEl = el as BUI.Button ?? null; })}
            @click=${() => toolManager.setMode("navigate")}>
          </bim-button>
        </bim-toolbar-section>

        <bim-toolbar-section label="Cámara">
          <bim-button tooltip-title="Perspectiva"
            tooltip-text="Alternar cámara ortográfica / perspectiva"
            icon="tabler:camera"
            @click=${() => world.camera.projection.toggle()}>
          </bim-button>
          <bim-button tooltip-title="Ajustar vista"
            tooltip-text="Ajustar vista al modelo"
            icon="material-symbols:fit-screen"
            @click=${async () => {
              const meshes: THREE.Mesh[] = [];
              for (const model of fragments.list.values()) {
                model.object?.traverse((obj) => {
                  if (obj instanceof THREE.Mesh) meshes.push(obj);
                });
              }
              if (meshes.length > 0) await world.camera.fit(meshes);
            }}>
          </bim-button>
        </bim-toolbar-section>

        <bim-toolbar-section label="Información">
          <bim-button tooltip-title="Propiedades"
            tooltip-text="Ver propiedades del elemento seleccionado"
            icon="material-symbols:info"
            ${BUI.ref((el: Element | undefined) => { toolManager.propertiesBtnEl = el as BUI.Button ?? null; })}
            @click=${() => {
              if (toolManager.activeMode === "properties") toolManager.setMode("navigate");
              else toolManager.setMode("properties");
            }}>
          </bim-button>
        </bim-toolbar-section>

        <bim-toolbar-section label="Medición">
          <bim-button tooltip-title="Activar Medición"
            tooltip-text="Doble click para medir"
            icon="solar:ruler-bold"
            ${BUI.ref((el: Element | undefined) => { toolManager.measureBtnEl = el as BUI.Button ?? null; })}
            @click=${() => {
              if (toolManager.activeMode === "measure") toolManager.setMode("navigate");
              else toolManager.setMode("measure");
            }}>
          </bim-button>
          <bim-button tooltip-title="Borrar mediciones"
            icon="material-symbols:delete-outline"
            @click=${() => {
              const measurer = (toolManager as any).measurer;
              measurer?.list?.clear();
            }}>
          </bim-button>
        </bim-toolbar-section>

        <bim-toolbar-section label="Sección">
          <bim-button tooltip-title="Plano de corte"
            tooltip-text="Doble click para crear. Muestra hatch por categoría IFC."
            icon="material-symbols:cut"
            ${BUI.ref((el: Element | undefined) => { toolManager.sectionBtnEl = el as BUI.Button ?? null; })}
            @click=${() => {
              if (toolManager.activeMode === "section") toolManager.setMode("navigate");
              else toolManager.setMode("section");
            }}>
          </bim-button>
          <bim-button tooltip-title="Borrar planos"
            icon="material-symbols:layers-clear"
            @click=${() => (toolManager as any).sectionTool?.clipper?.deleteAll()}>
          </bim-button>
        </bim-toolbar-section>

        <bim-toolbar-section label="Visibilidad">
          <bim-button tooltip-title="Aislar selección"
            tooltip-text="Oculta todo excepto los elementos seleccionados"
            icon="material-symbols:filter-center-focus"
            @click=${async () => {
              if (selectionManager.isIsolated) {
                for (const [, model] of fragments.list) {
                  await model.setVisible(undefined, true);
                }
                selectionManager.isIsolated = false;
              } else {
                const selectedKeys = Object.keys(selectionManager.lastModelIdMap);
                if (!selectedKeys.length) return;
                for (const [modelUuid, model] of fragments.list) {
                  const selectedIds = selectionManager.lastModelIdMap[modelUuid];
                  if (selectedIds && selectedIds.size > 0) {
                    await model.setVisible(undefined, false);
                    await model.setVisible(Array.from(selectedIds), true);
                  } else {
                    await model.setVisible(undefined, false);
                  }
                }
                selectionManager.isIsolated = true;
              }
              fragments.core.update(true);
            }}>
          </bim-button>
          <bim-button tooltip-title="Mostrar todo"
            icon="material-symbols:visibility"
            @click=${async () => {
              for (const [, model] of fragments.list) {
                await model.setVisible(undefined, true);
              }
              selectionManager.isIsolated = false;
              fragments.core.update(true);
            }}>
          </bim-button>
        </bim-toolbar-section>

        <bim-toolbar-section label="BCF">
          <bim-button tooltip-title="Nuevo Topic"
            icon="material-symbols:task"
            @click=${() => openBcfModal()}>
          </bim-button>
        </bim-toolbar-section>

      </bim-toolbar>
    `;
  });

  return toolbar;
}
