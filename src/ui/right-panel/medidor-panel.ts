import * as THREE from "three";
import * as OBF from "@thatopen/components-front";
import * as BUI from "@thatopen/ui";

export interface MedidorPanel {
  element: HTMLElement;
}

export function createMedidorPanel(measurer: OBF.LengthMeasurement): MedidorPanel {
  const settingsSection = BUI.Component.create<BUI.PanelSection>(() => {
    return BUI.html`
      <bim-panel-section label="Medidor" icon="solar:ruler-cross-pen-bold" .fixed=${false}>
        <bim-checkbox checked label="Visible"
          @change="${({ target }: { target: BUI.Checkbox }) => { measurer.visible = target.value; }}">
        </bim-checkbox>
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
