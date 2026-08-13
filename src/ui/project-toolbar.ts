import * as BUI from "@thatopen/ui";
import type { ProjectIoDeps } from "../project/project-io";
import { newProject, pickAndOpenProjectFile, saveProjectToFile } from "../project/project-io";

export function createProjectToolbar(
  projectIoDeps: ProjectIoDeps,
  openSettingsModal: () => void,
): BUI.Toolbar {
  const fragments = projectIoDeps.fragments;

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

  const onNewProject = async () => {
    if (!confirm("¿Empezar un proyecto nuevo? Se perderá lo que no hayas guardado.")) return;
    await newProject(projectIoDeps);
  };

  const onOpenProject = () => pickAndOpenProjectFile(projectIoDeps);

  const onSaveProject = async () => {
    try {
      await saveProjectToFile(projectIoDeps);
    } catch (error) {
      console.error("Error al guardar el proyecto:", error);
      alert("No se pudo guardar el proyecto. Revisá la consola para más detalles.");
    }
  };

  const toolbar = BUI.Component.create<BUI.Toolbar>(() => {
    return BUI.html`
      <bim-toolbar>
        <bim-toolbar-section>
          <bim-button icon="material-symbols:note-add-outline" @click=${onNewProject}>
            <bim-tooltip>Nuevo Proyecto</bim-tooltip>
          </bim-button>
          <bim-button icon="material-symbols:folder-open-outline" @click=${onOpenProject}>
            <bim-tooltip>Abrir Proyecto</bim-tooltip>
          </bim-button>
          <bim-button icon="material-symbols:save-outline" @click=${onSaveProject}>
            <bim-tooltip>Guardar Proyecto</bim-tooltip>
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
