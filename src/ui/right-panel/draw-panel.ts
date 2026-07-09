import * as BUI from "@thatopen/ui";
import type { DrawTool } from "../../tools/draw-tool";

export interface DrawPanel {
  element: HTMLElement;
}

/** Panel de opciones del modo dibujo: color del trazo activo (o del
 * seleccionado, si hay uno). Mismo patrón que el panel de etiquetas. */
export function createDrawPanel(drawTool: DrawTool): DrawPanel {
  const colorInput = BUI.Component.create<BUI.ColorInput>(() => {
    return BUI.html`
      <bim-color-input label="Color" color="${drawTool.getActiveColor()}"
        @input="${({ target }: { target: BUI.ColorInput }) => {
          drawTool.setActiveColor(target.color);
        }}">
      </bim-color-input>
    `;
  });

  const widthInput = BUI.Component.create<BUI.NumberInput>(() => {
    return BUI.html`
      <bim-number-input label="Grosor" slider value="${drawTool.getActiveWidth()}" min="1" max="20" step="0.5"
        @change="${({ target }: { target: BUI.NumberInput }) => {
          drawTool.setActiveWidth(target.value);
        }}">
      </bim-number-input>
    `;
  });

  drawTool.onSelectionChange.add((stroke) => {
    colorInput.color = stroke ? stroke.color : drawTool.getActiveColor();
    widthInput.value  = stroke ? stroke.width : drawTool.getActiveWidth();
  });

  const section = BUI.Component.create<BUI.PanelSection>(() => {
    return BUI.html`
      <bim-panel-section label="Dibujo" icon="mdi:draw" .fixed=${false}>
        ${colorInput}
        ${widthInput}
      </bim-panel-section>
    `;
  });

  const element = document.createElement("div");
  element.append(section);

  return { element };
}
