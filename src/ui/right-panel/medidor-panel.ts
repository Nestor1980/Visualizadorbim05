import * as THREE from "three";
import * as FRAGS from "@thatopen/fragments";
import * as OBF from "@thatopen/components-front";
import * as BUI from "@thatopen/ui";

export interface MedidorPanel {
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

export function createMedidorPanel(measurer: OBF.LengthMeasurement): MedidorPanel {
  const snapModeBar = document.createElement("div");
  snapModeBar.className = "tree-switcher";

  const btnVertex  = makeSnapModeBtn("mdi:vector-point", "Vértice");
  const btnEdge    = makeSnapModeBtn("mdi:vector-line", "Borde");
  const btnSurface = makeSnapModeBtn("mdi:vector-square", "Superficie");
  snapModeBar.append(btnVertex, btnEdge, btnSurface);

  let snapMode: "vertex" | "edge" | "surface" = "vertex";
  const updateSnapModeButtons = (): void => {
    btnVertex.classList.toggle("active", snapMode === "vertex");
    btnEdge.classList.toggle("active", snapMode === "edge");
    btnSurface.classList.toggle("active", snapMode === "surface");
  };
  const applySnapMode = (): void => {
    if (snapMode === "vertex") {
      measurer.mode      = "free";
      measurer.snappings = [FRAGS.SnappingClass.POINT];
    } else if (snapMode === "edge") {
      measurer.mode      = "edge";
      measurer.snappings = [FRAGS.SnappingClass.LINE];
    } else if (snapMode === "surface") {
      measurer.mode      = "free";
      measurer.snappings = [FRAGS.SnappingClass.FACE];
    }
    updateSnapModeButtons();
  };
  btnVertex.addEventListener("click", () => { snapMode = "vertex"; applySnapMode(); });
  btnEdge.addEventListener("click", () => { snapMode = "edge"; applySnapMode(); });
  btnSurface.addEventListener("click", () => { snapMode = "surface"; applySnapMode(); });
  applySnapMode();

  const settingsSection = BUI.Component.create<BUI.PanelSection>(() => {
    return BUI.html`
      <bim-panel-section label="Medidor" icon="solar:ruler-cross-pen-bold" .fixed=${false}>
        ${snapModeBar}
        <bim-color-input label="Color" color=#${measurer.linesMaterial.color.getHexString()}
          @input="${({ target }: { target: BUI.ColorInput }) => { measurer.color = new THREE.Color(target.color); }}">
        </bim-color-input>
        <bim-dropdown label="Unidades" required
          @change="${({ target }: { target: BUI.Dropdown }) => { const [units] = target.value; measurer.units = units; }}">
          ${measurer.unitsList.map((unit) => BUI.html`
            <bim-option label=${unit} value=${unit} ?checked=${unit === measurer.units}></bim-option>`)}
        </bim-dropdown>
        <bim-dropdown label="Precisión" required
          @change="${({ target }: { target: BUI.Dropdown }) => { const [rounding] = target.value; measurer.rounding = rounding; }}">
          <bim-option label="0" value=0></bim-option>
          <bim-option label="1" value=1></bim-option>
          <bim-option label="2" value=2 checked></bim-option>
          <bim-option label="3" value=3></bim-option>
          <bim-option label="4" value=4></bim-option>
        </bim-dropdown>
      </bim-panel-section>
    `;
  });

  const element = document.createElement("div");
  element.append(settingsSection);

  return { element };
}
