import * as OBC from "@thatopen/components";
import * as CUI from "@thatopen/ui-obc";
import * as BUI from "@thatopen/ui";
import { makeModalDraggable, resetModalPosition, closeOnBackdropClick } from "../ui/draggable-modal";
import type { RightPanel } from "../ui/right-panel/index";
import { shareTopicByEmail, shareTopicToDiscord } from "./share";

const BCF_TOPIC_TAB_ID = "bcf-topic";

type TopicsTable = ReturnType<typeof CUI.tables.topicsList>[0];

const TOPIC_USERS: CUI.TopicUserStyles = {
  "arquitecto@proyecto.com": { name: "Arquitecto Principal", picture: "https://i.pravatar.cc/150?img=3" },
  "ingeniero@proyecto.com":  { name: "Ingeniero Estructural",  picture: "https://i.pravatar.cc/150?img=7" },
};

export function setupBCFSection(
  components: OBC.Components,
  world: OBC.World,
  rightPanel: RightPanel,
): {
  modal: HTMLDialogElement;
  openModal: () => void;
  selectTopic: (topicGuid: string) => void;
  /** Frame estático (mismo contenido que el modal "BCF Topics": acciones +
   *  tabla) para la solapa "BCF Topic" del frame principal. */
  topicsFrame: HTMLElement;
} {
  const topics    = components.get(OBC.BCFTopics);
  const viewpoints = components.get(OBC.Viewpoints);

  const exportTopicsAsFile = async (toExport: OBC.Topic[]): Promise<void> => {
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

  // El detalle del topic (Información/Comentarios/Viewpoints/Relacionados) se
  // muestra como solapa dinámica del panel derecho, no dentro del modal de
  // lista — el modal solo aloja la tabla y las acciones globales
  // (crear/exportar/importar).
  const showTopicPanel = (topic: OBC.Topic) => {
    const [information]   = CUI.sections.topicInformation({ components, topic, styles: { users: TOPIC_USERS } });
    const [vpSection]     = CUI.sections.topicViewpoints({ components, topic, world });
    const [relatedTopics] = CUI.sections.topicRelations({ components, topic });
    const [comments]      = CUI.sections.topicComments({ topic, styles: TOPIC_USERS });

    const content = BUI.Component.create<HTMLElement>(() => BUI.html`
      <div class="bcf-topic-panel">
        <div class="panel-frame-header">
          <bim-icon icon="material-symbols:task"></bim-icon>
          <span>${topic.title}</span>
        </div>
        <bim-panel-section label="Acciones" icon="material-symbols:settings" .fixed=${false}>
          <bim-button label="Eliminar Topic" icon="material-symbols:delete"
            @click=${() => {
              topics.list.delete(topic.guid);
              rightPanel.removeTab(BCF_TOPIC_TAB_ID);
            }}>
          </bim-button>
          <bim-button label="Compartir por Email" icon="mdi:email-outline"
            @click=${async () => {
              await exportTopicsAsFile([topic]);
              shareTopicByEmail(topic);
            }}>
          </bim-button>
          <bim-button label="Compartir por Discord" icon="mdi:discord"
            @click=${async () => {
              try {
                await shareTopicToDiscord(topic);
              } catch (err) {
                alert(err instanceof Error ? err.message : "No se pudo compartir el topic por Discord.");
              }
            }}>
          </bim-button>
        </bim-panel-section>
        <bim-panel-section label="Información"         icon="ph:info-bold"            .fixed=${false}>${information}   </bim-panel-section>
        <bim-panel-section label="Comentarios"         icon="majesticons:comment-line" .fixed=${false}>${comments}      </bim-panel-section>
        <bim-panel-section label="Viewpoints"          icon="tabler:camera"            .fixed=${false}>${vpSection}     </bim-panel-section>
        <bim-panel-section label="Topics Relacionados" icon="tabler:link"              .fixed=${false}>${relatedTopics} </bim-panel-section>
      </div>
    `);

    rightPanel.addTab({
      id: BCF_TOPIC_TAB_ID,
      label: topic.title,
      icon: "material-symbols:task",
      content,
      fixed: false,
    });
  };

  const focusTopicViewpoint = (topic: OBC.Topic): void => {
    const firstVpGuid = [...topic.viewpoints][0];
    if (!firstVpGuid) return;
    const vp = viewpoints.list.get(firstVpGuid);
    if (!vp) return;
    if (!vp.world) vp.world = world;
    vp.go({ transition: true }).catch(console.error);
  };

  // Fábrica de tabla de topics: se usa tanto para la del modal "BCF Topics"
  // como para la del frame estático de la solapa "BCF Topic" — mismo look &
  // comportamiento (hover, click para ver detalle, borrar), cada una con su
  // propia instancia de tabla (un mismo nodo no puede vivir en dos lugares).
  const createTopicsTable = (onRowClick: (topic: OBC.Topic) => void): TopicsTable => {
    const [table] = CUI.tables.topicsList({ components, dataStyles: { users: TOPIC_USERS } });
    table.selectableRows = true;

    // @ts-ignore
    table.addEventListener("rowcreated",
      (event: CustomEvent<BUI.RowCreatedEventDetail<{ Guid: string }>>) => {
        const { row } = event.detail;
        row.style.cursor = "pointer";
        row.style.position = "relative";

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
          onRowClick(topic);
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
          rightPanel.removeTab(BCF_TOPIC_TAB_ID);
        });
        row.addEventListener("mouseover", () => { deleteBtn.style.opacity = "1"; });
        row.addEventListener("mouseout",  () => { deleteBtn.style.opacity = "0"; });
        row.append(deleteBtn);
      },
    );

    return table;
  };

  // Fábrica de los botones de acción (Crear/Descargar/Importar): "Descargar"
  // exporta la selección de la tabla que se le pase (o todos los topics si
  // no hay selección) — cada frame (modal y solapa estática) tiene su propia
  // tabla, así que cada uno arma su propio juego de botones.
  const createActionButtons = (sourceTable: TopicsTable): HTMLElement[] => {
    const createTopicBtn = BUI.Component.create(() => BUI.html`
      <bim-button label="Crear Topic BCF" icon="material-symbols:task"
        @click=${() => {
          resetModalPosition(modal);
          modal.showModal();
        }}>
      </bim-button>
    `);

    const downloadBtn = BUI.Component.create(() => {
      const onDownload = async () => {
        const selected = [...sourceTable.selection]
          .map(({ Guid }) => (Guid && typeof Guid === "string") ? topics.list.get(Guid) : null)
          .filter(Boolean) as OBC.Topic[];
        const toExport = selected.length > 0 ? selected : [...topics.list.values()];
        await exportTopicsAsFile(toExport);
      };
      return BUI.html`
        <bim-button label="Descargar BCF" icon="material-symbols:download" @click=${onDownload}></bim-button>
      `;
    });

    const importBtn = BUI.Component.create(() => {
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
    });

    return [createTopicBtn, downloadBtn, importBtn];
  };

  // — Modal —
  const [topicForm, updateTopicForm] = CUI.forms.topic({ components, styles: { users: TOPIC_USERS } });
  const assigneeDropdown = topicForm.querySelector<BUI.Dropdown>("bim-dropdown[name='assignedTo']");
  if (assigneeDropdown) assigneeDropdown.searchBox = true;

  const modal = BUI.Component.create<HTMLDialogElement>(() => BUI.html`
    <dialog class="bcf-topic-modal">
      <div class="bcf-topic-modal-header">
        <span class="bcf-topic-modal-title">Nuevo Topic</span>
        <button class="bcf-topic-modal-close" type="button" aria-label="Cerrar"
          @click=${() => modal.close()}>
          <iconify-icon icon="material-symbols:close"></iconify-icon>
        </button>
      </div>
      <div class="bcf-topic-modal-body">
        <bim-panel style="border-radius:0;width:22rem;">${topicForm}</bim-panel>
      </div>
    </dialog>
  `);
  document.body.append(modal);
  updateTopicForm({ onCancel: () => modal.close(), onSubmit: () => modal.close() });

  closeOnBackdropClick(modal);
  const topicModalHeader = modal.querySelector(".bcf-topic-modal-header") as HTMLElement;
  makeModalDraggable(modal, topicModalHeader, ".bcf-topic-modal-close");

  // — Frame estático de la solapa "BCF Topic" (reemplaza al antiguo modal de
  // lista "BCF Topics": acciones + tabla) — vive siempre montado en esa
  // solapa, sin dialog ni backdrop, con su propia instancia de tabla y botones.
  const staticTopicsList = createTopicsTable((topic) => {
    showTopicPanel(topic);
    focusTopicViewpoint(topic);
  });
  const [staticCreateBtn, staticDownloadBtn, staticImportBtn] = createActionButtons(staticTopicsList);

  const topicsFrame = BUI.Component.create<HTMLElement>(() => BUI.html`
    <div class="bcf-static-frame">
      <div class="panel-frame-header">
        <bim-icon icon="material-symbols:task"></bim-icon>
        <span>BCF Topics</span>
      </div>
      <bim-panel style="border-radius:0;">
        <bim-panel-section label="Acciones" icon="material-symbols:settings">
          <div class="bcf-actions-row">
            ${staticCreateBtn}
            ${staticDownloadBtn}
            ${staticImportBtn}
          </div>
        </bim-panel-section>
        <bim-panel-section label="Topics" icon="material-symbols:task">
          ${staticTopicsList}
        </bim-panel-section>
      </bim-panel>
    </div>
  `);

  const selectTopic = (topicGuid: string): void => {
    const topic = topics.list.get(topicGuid);
    if (!topic) return;
    showTopicPanel(topic);
    focusTopicViewpoint(topic);
  };

  return {
    modal,
    openModal: () => modal.showModal(),
    topicsFrame,
    selectTopic,
  };
}
