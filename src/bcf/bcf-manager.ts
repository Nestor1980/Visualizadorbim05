import * as OBC from "@thatopen/components";
import * as CUI from "@thatopen/ui-obc";
import * as BUI from "@thatopen/ui";

const TOPIC_USERS: CUI.TopicUserStyles = {
  "arquitecto@proyecto.com": { name: "Arquitecto Principal", picture: "https://i.pravatar.cc/150?img=3" },
  "ingeniero@proyecto.com":  { name: "Ingeniero Estructural",  picture: "https://i.pravatar.cc/150?img=7" },
};

export function setupBCFSection(
  components: OBC.Components,
  world: OBC.World,
  rightPanel: BUI.Panel,
): { modal: HTMLDialogElement; openModal: () => void } {
  const topics    = components.get(OBC.BCFTopics);
  const viewpoints = components.get(OBC.Viewpoints);

  const [topicsList] = CUI.tables.topicsList({ components, dataStyles: { users: TOPIC_USERS } });
  let currentTopicPanel: HTMLElement | null = null;

  const showTopicPanel = (topic: OBC.Topic) => {
    if (currentTopicPanel) currentTopicPanel.remove();

    const [information]   = CUI.sections.topicInformation({ components, topic, styles: { users: TOPIC_USERS } });
    const [vpSection]     = CUI.sections.topicViewpoints({ components, topic, world });
    const [relatedTopics] = CUI.sections.topicRelations({ components, topic });
    const [comments]      = CUI.sections.topicComments({ topic, styles: TOPIC_USERS });

    currentTopicPanel = BUI.Component.create(() => BUI.html`
      <bim-panel label="${topic.title}">
        <bim-panel-section label="Acciones" icon="material-symbols:settings">
          <bim-button label="Eliminar Topic" icon="material-symbols:delete"
            @click=${() => {
              topics.list.delete(topic.guid);
              if (currentTopicPanel) currentTopicPanel.remove();
              currentTopicPanel = null;
            }}>
          </bim-button>
        </bim-panel-section>
        <bim-panel-section label="Información"         icon="ph:info-bold">              ${information}   </bim-panel-section>
        <bim-panel-section label="Comentarios"         icon="majesticons:comment-line">   ${comments}      </bim-panel-section>
        <bim-panel-section label="Viewpoints"          icon="tabler:camera">              ${vpSection}     </bim-panel-section>
        <bim-panel-section label="Topics Relacionados" icon="tabler:link">                ${relatedTopics} </bim-panel-section>
      </bim-panel>
    `);
    rightPanel.append(currentTopicPanel);
  };

  topicsList.selectableRows = true;

  // @ts-ignore
  topicsList.addEventListener("rowcreated",
    (event: CustomEvent<BUI.RowCreatedEventDetail<{ Guid: string }>>) => {
      const { row } = event.detail;
      row.style.cursor = "pointer";

      row.addEventListener("mouseover", () => {
        row.style.backgroundColor = `color-mix(in lab, var(--bim-ui_bg-contrast-20) 30%, var(--bim-ui_main-base) 10%)`;
      });
      row.addEventListener("mouseout", () => row.style.removeProperty("background-color"));

      row.addEventListener("click", (e: MouseEvent) => {
        if ((e.target as HTMLElement).closest("bim-button, button")) return;
        const { Guid } = row.data;
        if (!Guid) return;
        const topic = topics.list.get(Guid);
        if (!topic) return;
        showTopicPanel(topic);

        const firstVpGuid = [...topic.viewpoints][0];
        if (firstVpGuid) {
          const vp = viewpoints.list.get(firstVpGuid);
          if (vp) {
            if (!vp.world) vp.world = world;
            vp.go({ transition: true }).catch(console.error);
          }
        }
      });

      const deleteBtn = document.createElement("bim-button") as any;
      deleteBtn.icon  = "material-symbols:delete-outline";
      deleteBtn.label = "";
      deleteBtn.title = "Eliminar topic";
      Object.assign(deleteBtn.style, {
        position: "absolute", right: "4px", top: "50%",
        transform: "translateY(-50%)", zIndex: "10",
        opacity: "0", transition: "opacity 0.15s",
        "--bim-button--bgc": "transparent",
        "--bim-button--c":   "var(--bim-ui_bg-contrast-60)",
      });
      deleteBtn.addEventListener("click", (e: Event) => {
        e.stopPropagation();
        const { Guid } = row.data;
        if (!Guid) return;
        const topic = topics.list.get(Guid);
        if (!topic) return;
        if (!confirm(`¿Eliminar topic "${topic.title}"?`)) return;
        topics.list.delete(topic.guid);
        if (currentTopicPanel) { currentTopicPanel.remove(); currentTopicPanel = null; }
      });
      row.style.position = "relative";
      row.addEventListener("mouseover", () => { deleteBtn.style.opacity = "1"; });
      row.addEventListener("mouseout",  () => { deleteBtn.style.opacity = "0"; });
      row.append(deleteBtn);
    },
  );

  // — Modal —
  const [topicForm, updateTopicForm] = CUI.forms.topic({ components, styles: { users: TOPIC_USERS } });
  const assigneeDropdown = topicForm.querySelector<BUI.Dropdown>("bim-dropdown[name='assignedTo']");
  if (assigneeDropdown) assigneeDropdown.searchBox = true;

  const modal = BUI.Component.create<HTMLDialogElement>(() => BUI.html`
    <dialog style="border:none;border-radius:8px;padding:0;background:transparent;box-shadow:0 8px 32px rgba(0,0,0,.4);">
      <bim-panel style="border-radius:8px;width:22rem;">${topicForm}</bim-panel>
    </dialog>
  `);
  document.body.append(modal);
  updateTopicForm({ onCancel: () => modal.close(), onSubmit: () => modal.close() });

  // — BCF section in right panel —
  const bcfSection = document.createElement("bim-panel-section") as BUI.PanelSection;
  bcfSection.label     = "BCF Topics";
  bcfSection.icon      = "material-symbols:task";
  bcfSection.collapsed = true;

  bcfSection.append(BUI.Component.create(() => BUI.html`
    <bim-button label="Crear Topic BCF" icon="material-symbols:task"
      @click=${() => modal.showModal()}>
    </bim-button>
  `));

  bcfSection.append(BUI.Component.create(() => {
    const onDownload = async () => {
      const selected = [...topicsList.selection]
        .map(({ Guid }) => (Guid && typeof Guid === "string") ? topics.list.get(Guid) : null)
        .filter(Boolean) as OBC.Topic[];
      const toExport = selected.length > 0 ? selected : [...topics.list.values()];
      if (toExport.length === 0) return;
      const bcfData = await topics.export(toExport);
      const ts   = new Date().toISOString().slice(0, 10);
      const file = new File([bcfData], `VisorBIM_${ts}.bcfzip`);
      const a    = document.createElement("a");
      a.href     = URL.createObjectURL(file);
      a.download = file.name;
      a.click();
      URL.revokeObjectURL(a.href);
    };
    return BUI.html`
      <bim-button label="Descargar BCF" icon="material-symbols:download" @click=${onDownload}></bim-button>
    `;
  }));

  bcfSection.append(BUI.Component.create(() => {
    const onImport = async () => {
      const input    = document.createElement("input");
      input.type     = "file";
      input.accept   = ".bcf,.bcfzip";
      input.onchange = async () => {
        const file = input.files?.[0];
        if (!file) return;
        await topics.load(new Uint8Array(await file.arrayBuffer()));
        for (const vp of viewpoints.list.values()) {
          if (!vp.world) vp.world = world;
        }
      };
      input.click();
    };
    return BUI.html`
      <bim-button label="Importar BCF" icon="material-symbols:upload" @click=${onImport}></bim-button>
    `;
  }));

  bcfSection.append(topicsList);
  rightPanel.append(bcfSection);

  return { modal, openModal: () => modal.showModal() };
}
