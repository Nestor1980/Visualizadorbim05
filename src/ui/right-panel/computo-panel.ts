import * as BUI from "@thatopen/ui";
import type { ComputoTool, ComputoAddMode } from "../../tools/computo-tool";

export interface ComputoPanel {
  element: HTMLElement;
}

function makeModeBtn(icon: string, label: string): HTMLButtonElement {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "tree-view-btn";
  const ico = document.createElement("bim-icon") as any;
  ico.icon = icon;
  ico.style.fontSize = "13px";
  const lbl = document.createElement("span");
  lbl.textContent = label;
  btn.append(ico, lbl);
  return btn;
}

/** Panel de opciones de la herramienta de cómputo: dos botones de modo,
 *  Agregar/Quitar, que definen si el próximo click en el viewport suma o
 *  saca un elemento del ítem de cómputo en curso, y un tercer botón de
 *  acción, Seleccionar todo, que agrega de una sola vez todos los elementos
 *  visibles del modelo (ver computo-tool.ts). */
export function createComputoPanel(computoTool: ComputoTool): ComputoPanel {
  const modeBar = document.createElement("div");
  modeBar.className = "tree-switcher";

  const btnAdd     = makeModeBtn("material-symbols:add-circle-outline", "Agregar");
  const btnRemove  = makeModeBtn("material-symbols:remove-circle-outline", "Quitar");
  const btnSelectAll = makeModeBtn("material-symbols:select-all", "Seleccionar todo");
  modeBar.append(btnAdd, btnRemove, btnSelectAll);

  const buttonForMode: Record<ComputoAddMode, HTMLButtonElement> = {
    add: btnAdd,
    remove: btnRemove,
  };

  const updateButtons = (): void => {
    const mode = computoTool.getAddMode();
    for (const [btnMode, btn] of Object.entries(buttonForMode)) {
      btn.classList.toggle("active", btnMode === mode);
    }
  };

  btnAdd.addEventListener("click", () => { computoTool.setAddMode("add"); updateButtons(); });
  btnRemove.addEventListener("click", () => { computoTool.setAddMode("remove"); updateButtons(); });
  updateButtons();

  btnSelectAll.addEventListener("click", () => {
    btnSelectAll.disabled = true;
    computoTool.addAllElements()
      .catch(console.error)
      .finally(() => { btnSelectAll.disabled = false; });
  });

  const hint = document.createElement("div");
  hint.className = "computo-staging-hint";
  hint.textContent = "Click en un elemento del modelo para sumarlo o sacarlo del ítem de cómputo en curso.";

  const section = BUI.Component.create<BUI.PanelSection>(() => {
    return BUI.html`
      <bim-panel-section label="Cómputo" icon="material-symbols:calculate-outline" .fixed=${false}>
        ${modeBar}
        ${hint}
      </bim-panel-section>
    `;
  });

  const element = document.createElement("div");
  element.append(section);

  return { element };
}
