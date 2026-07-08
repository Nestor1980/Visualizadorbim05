import * as THREE from "three";
import * as BUI from "@thatopen/ui";
import type { SectionTool } from "../../tools/section-tool";

export interface SectionSettingsPanel {
  section: BUI.PanelSection;
}

export function createSectionPanel(sectionTool: SectionTool): SectionSettingsPanel {
  const section = BUI.Component.create<BUI.PanelSection>(() => {
    return BUI.html`
      <bim-panel-section label="Sección" icon="material-symbols:cut" .fixed=${false}>
        <bim-number-input label="Tamaño del plano"
          value="5" min="1" max="30" step="1" suffix="m"
          @change="${({ target }: { target: BUI.NumberInput }) => { sectionTool.clipper.size = target.value; }}">
        </bim-number-input>
        <bim-checkbox checked label="Mostrar relleno en sección"
          @change="${({ target }: { target: BUI.Checkbox }) => {
            sectionTool.sectionFillGroup.visible = target.value && sectionTool.clipper.enabled;
          }}">
        </bim-checkbox>
        <bim-color-input label="Color de relleno" color=#${sectionTool.fillColor.getHexString()}
          @input="${({ target }: { target: BUI.ColorInput }) => {
            sectionTool.setFillColor(new THREE.Color(target.color));
          }}">
        </bim-color-input>
        <bim-color-input label="Color de borde" color=#${sectionTool.edgeColor.getHexString()}
          @input="${({ target }: { target: BUI.ColorInput }) => {
            sectionTool.setEdgeColor(new THREE.Color(target.color));
          }}">
        </bim-color-input>
      </bim-panel-section>
    `;
  });

  return { section };
}
