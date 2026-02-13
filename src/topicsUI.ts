// import "@thatopen/ui/dist/style.css";

import * as BUI from "@thatopen/ui";
import * as BCF from "@thatopen/ui-obc";

export function initTopicsUI(components: any, world: any) {
  // Obtener la instancia Topics desde el sistema de componentes
  // Some @thatopen/ui-obc typings may not expose Topics; cast to any to avoid TS error
  const topics = components.get((BCF as any).Topics);
  topics.world = world;

  // Asegurar que topics.list exista (evitar que un map sobre undefined rompa el resto de la UI)
  const safeTopicsList = (topics && topics.list) ? topics.list : [];

  // Tabla de topics
  let topicsTable: any;
  try {
    topicsTable = BUI.Component.create<BUI.PanelSection>(() => {
      return BUI.html`
        <bim-panel active label="Topics List" class="topics-panel">
          <bim-table>
            ${safeTopicsList.map(
              (topic: any) => BUI.html`
                <bim-table-row>
                  <bim-table-cell>${topic.title}</bim-table-cell>
                  <bim-table-cell>${topic.status}</bim-table-cell>
                  <bim-table-cell>${topic.priority}</bim-table-cell>
                </bim-table-row>`
            )}
          </bim-table>
        </bim-panel>
      `;
    });
    document.body.append(topicsTable);
  } catch (err) {
    console.error('Error creando topicsTable:', err);
  }

  // Formulario sencillo para crear topics
  const topicForm = BUI.Component.create<BUI.PanelSection>(() => {
    return BUI.html`
      <bim-panel active label="Create Topic" class="topic-form">
        <bim-input label="Title" @input="${({ target }: { target: BUI.Input }) => {
          topics.newTopic.title = target.value;
        }}"></bim-input>
        <bim-input label="Description" @input="${({ target }: { target: BUI.Input }) => {
          topics.newTopic.description = target.value;
        }}"></bim-input>
        <bim-button label="Create Topic" @click="${() => topics.create()}"></bim-button>
      </bim-panel>
    `;
  });
  document.body.append(topicForm);

  // Intentar crear el formulario de topics usando CUI.forms.topic si está disponible
  try {
    let externalTopicForm: any;
    let updateTopicForm: any;
    const CUI = (globalThis as any).CUI || (window as any).CUI;
    if (CUI && CUI.forms && typeof CUI.forms.topic === 'function') {
      // Obtener estilos/users desde components si existe, si no fallback a objeto vacío
      const users = components.get((BCF as any).Users) || {};

      const result = CUI.forms.topic({
        components,
        styles: { users },
      });

      // CUI.forms.topic puede devolver el elemento directo o un tuple [form, updateFn]
      if (Array.isArray(result)) {
        [externalTopicForm, updateTopicForm] = result;
      } else {
        externalTopicForm = result;
      }

      // Activar searchBox en el dropdown de assignee si existe
      const assigneeDropdown = externalTopicForm?.querySelector?.("bim-dropdown[name='assignedTo']");
      if (assigneeDropdown) assigneeDropdown.searchBox = true;

      // Envolver el formulario dentro de un dialog/modal y añadirlo al DOM
      const topicsModal = BUI.Component.create<HTMLDialogElement>(() => {
        return BUI.html`
          <dialog class="form-dialog">
           <bim-panel style="border-radius: var(--bim-ui_size-base); width: 22rem;">
            ${externalTopicForm}
           </bim-panel> 
          </dialog>
        `;
      });

      document.body.append(topicsModal);
    }
  } catch (err) {
    console.warn('CUI topic form initialization skipped:', err);
  }

  // Botón para abrir modal de topics
  const modalButton = BUI.Component.create<BUI.PanelSection>(() => {
    return BUI.html`
      <bim-button
        label="Show Topics"
        @click="${() => topics.showModal()}"
      ></bim-button>
    `;
  });
  document.body.append(modalButton);

  // Panel de contenido custom (ejemplo)
  const customTopicPanel = BUI.Component.create<BUI.PanelSection>(() => {
    return BUI.html`
      <bim-panel active label="Custom Topic Panel" class="custom-topic-panel">
        <bim-label>Custom content goes here</bim-label>
      </bim-panel>
    `;
  });
  document.body.append(customTopicPanel);

  // Botón para descargar BCF
  const downloadButton = BUI.Component.create<BUI.PanelSection>(() => {
    return BUI.html`
      <bim-button
        label="Download BCF"
        @click="${async () => {
          const bcfData = await topics.exportBCF();
          const file = new File([bcfData], "topics.bcf");
          const link = document.createElement("a");
          link.href = URL.createObjectURL(file);
          link.download = file.name;
          link.click();
          URL.revokeObjectURL(link.href);
        }}"
      ></bim-button>
    `;
  });
  document.body.append(downloadButton);

  // Panel que agrupa la tabla
  const topicsPanel = BUI.Component.create<BUI.PanelSection>(() => {
    return BUI.html`
      <bim-panel active label="Topics Panel" class="topics-panel">
        ${topicsTable}
      </bim-panel>
    `;
  });
  document.body.append(topicsPanel);

  return topics;
}