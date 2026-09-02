import * as BUI from "@thatopen/ui";
import type { SelectionManager, SelectionMode } from "../../selection/selection-manager";

export interface SelectionPanel {
  element: HTMLElement;
}

const MODE_HINT: Record<SelectionMode, string> = {
  click: "Click simple sobre un elemento para seleccionarlo.",
  box:   "Arrastrá para dibujar un rectángulo y seleccionar todo lo que encierre.",
  lasso: "Arrastrá para trazar un contorno a mano alzada y seleccionar lo que quede dentro.",
};

function makeModeBtn(icon: string, label: string): HTMLButtonElement {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "tree-view-btn";
  const ico = document.createElement("bim-icon") as HTMLElement & { icon: string };
  ico.icon = icon;
  ico.style.fontSize = "13px";
  const lbl = document.createElement("span");
  lbl.textContent = label;
  btn.append(ico, lbl);
  return btn;
}

/**
 * Panel de opciones de la herramienta "Navegar": elige el modo de selección
 * (click / caja / cuerda) que se usará en el próximo gesto sobre el viewport.
 * Comparte el look de los switchers del panel de cómputo.
 */
export function createSelectionPanel(selectionManager: SelectionManager): SelectionPanel {
  const modeBar = document.createElement("div");
  modeBar.className = "tree-switcher";

  const buttonForMode: Record<SelectionMode, HTMLButtonElement> = {
    click: makeModeBtn("material-symbols:arrow-selector-tool", "Click"),
    box:   makeModeBtn("material-symbols:select", "Caja"),
    lasso: makeModeBtn("material-symbols:gesture", "Cuerda"),
  };
  modeBar.append(buttonForMode.click, buttonForMode.box, buttonForMode.lasso);

  const hint = document.createElement("div");
  hint.className = "computo-staging-hint";

  const updateButtons = (): void => {
    const mode = selectionManager.selectionMode;
    for (const [btnMode, btn] of Object.entries(buttonForMode)) {
      btn.classList.toggle("active", btnMode === mode);
    }
    hint.textContent = MODE_HINT[mode];
  };

  for (const [mode, btn] of Object.entries(buttonForMode) as [SelectionMode, HTMLButtonElement][]) {
    btn.addEventListener("click", () => {
      selectionManager.selectionMode = mode;
      updateButtons();
    });
  }
  updateButtons();

  const section = BUI.Component.create<BUI.PanelSection>(() => {
    return BUI.html`
      <bim-panel-section label="Selección" icon="material-symbols:arrow-selector-tool" .fixed=${false}>
        ${modeBar}
        ${hint}
      </bim-panel-section>
    `;
  });

  const element = document.createElement("div");
  element.append(section);

  return { element };
}
