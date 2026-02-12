import * as THREE from "three";
import Stats from "stats.js";
import * as OBC from "@thatopen/components";
import * as BUI from "@thatopen/ui";
import * as FRAGS from "@thatopen/fragments";
// You have to import * as OBF from "@thatopen/components-front"
import * as OBF from "@thatopen/components-front";



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

const panel = BUI.Component.create<BUI.PanelSection>(() => {
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

document.body.append(panel);
const button = BUI.Component.create<BUI.PanelSection>(() => {
  return BUI.html`
    <bim-button
      class="phone-menu-toggler"
      icon="solar:settings-bold"
      @click="${() => {
        panel.classList.toggle("options-menu-visible");
      }}">
    </bim-button>
  `;
});

document.body.append(button);

  console.log("Visor BIM activo");
};  // ✅ Esta llave cierra la función startApp

startApp();
}
