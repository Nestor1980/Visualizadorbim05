import * as BUI from "@thatopen/ui";
import type { ProjectIoDeps } from "../project/project-io";
import { newProject, pickAndOpenProjectFile, saveProjectToFile } from "../project/project-io";
import type { HistoryControls } from "../core/project-history";

const MENU_ITEM_STYLE = "--bim-button--jc: flex-start;";

/**
 * Helpers para un `bim-button` con `bim-context-menu`: cerrar el menú "de
 * verdad" (la librería solo lo cierra si el click cae sobre el <dialog>),
 * recolocarlo justo debajo del botón alineado a la izquierda, y ocultar la
 * flecha (.chevron) que dibuja en su shadow root. @thatopen/ui no expone
 * ninguna de estas tres cosas, así que las forzamos a mano.
 */
function createMenuButton(dataTweak: string) {
  let buttonEl: BUI.Button | null = null;

  const closeMenu = () => {
    buttonEl?.shadowRoot?.querySelector("dialog")?.click();
  };

  const positionMenu = () => {
    const dialog = buttonEl?.shadowRoot?.querySelector("dialog") as HTMLDialogElement | null;
    if (!buttonEl || !dialog?.open) return;
    const margin = 5;
    const gap = 4;
    const rect = buttonEl.getBoundingClientRect();
    const menuWidth = dialog.getBoundingClientRect().width;
    let left = rect.left;
    if (left + menuWidth > window.innerWidth - margin) {
      left = Math.max(margin, window.innerWidth - margin - menuWidth);
    }
    dialog.style.left = `${left}px`;
    dialog.style.top = `${rect.bottom + gap}px`;
  };
  const scheduleMenuPosition = () => {
    requestAnimationFrame(() => requestAnimationFrame(positionMenu));
  };

  const hideChevron = () => {
    const sr = buttonEl?.shadowRoot;
    if (!sr || sr.querySelector(`style[${dataTweak}]`)) return;
    const style = document.createElement("style");
    style.setAttribute(dataTweak, "");
    style.textContent = ".chevron { display: none !important; }";
    sr.appendChild(style);
  };

  const setButtonEl = (el: Element | undefined) => {
    buttonEl = (el as BUI.Button) ?? null;
    if (buttonEl) requestAnimationFrame(hideChevron);
  };

  const onClick = () => {
    hideChevron();
    scheduleMenuPosition();
  };

  const withClose = (action: () => void) => () => {
    closeMenu();
    action();
  };

  return { getButtonEl: () => buttonEl, setButtonEl, onClick, withClose };
}

export function createProjectToolbar(
  projectIoDeps: ProjectIoDeps,
  openSettingsModal: () => void,
  triggerLoadIfc: () => void,
  history?: HistoryControls,
): BUI.Toolbar {
  const archivo = createMenuButton("data-archivo-tweak");

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

  // — Menú "Edición": Deshacer / Rehacer (Ctrl+Z / Ctrl+Shift+Z) —
  const edicion = createMenuButton("data-edicion-tweak");
  let undoItemEl: BUI.Button | null = null;
  let redoItemEl: BUI.Button | null = null;

  // Los ítems se deshabilitan cuando no hay nada para deshacer/rehacer; el
  // label refleja el próximo paso ("Deshacer: agregar cota").
  const syncHistoryItems = () => {
    if (!history) return;
    if (undoItemEl) {
      undoItemEl.disabled = !history.canUndo();
      const label = history.undoLabel();
      undoItemEl.label = label ? `Deshacer: ${label} (Ctrl+Z)` : "Deshacer (Ctrl+Z)";
    }
    if (redoItemEl) {
      redoItemEl.disabled = !history.canRedo();
      const label = history.redoLabel();
      redoItemEl.label = label ? `Rehacer: ${label} (Ctrl+Shift+Z)` : "Rehacer (Ctrl+Shift+Z)";
    }
  };
  history?.onChange(syncHistoryItems);

  const edicionSection = history
    ? BUI.html`
        <bim-toolbar-section>
          <bim-button
            ${BUI.ref(edicion.setButtonEl)}
            @click=${edicion.onClick}
            style="--bim-label--fz: 1rem; padding: 0.4rem 1rem;"
            label="Edición">
            <bim-context-menu>
              <bim-button
                ${BUI.ref((el) => { undoItemEl = (el as BUI.Button) ?? null; syncHistoryItems(); })}
                style=${MENU_ITEM_STYLE}
                label="Deshacer"
                icon="material-symbols:undo"
                @click=${edicion.withClose(() => history.undo())}></bim-button>
              <bim-button
                ${BUI.ref((el) => { redoItemEl = (el as BUI.Button) ?? null; syncHistoryItems(); })}
                style=${MENU_ITEM_STYLE}
                label="Rehacer"
                icon="material-symbols:redo"
                @click=${edicion.withClose(() => history.redo())}></bim-button>
            </bim-context-menu>
          </bim-button>
        </bim-toolbar-section>`
    : "";

  const toolbar = BUI.Component.create<BUI.Toolbar>(() => {
    return BUI.html`
      <bim-toolbar>
        <bim-toolbar-section>
          <bim-button
            ${BUI.ref(archivo.setButtonEl)}
            @click=${archivo.onClick}
            style="--bim-label--fz: 1rem; padding: 0.4rem 1rem;"
            label="Archivo">
            <bim-context-menu>
              <bim-button style=${MENU_ITEM_STYLE} label="Nuevo Proyecto" icon="material-symbols:note-add-outline" @click=${archivo.withClose(onNewProject)}></bim-button>
              <bim-button style=${MENU_ITEM_STYLE} label="Abrir Proyecto" icon="material-symbols:folder-open-outline" @click=${archivo.withClose(onOpenProject)}></bim-button>
              <bim-button style=${MENU_ITEM_STYLE} label="Guardar Proyecto" icon="material-symbols:save-outline" @click=${archivo.withClose(onSaveProject)}></bim-button>
              <bim-button style=${MENU_ITEM_STYLE} label="Importar Modelo IFC" icon="material-symbols:upload-file-outline" @click=${archivo.withClose(triggerLoadIfc)}></bim-button>
              <div style="height:1px;margin:0.3rem 0.2rem;background:var(--bim-ui_bg-contrast-30);flex-shrink:0;"></div>
              <bim-button style=${MENU_ITEM_STYLE} label="Configuración" icon="material-symbols:settings-outline" @click=${archivo.withClose(openSettingsModal)}></bim-button>
            </bim-context-menu>
          </bim-button>
        </bim-toolbar-section>
        ${edicionSection}
      </bim-toolbar>
    `;
  });

  syncHistoryItems();

  return toolbar;
}
