import * as BUI from "@thatopen/ui";
import { createThemeToggleButton } from "./theme";

export interface SettingsModal {
  modal: HTMLDialogElement;
  openModal: () => void;
}

export function createSettingsModal(): SettingsModal {
  const themeToggleBtn = createThemeToggleButton();

  const modal = BUI.Component.create<HTMLDialogElement>(() => {
    return BUI.html`
      <dialog class="settings-modal">
        <div class="settings-modal-header">
          <span class="settings-modal-title">Configuración</span>
          <button class="settings-modal-close" type="button" aria-label="Cerrar"
            @click=${() => modal.close()}>
            <iconify-icon icon="material-symbols:close"></iconify-icon>
          </button>
        </div>
        <div class="settings-modal-body">
          <div class="settings-sidebar">
            <div class="settings-sidebar-item settings-sidebar-item--active">
              <iconify-icon icon="material-symbols:contrast-rounded"></iconify-icon>
              <span>Apariencia</span>
            </div>
          </div>
          <div class="settings-content">
            <div class="settings-row">
              <div class="settings-row-text">
                <span class="settings-row-title">Tema</span>
                <span class="settings-row-desc">Alternar entre modo claro y oscuro</span>
              </div>
              ${themeToggleBtn}
            </div>
          </div>
        </div>
      </dialog>
    `;
  });

  modal.addEventListener("click", (event) => {
    if (event.target === modal) modal.close();
  });

  // Arrastre por el header: al agarrar, la posición pasa de estar centrada
  // por transform (ver global.css) a top/left absolutos en px, así el drag
  // no pelea con el translate(-50%,-50%) del centrado inicial.
  const header = modal.querySelector(".settings-modal-header") as HTMLElement;
  let dragOffsetX = 0;
  let dragOffsetY = 0;

  const onPointerMove = (event: PointerEvent) => {
    modal.style.left = `${event.clientX - dragOffsetX}px`;
    modal.style.top  = `${event.clientY - dragOffsetY}px`;
  };
  const onPointerUp = (event: PointerEvent) => {
    header.releasePointerCapture(event.pointerId);
    header.removeEventListener("pointermove", onPointerMove);
    header.removeEventListener("pointerup", onPointerUp);
  };
  header.addEventListener("pointerdown", (event) => {
    if ((event.target as HTMLElement).closest(".settings-modal-close")) return;
    const rect = modal.getBoundingClientRect();
    modal.style.transform = "none";
    modal.style.top  = `${rect.top}px`;
    modal.style.left = `${rect.left}px`;
    dragOffsetX = event.clientX - rect.left;
    dragOffsetY = event.clientY - rect.top;
    header.setPointerCapture(event.pointerId);
    header.addEventListener("pointermove", onPointerMove);
    header.addEventListener("pointerup", onPointerUp);
  });

  document.body.append(modal);

  const openModal = () => {
    modal.style.top = "";
    modal.style.left = "";
    modal.style.transform = "";
    modal.showModal();
  };

  return { modal, openModal };
}
