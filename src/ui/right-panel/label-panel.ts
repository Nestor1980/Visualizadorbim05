import * as BUI from "@thatopen/ui";
import type { WorldLabelTool } from "../../tools/world-label-tool";

export interface LabelPanel {
  element: HTMLElement;
}

/** Panel de opciones de la etiqueta: aparece flotando a la derecha (misma
 * posición que el resto de los paneles de herramienta) apenas se crea o
 * selecciona una etiqueta, y permite elegir su color de acento. */
export function createLabelPanel(worldLabelTool: WorldLabelTool): LabelPanel {
  const colorInput = BUI.Component.create<BUI.ColorInput>(() => {
    return BUI.html`
      <bim-color-input label="Color" color="${worldLabelTool.getActiveColor()}"
        @input="${({ target }: { target: BUI.ColorInput }) => {
          worldLabelTool.setActiveColor(target.color);
        }}">
      </bim-color-input>
    `;
  });

  worldLabelTool.onSelectionChange.add((label) => {
    colorInput.color = label ? label.color : worldLabelTool.getActiveColor();
  });

  const section = BUI.Component.create<BUI.PanelSection>(() => {
    return BUI.html`
      <bim-panel-section label="Etiqueta" icon="mdi:note-text-outline" .fixed=${false}>
        ${colorInput}
      </bim-panel-section>
    `;
  });

  const element = document.createElement("div");
  element.append(section);

  return { element };
}
