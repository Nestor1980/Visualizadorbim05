import * as BUI from "@thatopen/ui";
import type { ProjectIoDeps } from "../project/project-io";
import { newProject, pickAndOpenProjectFile, saveProjectToFile } from "../project/project-io";
import type { HistoryControls } from "../core/project-history";

const MENU_ITEM_STYLE = "--bim-button--jc: flex-start;";

export function createProjectToolbar(
  projectIoDeps: ProjectIoDeps,
  openSettingsModal: () => void,
  triggerLoadIfc: () => void,
  history?: HistoryControls,
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

  // @thatopen/ui abre el menú a la derecha del botón (ver Button._updateMenuPosition).
  // Queremos que caiga justo debajo, alineado a la izquierda del botón. Reposicionamos
  // el <dialog> del shadow root después de que la librería ya lo colocó.
  const positionArchivoMenu = () => {
    const dialog = archivoButtonEl?.shadowRoot?.querySelector("dialog") as HTMLDialogElement | null;
    if (!archivoButtonEl || !dialog?.open) return;
    const margin = 5;
    const gap = 4;
    const rect = archivoButtonEl.getBoundingClientRect();
    const menuWidth = dialog.getBoundingClientRect().width;
    let left = rect.left;
    if (left + menuWidth > window.innerWidth - margin) {
      left = Math.max(margin, window.innerWidth - margin - menuWidth);
    }
    dialog.style.left = `${left}px`;
    dialog.style.top = `${rect.bottom + gap}px`;
  };
  const scheduleArchivoMenuPosition = () => {
    requestAnimationFrame(() => requestAnimationFrame(positionArchivoMenu));
  };

  // El botón con context-menu dibuja una flecha (.chevron) en su shadow root.
  // No hay variable CSS para ocultarla, así que inyectamos un <style> propio.
  const hideArchivoChevron = () => {
    const sr = archivoButtonEl?.shadowRoot;
    if (!sr || sr.querySelector("style[data-archivo-tweak]")) return;
    const style = document.createElement("style");
    style.setAttribute("data-archivo-tweak", "");
    style.textContent = ".chevron { display: none !important; }";
    sr.appendChild(style);
  };
  const setArchivoButtonEl = (el: Element | undefined) => {
    archivoButtonEl = (el as BUI.Button) ?? null;
    if (archivoButtonEl) requestAnimationFrame(hideArchivoChevron);
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

  let undoButtonEl: BUI.Button | null = null;
  let redoButtonEl: BUI.Button | null = null;
  const undoTooltip = document.createElement("div");
  const redoTooltip = document.createElement("div");
  undoTooltip.style.opacity = redoTooltip.style.opacity = "0.75";
  undoTooltip.textContent = "Ctrl+Z";
  redoTooltip.textContent = "Ctrl+Shift+Z";

  // Los botones se deshabilitan cuando no hay nada para deshacer/rehacer; el
  // tooltip refleja el próximo paso ("Deshacer: agregar cota").
  const syncHistoryButtons = () => {
    if (!history) return;
    if (undoButtonEl) {
      undoButtonEl.disabled = !history.canUndo();
      const label = history.undoLabel();
      undoTooltip.textContent = label ? `Ctrl+Z — ${label}` : "Ctrl+Z";
    }
    if (redoButtonEl) {
      redoButtonEl.disabled = !history.canRedo();
      const label = history.redoLabel();
      redoTooltip.textContent = label ? `Ctrl+Shift+Z — ${label}` : "Ctrl+Shift+Z";
    }
  };
  history?.onChange(syncHistoryButtons);

  const historySection = history
    ? BUI.html`
        <bim-toolbar-section>
          <bim-button
            ${BUI.ref((el) => { undoButtonEl = (el as BUI.Button) ?? null; syncHistoryButtons(); })}
            icon="material-symbols:undo"
            @click=${() => history.undo()}>
            <bim-tooltip>
              <div style="font-weight:600;">Deshacer</div>
              ${undoTooltip}
            </bim-tooltip>
          </bim-button>
          <bim-button
            ${BUI.ref((el) => { redoButtonEl = (el as BUI.Button) ?? null; syncHistoryButtons(); })}
            icon="material-symbols:redo"
            @click=${() => history.redo()}>
            <bim-tooltip>
              <div style="font-weight:600;">Rehacer</div>
              ${redoTooltip}
            </bim-tooltip>
          </bim-button>
        </bim-toolbar-section>`
    : "";

  const toolbar = BUI.Component.create<BUI.Toolbar>(() => {
    return BUI.html`
      <bim-toolbar>
        <bim-toolbar-section>
          <bim-button
            ${BUI.ref(setArchivoButtonEl)}
            @click=${() => { hideArchivoChevron(); scheduleArchivoMenuPosition(); }}
            style="--bim-label--fz: 1rem; padding: 0.4rem 1rem;"
            label="Archivo">
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
        ${historySection}
      </bim-toolbar>
    `;
  });

  syncHistoryButtons();

  return toolbar;
}
