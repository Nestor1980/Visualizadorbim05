import * as BUI from "@thatopen/ui";
import type { ProjectIoDeps } from "../project/project-io";
import { newProject, pickAndOpenProjectFile, saveProjectToFile } from "../project/project-io";

const MENU_ITEM_STYLE = "--bim-button--jc: flex-start;";

export function createProjectToolbar(
  projectIoDeps: ProjectIoDeps,
  openSettingsModal: () => void,
  triggerLoadIfc: () => void,
): BUI.Toolbar {
  let archivoButtonEl: BUI.Button | null = null;

  // bim-context-menu no se cierra solo al clickear un ítem (@thatopen/ui
  // solo lo cierra si el click cae sobre el <dialog> mismo, no sobre sus
  // hijos — ver Button._onDialogClick). Simulamos exactamente esa condición
  // con un click sintético directo sobre el <dialog>, así dispara el cierre
  // "real" de la librería (mueve los hijos de vuelta, limpia el registro de
  // menús abiertos) en vez de ocultarlo a mano y dejar el estado interno
  // desincronizado para la próxima apertura.
  const closeArchivoMenu = () => {
    archivoButtonEl?.shadowRoot?.querySelector("dialog")?.click();
  };
  const withClose = (action: () => void) => () => {
    closeArchivoMenu();
    action();
  };

  const onNewProject = async () => {
    if (!confirm("¿Empezar un proyecto nuevo? Se perderá lo que no hayas guardado.")) return;
    await newProject(projectIoDeps);
  };

  const onOpenProject = () => pickAndOpenProjectFile(projectIoDeps);

  const onSaveProject = async () => {
    try {
      await saveProjectToFile(projectIoDeps);
    } catch (error) {
      console.error("Error al guardar el proyecto:", error);
      alert("No se pudo guardar el proyecto. Revisá la consola para más detalles.");
    }
  };

  const toolbar = BUI.Component.create<BUI.Toolbar>(() => {
    return BUI.html`
      <bim-toolbar>
        <bim-toolbar-section>
          <bim-button
            ${BUI.ref((el: Element | undefined) => { archivoButtonEl = (el as BUI.Button) ?? null; })}
            label="Archivo" icon="material-symbols:folder-outline">
            <bim-context-menu>
              <bim-button style=${MENU_ITEM_STYLE} label="Nuevo Proyecto" icon="material-symbols:note-add-outline" @click=${withClose(onNewProject)}></bim-button>
              <bim-button style=${MENU_ITEM_STYLE} label="Abrir Proyecto" icon="material-symbols:folder-open-outline" @click=${withClose(onOpenProject)}></bim-button>
              <bim-button style=${MENU_ITEM_STYLE} label="Guardar Proyecto" icon="material-symbols:save-outline" @click=${withClose(onSaveProject)}></bim-button>
              <bim-button style=${MENU_ITEM_STYLE} label="Importar Modelo IFC" icon="material-symbols:upload-file-outline" @click=${withClose(triggerLoadIfc)}></bim-button>
              <div style="height:1px;margin:0.3rem 0.2rem;background:var(--bim-ui_bg-contrast-30);flex-shrink:0;"></div>
              <bim-button style=${MENU_ITEM_STYLE} label="Configuración" icon="material-symbols:settings-outline" @click=${withClose(openSettingsModal)}></bim-button>
            </bim-context-menu>
          </bim-button>
        </bim-toolbar-section>
      </bim-toolbar>
    `;
  });

  return toolbar;
}
