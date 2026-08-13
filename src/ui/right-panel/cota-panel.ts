import * as BUI from "@thatopen/ui";
import type { CotaTool, CotaSnapMode } from "../../tools/cota-tool";

export interface CotaPanel {
  element: HTMLElement;
}

function makeSnapModeBtn(icon: string, label: string): HTMLButtonElement {
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

/** Panel de opciones de la herramienta de cota: por ahora solo el
 *  selector de a qué engancha el hover (vértice / borde / superficie),
 *  igual en espíritu al que tenía la herramienta de medición anterior. */
export function createCotaPanel(cotaTool: CotaTool): CotaPanel {
  const snapModeBar = document.createElement("div");
  snapModeBar.className = "tree-switcher";

  const btnVertex  = makeSnapModeBtn("mdi:vector-point", "Vértice");
  const btnEdge    = makeSnapModeBtn("mdi:vector-line", "Borde");
  const btnSurface = makeSnapModeBtn("mdi:vector-square", "Superficie");
  snapModeBar.append(btnVertex, btnEdge, btnSurface);

  const buttonForMode: Record<CotaSnapMode, HTMLButtonElement> = {
    vertex: btnVertex,
    edge:   btnEdge,
    face:   btnSurface,
  };

  const updateButtons = (): void => {
    const mode = cotaTool.getSnapMode();
    for (const [btnMode, btn] of Object.entries(buttonForMode)) {
      btn.classList.toggle("active", btnMode === mode);
    }
  };

  btnVertex.addEventListener("click", () => { cotaTool.setSnapMode("vertex"); updateButtons(); });
  btnEdge.addEventListener("click", () => { cotaTool.setSnapMode("edge"); updateButtons(); });
  btnSurface.addEventListener("click", () => { cotaTool.setSnapMode("face"); updateButtons(); });
  updateButtons();

  const section = BUI.Component.create<BUI.PanelSection>(() => {
    return BUI.html`
      <bim-panel-section label="Cota" icon="solar:ruler-bold" .fixed=${false}>
        ${snapModeBar}
      </bim-panel-section>
    `;
  });

  const element = document.createElement("div");
  element.append(section);

  return { element };
}
