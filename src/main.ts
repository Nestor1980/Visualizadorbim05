//1 Importaciones
import * as THREE from "three";
import Stats from "stats.js";
import * as OBC from "@thatopen/components";
import * as BUI from "@thatopen/ui";
import * as FRAGS from "@thatopen/fragments";
// You have to import * as OBF from "@thatopen/components-front"
import * as OBF from "@thatopen/components-front";
import * as CUI from "@thatopen/ui-obc";


// 1.1 Seleccionar el contenedor HTML
const container = document.getElementById('container');

if (container) {

      const viewport = document.createElement("bim-viewport");

    // 2.1 Inicializar el núcleo de la plataforma
    const components = new OBC.Components();
    console.log("✅ 02_Components creado");

    // 2.2 Crear el Mundo con tipos específicos (Genéricos)
    const worlds = components.get(OBC.Worlds);
    const world = worlds.create<
      OBC.SimpleScene,
      OBC.OrthoPerspectiveCamera,
      OBC.SimpleRenderer
    >();
    console.log("✅ 2.2_World creado");



  // 2.3 Asignar las instancias de escena, renderer y cámara al mundo
  world.scene = new OBC.SimpleScene(components);
world.renderer = new OBF.PostproductionRenderer(components, viewport);
  world.camera = new OBC.OrthoPerspectiveCamera(components);
  console.log("✅ 2.3_World configurado");

  // 2.4 Inicializar el sistema de componentes
  components.init();
  console.log("✅ 2.4_Components inicializado");

// PASO 3 – Motor Lógico de BCF (El Cerebro) ✅

/// PASO 3 – BCFTopics configurado correctamente
const topics = components.get(OBC.BCFTopics);

topics.setup({
  users: new Set(["arquitecto@proyecto.com", "ingeniero@proyecto.com"]),
  labels: new Set(["Arquitectura", "Estructura", "MEP", "Coordinación"]),
});

// Conectar Viewpoints a cada topic que se cree
// El world se pasa al viewpoint, no al componente topics
const viewpoints = components.get(OBC.Viewpoints);
topics.list.onItemSet.add(({ value: topic }) => {
  const viewpoint = viewpoints.create();
  viewpoint.world = world;
  
  // ✅ Capturar la posición actual de la cámara
  viewpoint.updateCamera();
  
  topic.viewpoints.add(viewpoint.guid);
});

console.log("✅ 3_BCFTopics + Viewpoints configurados");



// =================================
// PASO 4 – Hoverer
// =================================
// PASO 4.1 – Instanciar y configurar el Hoverer
const hoverer = components.get(OBF.Hoverer);
hoverer.world = world;
hoverer.enabled = true;
hoverer.material = new THREE.MeshBasicMaterial({
  color: 0x6528d7,
  transparent: true,
  opacity: 0.5,
  depthTest: false,
});
console.log("✅ 4.1_Hoverer configurado");

// ===================================================
// PASO 5 – LengthMeasurement (Medición de distancias) ✅
// ===================================================

// PASO 5.1 – Instanciar y configurar el componente de medición
const measurer = components.get(OBF.LengthMeasurement);
measurer.world = world;
measurer.color = new THREE.Color("#494cb6");
measurer.enabled = true;
measurer.snappings = [FRAGS.SnappingClass.POINT];

// PASO 5.2 – Crear medición con doble click sobre el canvas
viewport.ondblclick = () => {
  measurer.create();
};

// PASO 5.3 – Borrar última medición con Delete o Backspace
window.onkeydown = (event) => {
  if (event.code === "Delete" || event.code === "Backspace") {
    measurer.delete();
  }
};

// PASO 5.4 – Al agregar una línea, hacer zoom/fit a la medición
measurer.list.onItemAdded.add((line) => {
  const center = new THREE.Vector3();
  line.getCenter(center);
  const radius = line.distance() / 3;
  const sphere = new THREE.Sphere(center, radius);

  world.camera.controls.fitToSphere(sphere, true);
});
console.log("✅ 5.4_LengthMeasurement configurado");


// ===============================
// PASO 6 – Configuración de la escena y entorno visual ✅
// ===============================  

// PASO 6.1 – Setup de luces, fondo y grilla
  world.scene.setup();
  world.scene.three.background = new THREE.Color('#202932');
  const grids = components.get(OBC.Grids);
  grids.create(world);
  await world.camera.controls.setLookAt(10, 10, 10, 0, 0, 0);
  console.log("✅ 6.1_Escena configurada");


  // ===============================
  // PASO 7 – FragmentsManager (Gestión de modelos IFC) ✅
  // ===============================

  // PASO 7.1 – Instanciar y configurar el FragmentsManager con worker local

  const fragments = components.get(OBC.FragmentsManager);
  const workerUrl = "/workers/worker.mjs"; 
fragments.init(workerUrl);
console.log("✅ 7.1_FragmentsManager configurado con worker local")


  // PASO 7.2 – Sincronizar la cámara con el core de fragmentos en cada frame
  world.camera.controls.addEventListener("update", () => {
  fragments.core.update();
});


  // PASO 7.3 – Agregar modelos a la escena cuando se carguen
  fragments.list.onItemSet.add(({ value: model }) => {
    model.useCamera(world.camera.three);
    world.scene.three.add(model.object);
    fragments.core.update(true);
    console.log("✅ 7.3_Modelo agregado a la escena");
  });

// ===============================
  // PASO 8 – IfcLoader (Cargador de archivos IFC) ✅
  // ===============================

  // PASO 8.1 – Setup del IfcLoader con WASM remoto
  const ifcLoader = components.get(OBC.IfcLoader);
  
  const setupIfcLoader = async () => {
    await ifcLoader.setup({
      autoSetWasm: false,
      wasm: {
        path: "https://unpkg.com/web-ifc@0.0.74/",
        absolute: true,
      },
    });
    console.log("✅ 8.1_IfcLoader configurado");
  };

  // PASO 8.2 – Lógica para cargar un modelo IFC desde disco local (input file)

  

  // ===============================
  // PASO 9 – startApp: Arranque de la aplicación y construcción de la UI ✅
  // ===============================

const startApp = async () => {
  await setupIfcLoader();
  BUI.Manager.init();
  CUI.Manager.init();
  console.log("✅ 9.1_BUI y CUI Managers inicializados");

  // PASO 8.3 – Función opcional para exportar el modelo como archivo .frag
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
    console.log("✅ 8.3_Fragments descargados");
  };


// ===============================
// PASO 10 – Panel de mediciones (LengthMeasurement UI) ✅
// ===============================


// PASO 10.2 – Crear el panel BUI de controles de medición
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

// Crear ANTES del panel
// ✅ REEMPLAZAR con:
const loadIfcBtn = BUI.Component.create<BUI.Button>(() => {
  const onClick = async () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".ifc";
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      console.log("📂 Cargando:", file.name);
      const data = await file.arrayBuffer();
      const buffer = new Uint8Array(data);
      await ifcLoader.load(buffer, false, file.name, {
        processData: {
          progressCallback: (p) => console.log("Progreso:", p),
        },
      });
      console.log("✅ Modelo cargado!");
    };
    input.click();
  };

  return BUI.html`
    <bim-button 
      label="Cargar IFC" 
      icon="mage:box-3d-fill"
      @click=${onClick}>
    </bim-button>
  `;
});const [modelsList] = CUI.tables.modelsList({
  components,
  metaDataTags: ["schema"],
  actions: { download: false },
});

const panel = BUI.Component.create<BUI.PanelSection>(() => {
  

  return BUI.html`
    <bim-panel active label="Visualizador BIM" class="options-menu">

      <bim-panel-section label="Modelos IFC" icon="mage:box-3d-fill">
        ${loadIfcBtn}
        ${modelsList}
      </bim-panel-section>

      <bim-panel-section label="Controles" icon="solar:ruler-bold">
        <bim-label>Doble click: crear medición</bim-label>
        <bim-label>Delete / Backspace: borrar</bim-label>
        <bim-button label="Descargar .frag"
          @click=${() => downloadFragments()}>
        </bim-button>
      </bim-panel-section>

      <bim-panel-section label="Medidor" icon="solar:ruler-cross-pen-bold">
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

        
      </bim-panel-section>
    </bim-panel>
  `;
});

console.log("✅ 10.2_Panel de mediciones creado");

// ✅ REEMPLAZAR con:
measurer.list.onItemAdded.add(() => {
  const existing = panel.querySelector("bim-panel-section[label='Mediciones']");
  if (existing) existing.remove();

  const section = document.createElement("bim-panel-section");
section.setAttribute("label", "Mediciones");
  const values = getAllValues();
  if (values.length === 0) {
    const label = document.createElement("bim-label");
    label.textContent = "No hay mediciones";
    section.append(label);
  } else {
    values.forEach((v, i) => {
      const label = document.createElement("bim-label");
      label.textContent = `Medición ${i + 1}: ${v.toFixed(2)} m`;
      section.append(label);
    });
  }
  panel.append(section);
});
// ===============================
// PASO 11 y 12 – Layout integrado ✅
// ===============================

const rightPanel = document.createElement("bim-panel") as BUI.Panel;
rightPanel.label = "BCF Topics";

const grid = document.createElement("bim-grid") as BUI.Grid<["main"]>;
document.body.append(grid);

await new Promise(r => setTimeout(r, 50));

grid.layouts = {
  main: {
    template: `
      "sidebar viewport right" 1fr
      / 300px 1fr 320px
    `,
    elements: {
      sidebar: panel,
      viewport: viewport,
      right: rightPanel,
    },
  },
};

grid.layout = "main";
console.log("✅ 11_bim-grid layout activado por código");
    // ===============================
// PASO 13 – Lista de BCF Topics ✅
// ===============================

// PASO 13.1 – Estilos de usuarios BCF
const topicUsers: CUI.TopicUserStyles = {
  "arquitecto@proyecto.com": {
    name: "Arquitecto Principal",
    picture: "https://i.pravatar.cc/150?img=3",
  },
  "ingeniero@proyecto.com": {
    name: "Ingeniero Estructural",
    picture: "https://i.pravatar.cc/150?img=7",
  },
};

// PASO 13.2 – Crear la tabla de topics
const [topicsList] = CUI.tables.topicsList({
  components,
  dataStyles: { users: topicUsers },
});

// PASO B.1 – Interfaces para el Topic Panel
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
console.log("✅ B.1_Interfaces TopicPanel definidas");

// PASO B.2 – Crear el Topic Panel como función simple
let currentTopicPanel: HTMLElement | null = null;

const showTopicPanel = (topic: OBC.Topic) => {
  // Remover panel anterior si existe
  if (currentTopicPanel) currentTopicPanel.remove();

  const [information] = CUI.sections.topicInformation({
    components,
    topic,
    styles: { users: topicUsers },
  });

  const [viewpoints] = CUI.sections.topicViewpoints({
    components,
    topic,
    world,
  });

  const [relatedTopics] = CUI.sections.topicRelations({
    components,
    topic,
  });

  const [comments] = CUI.sections.topicComments({
    topic,
    styles: topicUsers,
  });

  currentTopicPanel = BUI.Component.create(() => {
    return BUI.html`
      <bim-panel label="${topic.title}">

      <bim-panel-section label="Acciones" icon="material-symbols:settings">
      <bim-button
        label="Eliminar Topic"
        icon="material-symbols:delete"
        @click=${() => {
          topics.list.delete(topic.guid);
          if (currentTopicPanel) currentTopicPanel.remove();
          currentTopicPanel = null;
          console.log("✅ Topic eliminado:", topic.title);
        }}>
      </bim-button>
    </bim-panel-section>

        <bim-panel-section label="Información" icon="ph:info-bold">
          ${information}
        </bim-panel-section>
        <bim-panel-section label="Comentarios" icon="majesticons:comment-line">
          ${comments}
        </bim-panel-section>
        <bim-panel-section label="Viewpoints" icon="tabler:camera">
          ${viewpoints}
        </bim-panel-section>
        <bim-panel-section label="Topics Relacionados" icon="tabler:link">
          ${relatedTopics}
        </bim-panel-section>
      </bim-panel>
    `;
  });

  rightPanel.append(currentTopicPanel);
};

console.log("✅ B.2_showTopicPanel definido");

topicsList.selectableRows = true;
console.log("✅ 13.2_TopicsList creada");

// PASO A.1 – Hacer las filas clickeables con hover
// @ts-ignore
topicsList.addEventListener(
  "rowcreated",
  (event: CustomEvent<BUI.RowCreatedEventDetail<{ Guid: string }>>) => {
    const { row } = event.detail;

    // Cursor pointer para indicar que es clickeable
    row.style.cursor = "pointer";

    // Efecto hover al entrar el mouse
    row.addEventListener("mouseover", () => {
      row.style.backgroundColor = `color-mix(
        in lab,
        var(--bim-ui_bg-contrast-20) 30%,
        var(--bim-ui_main-base) 10%
      )`;
    });

    // Remover efecto hover al salir el mouse
    row.addEventListener("mouseout", () => {
      row.style.removeProperty("background-color");
    });

    // Al hacer clic en la fila — por ahora solo un log
    row.addEventListener("click", () => {
      const { Guid } = row.data;
      if (!Guid) return;
      const topic = topics.list.get(Guid);
      if (!topic) return;
      showTopicPanel(topic);
console.log("✅ Topic seleccionado:", topic.title);
    });
  },
);
console.log("✅ A.1_Filas interactivas configuradas");

// PASO 13.3 – Agregar la lista al panel derecho del grid


rightPanel.append(topicsList);
console.log("✅ 13.3_TopicsList agregada al panel derecho");

// ===============================
// PASO 14 – Formulario Modal de Topics ✅
// ===============================

// PASO 14.1 – Crear el formulario de topics
const [topicForm, updateTopicForm] = CUI.forms.topic({
  components,
  styles: { users: topicUsers },
});

// PASO D – Searchbox en el dropdown de asignado
const assigneeDropdown = topicForm.querySelector<BUI.Dropdown>(
  "bim-dropdown[name='assignedTo']",
);
if (assigneeDropdown) {
  assigneeDropdown.searchBox = true;
  console.log("✅ D_Searchbox en asignado activado");
}

// PASO 14.2 – Envolver en dialog modal
const topicsModal = BUI.Component.create<HTMLDialogElement>(() => {
  return BUI.html`
    <dialog style="
      border: none;
      border-radius: 8px;
      padding: 0;
      background: transparent;
      box-shadow: 0 8px 32px rgba(0,0,0,0.4);
    ">
      <bim-panel style="border-radius: 8px; width: 22rem;">
        ${topicForm}
      </bim-panel>
    </dialog>
  `;
});
document.body.append(topicsModal);

// PASO 14.3 – Callbacks del formulario
updateTopicForm({
  onCancel: () => topicsModal.close(),
  onSubmit: () => topicsModal.close(),
});

// PASO 14.4 – Botón para abrir el modal
const showFormBtn = BUI.Component.create(() => {
  return BUI.html`
    <bim-button
      label="Crear Topic BCF"
      icon="material-symbols:task"
      @click=${() => topicsModal.showModal()}>
    </bim-button>
  `;
});

// PASO 14.5 – Agregar botón encima de la lista en el panel derecho
rightPanel.prepend(showFormBtn);

// PASO C – Botón Download BCF
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
      selectedTopics.length > 0
        ? selectedTopics
        : [...topics.list.values()];

    if (topicsToExport.length === 0) {
      console.warn("No hay topics para exportar");
      return;
    }

    const bcfData = await topics.export(topicsToExport);
    const timestamp = new Date().toISOString().slice(0, 10);
    const projectName = "VisorBIM";
    const bcfFile = new File([bcfData], `${projectName}_${timestamp}.bcfzip`);

    const a = document.createElement("a");
    a.href = URL.createObjectURL(bcfFile);
    a.download = bcfFile.name;
    a.click();
    URL.revokeObjectURL(a.href);
    console.log("✅ BCF exportado!");
  };

  return BUI.html`
    <bim-button
      label="Descargar BCF"
      icon="material-symbols:download"
      @click=${onDownload}>
    </bim-button>
  `;
});

rightPanel.prepend(downloadBtn);

// PASO E – Botón Importar BCF
const importBtn = BUI.Component.create(() => {
  const onImport = async () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".bcf,.bcfzip";
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      console.log("📂 Importando BCF:", file.name);
      const buffer = await file.arrayBuffer();
      await topics.load(new Uint8Array(buffer));
      console.log("✅ BCF importado correctamente");
    };
    input.click();
  };

  return BUI.html`
    <bim-button
      label="Importar BCF"
      icon="material-symbols:upload"
      @click=${onImport}>
    </bim-button>
  `;
});

rightPanel.prepend(importBtn);
console.log("✅ E_Botón importar BCF creado");

console.log("✅ 14.5_Formulario modal y botón BCF creados");

    // ===============================
    // PASO 15 – Ajustes Finales y Estilos ⚪ (PENDIENTE)
    // Ref Paso 7 del mapa
    // ===============================

    // TODO PASO 15.1 – Estilizar bim-panel para que ocupe el alto total
    // TODO PASO 15.2 – Verificar que el doble clic y mediciones funcionen dentro del grid



  console.log("Visor BIM activo");
};  // ✅ Esta llave cierra la función startApp

startApp();
}
