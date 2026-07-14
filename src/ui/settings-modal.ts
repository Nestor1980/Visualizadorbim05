import * as BUI from "@thatopen/ui";
import { createThemeToggleButton } from "./theme";
import { makeModalDraggable, resetModalPosition, closeOnBackdropClick } from "./draggable-modal";
import { getDiscordWebhookUrl, setDiscordWebhookUrl } from "../bcf/share";

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
            <div class="settings-sidebar-item settings-sidebar-item--active" data-section="appearance">
              <iconify-icon icon="material-symbols:contrast-rounded"></iconify-icon>
              <span>Apariencia</span>
            </div>
            <div class="settings-sidebar-item" data-section="share">
              <iconify-icon icon="mdi:share-variant-outline"></iconify-icon>
              <span>Compartir</span>
            </div>
          </div>
          <div class="settings-content">
            <div class="settings-section" data-section="appearance">
              <div class="settings-row">
                <div class="settings-row-text">
                  <span class="settings-row-title">Tema</span>
                  <span class="settings-row-desc">Alternar entre modo claro y oscuro</span>
                </div>
                ${themeToggleBtn}
              </div>
            </div>
            <div class="settings-section" data-section="share" hidden>
              <div class="settings-row">
                <div class="settings-row-text">
                  <span class="settings-row-title">Webhook de Discord</span>
                  <span class="settings-row-desc">
                    URL del Incoming Webhook del canal donde se publican los topics BCF
                    compartidos desde "Compartir por Discord".
                  </span>
                </div>
              </div>
              <div class="settings-row">
                <bim-text-input type="url" placeholder="https://discord.com/api/webhooks/..." debounce="400"
                  .value=${getDiscordWebhookUrl()}
                  @input=${(e: Event) => setDiscordWebhookUrl((e.target as BUI.TextInput).value.trim())}>
                </bim-text-input>
              </div>
            </div>
          </div>
        </div>
      </dialog>
    `;
  });

  closeOnBackdropClick(modal);

  const header = modal.querySelector(".settings-modal-header") as HTMLElement;
  makeModalDraggable(modal, header, ".settings-modal-close");

  const sidebarItems = [...modal.querySelectorAll<HTMLElement>(".settings-sidebar-item")];
  const sections     = [...modal.querySelectorAll<HTMLElement>(".settings-section")];
  for (const item of sidebarItems) {
    item.addEventListener("click", () => {
      const target = item.dataset.section;
      for (const other of sidebarItems) other.classList.toggle("settings-sidebar-item--active", other === item);
      for (const section of sections) section.hidden = section.dataset.section !== target;
    });
  }

  document.body.append(modal);

  const openModal = () => {
    resetModalPosition(modal);
    modal.showModal();
  };

  return { modal, openModal };
}
