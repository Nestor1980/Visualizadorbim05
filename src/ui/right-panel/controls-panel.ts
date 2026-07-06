import * as OBC from "@thatopen/components";
import * as BUI from "@thatopen/ui";

export interface ControlsPanel {
  section: BUI.PanelSection;
}

export function createControlsPanel(fragments: OBC.FragmentsManager): ControlsPanel {
  const downloadFragments = async () => {
    const [model] = fragments.list.values();
    if (!model) return;
    const file = new File([await model.getBuffer(false)], "modelo.frag");
    const link = document.createElement("a");
    link.href = URL.createObjectURL(file);
    link.download = file.name;
    link.click();
    URL.revokeObjectURL(link.href);
  };

  const section = BUI.Component.create<BUI.PanelSection>(() => {
    return BUI.html`
      <bim-panel-section label="Controles" icon="solar:ruler-bold">
        <bim-label>Doble click: crear medición / plano de sección</bim-label>
        <bim-label>Delete / Backspace: borrar</bim-label>
        <bim-button label="Descargar .frag" @click=${() => downloadFragments()}></bim-button>
      </bim-panel-section>
    `;
  });

  return { section };
}
