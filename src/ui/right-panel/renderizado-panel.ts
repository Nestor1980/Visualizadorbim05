import * as THREE from "three";
import * as OBC from "@thatopen/components";
import * as OBF from "@thatopen/components-front";
import * as BUI from "@thatopen/ui";

export interface RenderizadoPanel {
  section: BUI.PanelSection;
}

export function createRenderizadoPanel(
  world: OBC.World,
  postproduction: OBF.Postproduction,
  sunLight: THREE.DirectionalLight,
  threeRenderer: THREE.WebGLRenderer,
): RenderizadoPanel {
  const section = BUI.Component.create<BUI.PanelSection>(() => {
    return BUI.html`
      <bim-panel-section label="Renderizado" icon="material-symbols:photo-camera">
        <bim-dropdown label="Vista" required
          @change="${({ target }: { target: BUI.Dropdown }) => {
            world.camera.projection.set(target.value[0] as OBC.CameraProjection);
          }}">
          <bim-option checked label="Perspectiva" value="Perspective"></bim-option>
          <bim-option label="Ortogonal"            value="Orthographic"></bim-option>
        </bim-dropdown>
        <bim-checkbox checked label="Postproducción"
          @change="${({ target }: { target: BUI.Checkbox }) => { postproduction.enabled = target.value; }}">
        </bim-checkbox>
        <bim-checkbox checked label="Outlines (bordes)"
          @change="${({ target }: { target: BUI.Checkbox }) => { postproduction.outlinesEnabled = target.value; }}">
        </bim-checkbox>
        <bim-checkbox checked label="Gloss (brillo)"
          @change="${({ target }: { target: BUI.Checkbox }) => { postproduction.glossEnabled = target.value; }}">
        </bim-checkbox>
        <bim-checkbox checked label="SMAA (antialiasing)"
          @change="${({ target }: { target: BUI.Checkbox }) => { postproduction.smaaEnabled = target.value; }}">
        </bim-checkbox>
        <bim-dropdown label="Estilo" required
          @change="${({ target }: { target: BUI.Dropdown }) => {
            postproduction.style = target.value[0] as OBF.PostproductionAspect;
          }}">
          <bim-option label="Color"                  value="${OBF.PostproductionAspect.COLOR}"></bim-option>
          <bim-option label="Pen"                    value="${OBF.PostproductionAspect.PEN}"></bim-option>
          <bim-option label="Pen + Sombras"          value="${OBF.PostproductionAspect.PEN_SHADOWS}"></bim-option>
          <bim-option checked label="Color + Pen"    value="${OBF.PostproductionAspect.COLOR_PEN}"></bim-option>
          <bim-option label="Color + Sombras"        value="${OBF.PostproductionAspect.COLOR_SHADOWS}"></bim-option>
          <bim-option label="Color + Pen + Sombras"  value="${OBF.PostproductionAspect.COLOR_PEN_SHADOWS}"></bim-option>
        </bim-dropdown>
        <bim-number-input label="Ancho de bordes" value="1.0" min="0.5" max="5" step="0.1"
          @change="${({ target }: { target: BUI.NumberInput }) => { postproduction.edgesPass.width = target.value; }}">
        </bim-number-input>
        <bim-number-input label="Intensidad AO" value="2.5" min="0" max="10" step="0.1"
          @change="${({ target }: { target: BUI.NumberInput }) => {
            postproduction.aoPass.updateGtaoMaterial({ scale: target.value });
          }}">
        </bim-number-input>
        <bim-checkbox checked label="Sombras Three.js"
          @change="${({ target }: { target: BUI.Checkbox }) => {
            threeRenderer.shadowMap.enabled = target.value;
            sunLight.castShadow             = target.value;
          }}">
        </bim-checkbox>
        <bim-number-input label="Intensidad solar" value="1.0" min="0" max="5" step="0.1"
          @change="${({ target }: { target: BUI.NumberInput }) => { sunLight.intensity = target.value; }}">
        </bim-number-input>
      </bim-panel-section>
    `;
  });

  return { section };
}
