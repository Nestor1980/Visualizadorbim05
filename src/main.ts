import * as THREE from 'three';
import * as OBC from '@thatopen/components';
import * as BUI from '@thatopen/ui';
// You have to import * as FRAGS from "@thatopen/fragments"
import * as FRAGS from "@thatopen/fragments";



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
  world.renderer = new OBC.SimpleRenderer(components, container);
  world.camera = new OBC.OrthoPerspectiveCamera(components);
  console.log("✅ 04_World configurado");

  // 5. Inicializar el sistema de componentes
  components.init();
  console.log("✅ 05_Components inicializado");


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
  world.camera.controls.addEventListener("rest", () =>
    fragments.core.update(true)
  );

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
  console.log("Visor BIM activo");
};  // ✅ Esta llave cierra la función startApp

startApp();
}
