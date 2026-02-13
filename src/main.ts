import * as THREE from "three";
import Stats from "stats.js";
import * as OBC from "@thatopen/components";
import * as BUI from "@thatopen/ui";
import * as FRAGS from "@thatopen/fragments";
// You have to import * as OBF from "@thatopen/components-front"
import * as OBF from "@thatopen/components-front";
// Import para TopicsUI y componentes BCF
import * as CUI from "@thatopen/ui-obc";



// 1. Seleccionar el contenedor HTML
const container = document.getElementById('container');

if (container) {
    // 2. Inicializar el núcleo de la plataforma
    const components = new OBC.Components();
    console.log("✅ 02_Components creado");

    // 3. Crear el Mundo con tipos específicos (Genéricos)
    const worlds = components.get(OBC.Worlds);
    const world = worlds.create<
      OBC.SimpleScene,
      OBC.OrthoPerspectiveCamera,
      OBC.SimpleRenderer
    >();
    console.log("✅ 03_World creado");



  // 4. Asignar las instancias correspondientes
  world.scene = new OBC.SimpleScene(components);
  world.renderer = new OBF.PostproductionRenderer(components, container);
  world.camera = new OBC.OrthoPerspectiveCamera(components);
  console.log("✅ 04_World configurado");

  // 5. Inicializar el sistema de componentes
  components.init();
  console.log("✅ 05_Components inicializado");

  // ===============================
// PASO 3 – Hoverer
// ===============================
const hoverer = components.get(OBF.Hoverer);

hoverer.world = world;
hoverer.enabled = true;

hoverer.material = new THREE.MeshBasicMaterial({
  color: 0x6528d7,
  transparent: true,
  opacity: 0.5,
  depthTest: false,
});


  // 📏 PASO 5.1 – Crear LengthMeasurement (That Open Front – API correcta)
const measurer = components.get(OBF.LengthMeasurement);
measurer.world = world;
measurer.color = new THREE.Color("#494cb6");
measurer.enabled = true;
measurer.snappings = [FRAGS.SnappingClass.POINT];
container.ondblclick = () => {
  measurer.create();
};
window.onkeydown = (event) => {
  if (event.code === "Delete" || event.code === "Backspace") {
    measurer.delete();
  }
};
measurer.list.onItemAdded.add((line) => {
  const center = new THREE.Vector3();
  line.getCenter(center);
  const radius = line.distance() / 3;
  const sphere = new THREE.Sphere(center, radius);

  world.camera.controls.fitToSphere(sphere, true);
});


  // 6. Configurar la escena y el entorno visual
  world.scene.setup();
  world.scene.three.background = new THREE.Color('#202932');
  const grids = components.get(OBC.Grids);
  grids.create(world);
  await world.camera.controls.setLookAt(10, 10, 10, 0, 0, 0);
  console.log("✅ 06_Escena configurada");


  // 7. Configurar el FragmentsManager primero (IMPORTANTE)
  const fragments = components.get(OBC.FragmentsManager);
  const workerUrl = "/workers/worker.mjs"; // ✅ URL local
fragments.init(workerUrl);
console.log("✅ FragmentsManager configurado con worker local")
  // Configurar los eventos del FragmentsManager
  world.camera.controls.addEventListener("update", () => {
  fragments.core.update();
});


  // Asegurar que los modelos se agreguen a la escena cuando se carguen
  fragments.list.onItemSet.add(({ value: model }) => {
    model.useCamera(world.camera.three);
    world.scene.three.add(model.object);
    fragments.core.update(true);
    console.log("✅ 07a_Modelo agregado a la escena");
  });

// 8. Configurar el cargador IFC
  const ifcLoader = components.get(OBC.IfcLoader);
  
  // Configurar el setup del IFC Loader
  const setupIfcLoader = async () => {
    await ifcLoader.setup({
      autoSetWasm: false,
      wasm: {
        path: "https://unpkg.com/web-ifc@0.0.72/",
        absolute: true,
      },
    });
    console.log("✅ 08_IfcLoader configurado");
  };

  // 9. Definir la lógica de carga del modelo DESDE DISCO LOCAL
  const loadExampleModel = async () => {
    const input = document.getElementById("file-input") as HTMLInputElement;
    
    if (!input) {
      console.error("No se encontró el elemento 'file-input'");
      return;
    }
    
    input.addEventListener("change", async () => {
      const file = input.files?.[0];
      if (!file) return;
      
      console.log("📂 Cargando archivo:", file.name);
      
      const data = await file.arrayBuffer();
      const buffer = new Uint8Array(data);
      
      // Cargar con el formato actualizado según la documentación
      await ifcLoader.load(buffer, false, file.name, {
        processData: {
          progressCallback: (progress) => console.log("Progreso:", progress),
        },
      });
      
      console.log("✅ Modelo cargado desde tu disco!");
    });
  };

  // 10. Función opcional para descargar el modelo como Fragments
  const downloadFragments = async () => {
    const [model] = fragments.list.values();
    if (!model) {
      console.warn("No hay modelo para descargar");
      return;
    }
    
    const fragsBuffer = await model.getBuffer(false);
    const file = new File([fragsBuffer], "modelo.frag");
    const link = document.createElement("a");
    link.href = URL.createObjectURL(file);
    link.download = file.name;
    link.click();
    URL.revokeObjectURL(link.href);
    console.log("✅ Fragments descargados");
  };

  // ===============================
  // NUEVO: CONFIGURACIÓN DE BCF TOPICS
  // ===============================
  
  // Definir usuarios para el sistema BCF
  const users: CUI.TopicUserStyles = {
    "admin@proyecto.com": {
      name: "Administrador",
      picture: "https://www.profilebakery.com/wp-content/uploads/2023/04/Profile-Image-AI.jpg",
    },
    "arquitecto@proyecto.com": {
      name: "Arquitecto Principal",
      picture: "https://www.profilebakery.com/wp-content/uploads/2023/04/Portrait-Photography.jpg",
    },
    "ingeniero@proyecto.com": {
      name: "Ingeniero Estructural",
      picture: "https://www.profilebakery.com/wp-content/uploads/2023/04/AI-Portrait.jpg",
    },
  };

  // Obtener el componente BCFTopics
  const topics = components.get(OBC.BCFTopics);

  // Configurar usuarios y etiquetas
  topics.setup({
    users: new Set(Object.keys(users)),
    labels: new Set(["Arquitectura", "Estructura", "MEP", "Coordinación", "General"]),
  });

  // Configurar viewpoints (puntos de vista)
  const viewpoints = components.get(OBC.Viewpoints);
  topics.list.onItemSet.add(({ value: topic }) => {
    const viewpoint = viewpoints.create();
    viewpoint.world = world;
    topic.viewpoints.add(viewpoint.guid);
  });

  console.log("✅ BCFTopics configurado");

  // ===============================
  // CREAR TABLA DE TOPICS
  // ===============================
  
  const [topicsList] = CUI.tables.topicsList({
    components,
    dataStyles: { users },
  });

  // Permitir selección de filas
  topicsList.selectableRows = true;

  // ===============================
  // CREAR FORMULARIO DE TOPICS
  // ===============================
  
  const [topicForm, updateTopicForm] = CUI.forms.topic({
    components,
    styles: { users },
  });

  // Activar búsqueda en dropdown de asignados
  const assigneeDropdown = topicForm.querySelector<BUI.Dropdown>(
    "bim-dropdown[name='assignedTo']",
  );
  if (assigneeDropdown) assigneeDropdown.searchBox = true;

  // Crear modal para el formulario
  const topicsModal = BUI.Component.create<HTMLDialogElement>(() => {
    return BUI.html`
      <dialog class="form-dialog">
       <bim-panel style="border-radius: var(--bim-ui_size-base); width: 22rem;">
        ${topicForm}
       </bim-panel> 
      </dialog>
    `;
  });

  document.body.append(topicsModal);

  // Botón para mostrar el formulario
  const showFormBtn = BUI.Component.create(() => {
    const onClick = () => {
      topicsModal.showModal();
    };

    return BUI.html`
      <bim-button style="flex: 0" @click=${onClick} label="Crear Tema" icon="material-symbols:task"></bim-button>
    `;
  });

  // Configurar callbacks del formulario
  updateTopicForm({
    onCancel: () => {
      topicsModal.close();
    },
    onSubmit: () => {
      topicsModal.close();
    },
  });

  // ===============================
  // CREAR PANEL DE DETALLES DEL TOPIC
  // ===============================

  interface TopicPanelActions {
    information: Partial<CUI.TopicInformationSectionActions>;
    viewpoints: Partial<CUI.TopicViewpointsSectionActions>;
    relatedTopics: Partial<CUI.TopicRelationsSectionActions>;
    comments: Partial<CUI.TopicCommentsSectionActions>;
  }

  interface TopicPanelUI {
    components: OBC.Components;
    topic?: OBC.Topic;
    styles?: Partial<CUI.TopicStyles>;
    actions?: Partial<TopicPanelActions>;
    world?: OBC.World;
  }

  const [topicPanel, updateTopicPanel] = BUI.Component.create<
    HTMLElement,
    TopicPanelUI
  >(
    (state) => {
      const { components, topic, world, actions, styles } = state;

      let topicSections: BUI.TemplateResult | undefined;
      let missingTopicSection: BUI.TemplateResult | undefined;

      if (topic) {
        const [information] = CUI.sections.topicInformation({
          components,
          topic,
          actions: actions?.information,
          styles,
        });

        const [viewpoints] = CUI.sections.topicViewpoints({
          components,
          topic,
          world,
          actions: actions?.viewpoints,
        });

        const [relatedTopics] = CUI.sections.topicRelations({
          components,
          topic,
          actions: actions?.relatedTopics,
        });

        const [comments] = CUI.sections.topicComments({
          topic,
          actions: actions?.comments,
          styles: styles?.users,
        });

        topicSections = BUI.html`
          <bim-panel-section label="Información" icon="ph:info-bold">
            ${information}
          </bim-panel-section>
          <bim-panel-section label="Comentarios" icon="majesticons:comment-line">
            ${comments}
          </bim-panel-section>
          <bim-panel-section label="Vistas" icon="tabler:camera">
            ${viewpoints}
          </bim-panel-section>
          <bim-panel-section label="Temas Relacionados" icon="tabler:link">
            ${relatedTopics}
          </bim-panel-section>
        `;
      } else {
        missingTopicSection = BUI.html`
          <bim-panel-section label="Sin Tema" icon="material-symbols:chat-error">
            <bim-label>No hay ningún tema seleccionado para mostrar</bim-label>
          </bim-panel-section> 
        `;
      }

      return BUI.html`
        <bim-panel>
          ${missingTopicSection}
          ${topicSections}
        </bim-panel> 
      `;
    },
    { components, world, styles: { users } },
  );

  // Actualizar panel cuando cambia un topic
  topics.list.onItemUpdated.add(() => updateTopicPanel());

  // Evento click en las filas de la tabla
  // @ts-ignore
  topicsList.addEventListener(
    "rowcreated",
    (event: CustomEvent<BUI.RowCreatedEventDetail<{ Guid: string }>>) => {
      const { row } = event.detail;
      row.addEventListener("click", () => {
        const { Guid } = row.data;
        if (!Guid) return;
        const topic = topics.list.get(Guid);
        if (!topic) return;
        updateTopicPanel({ topic });
      });

      row.style.cursor = "pointer";
      row.addEventListener("mouseover", () => {
        row.style.backgroundColor = `color-mix(
          in lab,
          var(--bim-ui_bg-contrast-20) 30%,
          var(--bim-ui_main-base) 10%
        )`;
      });

      row.addEventListener("mouseout", () => {
        row.style.removeProperty("background-color");
      });
    },
  );

  // ===============================
  // BOTÓN PARA DESCARGAR BCF
  // ===============================

  const downloadBtn = BUI.Component.create(() => {
    const onDownload = async () => {
      const selectedTopics = [...topicsList.selection]
        .map(({ Guid }) => {
          if (!(Guid && typeof Guid === "string")) return null;
          const topic = topics.list.get(Guid);
          return topic;
        })
        .filter((topic) => topic) as OBC.Topic[];

      const topicsToExport =
        selectedTopics.length > 0 ? selectedTopics : [...topics.list.values()];

      if (topicsToExport.length === 0) {
        alert("No hay temas para descargar");
        return;
      }

      const bcfData = await topics.export(topicsToExport);
      const bcfFile = new File([bcfData], "temas.bcf");

      const a = document.createElement("a");
      a.href = URL.createObjectURL(bcfFile);
      a.download = bcfFile.name;
      a.click();
      URL.revokeObjectURL(a.href);
      
      console.log("✅ BCF descargado");
    };

    return BUI.html`<bim-button style="flex: 0" @click=${onDownload} label="Descargar BCF" icon="material-symbols:download"></bim-button> `;
  });

  // ===============================
  // PANEL PRINCIPAL BCF
  // ===============================

  const bcfPanel = BUI.Component.create(() => {
    const onTextInput = (e: Event) => {
      const input = e.target as BUI.TextInput;
      topicsList.queryString = input.value;
    };

    return BUI.html`
      <bim-panel>
        <bim-panel-section label="Gestión BCF" fixed>
          <div style="display: flex; justify-content: space-between; gap: 0.5rem">
            <bim-text-input style="flex-grow: 0; flex-basis: 15rem" @input=${onTextInput} placeholder="Buscar tema..." debounce="100"></bim-text-input>
            <div style="display: flex; gap: 0.5rem">
              ${showFormBtn}
              ${downloadBtn}
            </div> 
          </div> 
          ${topicsList}
        </bim-panel-section>
      </bim-panel>
    `;
  });

  // 10. Ejecutar la aplicación e inicializar la UI
const startApp = async () => {
  await setupIfcLoader();
  await loadExampleModel();
  BUI.Manager.init();
  
  // ===============================
// UI – Length Measurement Panel
// ===============================

const deleteDimensions = () => {
  measurer.list.clear();
};

const getAllValues = () => {
  const lengths: number[] = [];
  for (const line of measurer.list) {
    lengths.push(line.value);
  }
  return lengths;
};

const measurementPanel = BUI.Component.create<BUI.PanelSection>(() => {
  const onLogValues = () => {
    const data = getAllValues();
    console.log("📏 Medidas:", data);
  };

  return BUI.html`
    <bim-panel active label="Mediciones de Distancia" class="options-menu">
      <bim-panel-section label="Controles">
        <bim-label>Doble click: crear medición</bim-label>
        <bim-label>Delete / Backspace: borrar</bim-label>
      </bim-panel-section>

      <bim-panel-section label="Medidor">
        <bim-checkbox checked label="Habilitado"
          @change="${({ target }: { target: BUI.Checkbox }) => {
            measurer.enabled = target.value;
          }}">
        </bim-checkbox>

        <bim-checkbox checked label="Visible"
          @change="${({ target }: { target: BUI.Checkbox }) => {
            measurer.visible = target.value;
          }}">
        </bim-checkbox>

        <bim-color-input
          label="Color"
          color=#${measurer.linesMaterial.color.getHexString()}
          @input="${({ target }: { target: BUI.ColorInput }) => {
            measurer.color = new THREE.Color(target.color);
          }}">
        </bim-color-input>

        <bim-dropdown
          label="Unidades"
          required
          @change="${({ target }: { target: BUI.Dropdown }) => {
            const [units] = target.value;
            measurer.units = units;
          }}">
          ${measurer.unitsList.map(
            (unit) =>
              BUI.html`<bim-option
                label=${unit}
                value=${unit}
                ?checked=${unit === measurer.units}>
              </bim-option>`
          )}
        </bim-dropdown>

        <bim-dropdown
          label="Precisión"
          required
          @change="${({ target }: { target: BUI.Dropdown }) => {
            const [rounding] = target.value;
            measurer.rounding = rounding;
          }}">
          <bim-option label="0" value=0></bim-option>
          <bim-option label="1" value=1></bim-option>
          <bim-option label="2" value=2 checked></bim-option>
          <bim-option label="3" value=3></bim-option>
          <bim-option label="4" value=4></bim-option>
        </bim-dropdown>

        <bim-button label="Borrar todo"
          @click=${() => deleteDimensions()}>
        </bim-button>

        <bim-button label="Log de valores"
          @click=${onLogValues}>
        </bim-button>
      </bim-panel-section>
    </bim-panel>
  `;
});

document.body.append(measurementPanel);

const toggleButton = BUI.Component.create<BUI.PanelSection>(() => {
  return BUI.html`
    <bim-button
      class="phone-menu-toggler"
      icon="solar:settings-bold"
      @click="${() => {
        measurementPanel.classList.toggle("options-menu-visible");
      }}">
    </bim-button>
  `;
});

document.body.append(toggleButton);

  // ===============================
  // CREAR GRID LAYOUT CON BCF
  // ===============================
  
  const viewport = document.createElement("bim-viewport") as BUI.Viewport;
  viewport.append(container);

  const app = document.createElement("bim-grid") as BUI.Grid<["main"]>;
  app.layouts = {
    main: {
      template: `
      "topicPanel viewport" 1fr
      "topicPanel bcfPanel" 25rem
      /24rem 1fr
      `,
      elements: { 
        bcfPanel, 
        viewport, 
        topicPanel 
      },
    },
  };

  app.layout = "main";
  document.body.append(app);

  console.log("✅ Visor BIM con BCF Topics activo");
};

startApp();
}