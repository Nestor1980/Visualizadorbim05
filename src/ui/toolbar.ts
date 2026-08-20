import * as OBC from "@thatopen/components";
import * as OBF from "@thatopen/components-front";
import * as BUI from "@thatopen/ui";
import type { ToolManager } from "../tools/tool-manager";
import type { SelectionManager } from "../selection/selection-manager";
import { fitViewToModels } from "../camera/fit-view";
import { syncPickableWithVisibility } from "../selection/visibility-sync";

export function createToolbar(
  world: OBC.World,
  fragments: OBC.FragmentsManager,
  toolManager: ToolManager,
  selectionManager: SelectionManager,
  openBcfModal: () => void,
  highlighter: OBF.Highlighter,
): BUI.Toolbar {
  const toolbar = BUI.Component.create<BUI.Toolbar>(() => {
    return BUI.html`
      <bim-toolbar vertical>

        <bim-toolbar-section label="Navegación">
          <bim-button
            icon="material-symbols:arrow-selector-tool"
            ${BUI.ref((el: Element | undefined) => { toolManager.navigateBtnEl = el as BUI.Button ?? null; })}
            @click=${() => toolManager.setMode("navigate")}>
            <bim-tooltip>
              <div style="font-weight:600;">Navegar</div>
              <div style="opacity:0.75;">Orbitar la cámara y seleccionar elementos</div>
            </bim-tooltip>
          </bim-button>
        </bim-toolbar-section>

        <bim-toolbar-section label="Cámara">
          <bim-button
            icon="material-symbols:fit-screen"
            @click=${async () => { await fitViewToModels(world, fragments); }}>
            <bim-tooltip>
              <div style="font-weight:600;">Ajustar vista</div>
              <div style="opacity:0.75;">Ajustar vista al modelo</div>
            </bim-tooltip>
          </bim-button>
        </bim-toolbar-section>

        <bim-toolbar-section label="Información">
          <bim-button
            icon="material-symbols:info"
            ${BUI.ref((el: Element | undefined) => { toolManager.propertiesBtnEl = el as BUI.Button ?? null; })}
            @click=${() => {
              if (toolManager.activeMode === "properties") toolManager.setMode("navigate");
              else toolManager.setMode("properties");
            }}>
            <bim-tooltip>
              <div style="font-weight:600;">Propiedades</div>
              <div style="opacity:0.75;">Ver propiedades del elemento seleccionado</div>
            </bim-tooltip>
          </bim-button>
        </bim-toolbar-section>

        <bim-toolbar-section label="Cota">
          <bim-button
            icon="solar:ruler-bold"
            ${BUI.ref((el: Element | undefined) => { toolManager.cotaBtnEl = el as BUI.Button ?? null; })}
            @click=${() => {
              if (toolManager.activeMode === "cota") toolManager.setMode("navigate");
              else toolManager.setMode("cota");
            }}>
            <bim-tooltip>
              <div style="font-weight:600;">Cota</div>
              <div style="opacity:0.75;">Click para fijar el primer punto, click de nuevo para crear la cota</div>
            </bim-tooltip>
          </bim-button>
        </bim-toolbar-section>

        <bim-toolbar-section label="Sección">
          <bim-button
            icon="material-symbols:cut"
            ${BUI.ref((el: Element | undefined) => { toolManager.sectionBtnEl = el as BUI.Button ?? null; })}
            @click=${() => {
              if (toolManager.activeMode === "section") toolManager.setMode("navigate");
              else toolManager.setMode("section");
            }}>
            <bim-tooltip>
              <div style="font-weight:600;">Plano de corte</div>
              <div style="opacity:0.75;">Click para crear. Muestra hatch por categoría IFC.</div>
            </bim-tooltip>
          </bim-button>
        </bim-toolbar-section>

        <bim-toolbar-section label="Etiqueta">
          <bim-button
            icon="mdi:note-plus-outline"
            ${BUI.ref((el: Element | undefined) => { toolManager.labelBtnEl = el as BUI.Button ?? null; })}
            @click=${() => {
              if (toolManager.activeMode === "label") toolManager.setMode("navigate");
              else toolManager.setMode("label");
            }}>
            <bim-tooltip>
              <div style="font-weight:600;">Etiqueta</div>
              <div style="opacity:0.75;">Click para dejar una etiqueta con comentario</div>
            </bim-tooltip>
          </bim-button>
        </bim-toolbar-section>

        <bim-toolbar-section label="Dibujo">
          <bim-button
            icon="mdi:draw"
            ${BUI.ref((el: Element | undefined) => { toolManager.drawBtnEl = el as BUI.Button ?? null; })}
            @click=${() => {
              if (toolManager.activeMode === "draw") toolManager.setMode("navigate");
              else toolManager.setMode("draw");
            }}>
            <bim-tooltip>
              <div style="font-weight:600;">Dibujo</div>
              <div style="opacity:0.75;">Arrastra para dibujar a mano alzada sobre un plano fijo frente a la cámara</div>
            </bim-tooltip>
          </bim-button>
        </bim-toolbar-section>

        <bim-toolbar-section label="Cómputo">
          <bim-button
            icon="material-symbols:calculate-outline"
            ${BUI.ref((el: Element | undefined) => { toolManager.computoBtnEl = el as BUI.Button ?? null; })}
            @click=${() => {
              if (toolManager.activeMode === "computo") toolManager.setMode("navigate");
              else toolManager.setMode("computo");
            }}>
            <bim-tooltip>
              <div style="font-weight:600;">Cómputo</div>
              <div style="opacity:0.75;">Seleccioná elementos para agregarlos al cómputo y presupuesto</div>
            </bim-tooltip>
          </bim-button>
        </bim-toolbar-section>

        <bim-toolbar-section label="Visibilidad">
          <bim-button
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
              await syncPickableWithVisibility(fragments, highlighter);
              fragments.core.update(true);
            }}>
            <bim-tooltip>
              <div style="font-weight:600;">Aislar selección</div>
              <div style="opacity:0.75;">Oculta todo excepto los elementos seleccionados</div>
            </bim-tooltip>
          </bim-button>
          <bim-button
            icon="material-symbols:visibility"
            @click=${async () => {
              for (const [, model] of fragments.list) {
                await model.setVisible(undefined, true);
              }
              selectionManager.isIsolated = false;
              await syncPickableWithVisibility(fragments, highlighter);
              fragments.core.update(true);
            }}>
            <bim-tooltip>Mostrar todo</bim-tooltip>
          </bim-button>
        </bim-toolbar-section>

        <bim-toolbar-section label="BCF">
          <bim-button
            icon="material-symbols:task"
            @click=${() => openBcfModal()}>
            <bim-tooltip>Nuevo Topic</bim-tooltip>
          </bim-button>
        </bim-toolbar-section>

      </bim-toolbar>
    `;
  });

  return toolbar;
}
