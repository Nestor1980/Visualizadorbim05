import * as OBC from "@thatopen/components";
import * as BUI from "@thatopen/ui";

export function createProjectToolbar(
  fragments: OBC.FragmentsManager,
  openSettingsModal: () => void,
): BUI.Toolbar {
  const exportFrag = async () => {
    const [model] = fragments.list.values();
    if (!model) return;
    const file = new File([await model.getBuffer(false)], "modelo.frag");
    const link = document.createElement("a");
    link.href = URL.createObjectURL(file);
    link.download = file.name;
    link.click();
    URL.revokeObjectURL(link.href);
  };

  const toolbar = BUI.Component.create<BUI.Toolbar>(() => {
    return BUI.html`
      <bim-toolbar>
        <bim-toolbar-section>
          <bim-button icon="material-symbols:note-add-outline">
            <bim-tooltip>Nuevo Proyecto</bim-tooltip>
          </bim-button>
          <bim-button icon="material-symbols:folder-open-outline">
            <bim-tooltip>Abrir Proyecto</bim-tooltip>
          </bim-button>
          <bim-button
            icon="material-symbols:download"
            @click=${() => exportFrag()}>
            <bim-tooltip>Exportar como .frag</bim-tooltip>
          </bim-button>
        </bim-toolbar-section>
        <bim-toolbar-section>
          <bim-button
            icon="material-symbols:menu"
            @click=${() => openSettingsModal()}>
            <bim-tooltip>Configuración</bim-tooltip>
          </bim-button>
        </bim-toolbar-section>
      </bim-toolbar>
    `;
  });

  return toolbar;
}
