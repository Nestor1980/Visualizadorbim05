//1 Importaciones
import * as THREE from "three";
import Stats from "stats.js";
import * as OBC from "@thatopen/components";
import * as BUI from "@thatopen/ui";
import * as FRAGS from "@thatopen/fragments";
import * as OBF from "@thatopen/components-front";
import * as CUI from "@thatopen/ui-obc";

// 1.1 Seleccionar el contenedor HTML
const container = document.getElementById('container');

if (container) {

  const viewport = document.createElement("bim-viewport");

  // 2.1 Inicializar el núcleo de la plataforma
  const components = new OBC.Components();
  console.log("✅ 02_Components creado");

  // 2.2 Crear el Mundo con tipos específicos
  const worlds = components.get(OBC.Worlds);
  const world = worlds.create<
    OBC.SimpleScene,
    OBC.OrthoPerspectiveCamera,
    OBC.SimpleRenderer
  >();
  console.log("✅ 2.2_World creado");

  // 2.3 Asignar escena, renderer y cámara
  world.scene = new OBC.SimpleScene(components);
  world.renderer = new OBF.PostproductionRenderer(components, viewport);
  world.camera = new OBC.OrthoPerspectiveCamera(components);
  console.log("✅ 2.3_World configurado");

  // 2.4 Inicializar el sistema de componentes
  components.init();
  console.log("✅ 2.4_Components inicializado");

  // ===============================
  // PASO 3 – BCFTopics
  // ===============================
  const topics = components.get(OBC.BCFTopics);
  topics.setup({
    users: new Set(["arquitecto@proyecto.com", "ingeniero@proyecto.com"]),
    labels: new Set(["Arquitectura", "Estructura", "MEP", "Coordinación"]),
  });

  const viewpoints = components.get(OBC.Viewpoints);
  topics.list.onItemSet.add(({ value: topic }) => {
    const viewpoint = viewpoints.create();
    viewpoint.world = world;
    viewpoint.updateCamera();
    topic.viewpoints.add(viewpoint.guid);
  });
  console.log("✅ 3_BCFTopics + Viewpoints configurados");

  // ===============================
  // PASO 4 – Hoverer
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
  console.log("✅ 4.1_Hoverer configurado");

  // PASO 4.2 – Highlighter para selección de elementos
  const highlighter = components.get(OBF.Highlighter);
  highlighter.setup({ world });
  console.log("✅ 4.2_Highlighter configurado");

  // ===============================
  // PASO 5 – LengthMeasurement
  // ===============================
  const measurer = components.get(OBF.LengthMeasurement);
  measurer.world = world;
  measurer.color = new THREE.Color("#494cb6");
  measurer.enabled = false;
  measurer.snappings = [FRAGS.SnappingClass.POINT];

  // NOTA: viewport.ondblclick y window.onkeydown se definen
  // más abajo en el MUTEX, bifurcando según el modo activo.

  measurer.list.onItemAdded.add((line) => {
    const center = new THREE.Vector3();
    line.getCenter(center);
    const radius = line.distance() / 3;
    const sphere = new THREE.Sphere(center, radius);
    world.camera.controls.fitToSphere(sphere, true);
  });
  console.log("✅ 5_LengthMeasurement configurado");

  // ===============================
  // PASO 5.5 – Clipper (Planos de Sección)
  // ===============================
  const clipper = components.get(OBC.Clipper);
  clipper.enabled = false;
  console.log("✅ 5.5_Clipper configurado");

  // ===============================
  // MUTEX DE HERRAMIENTAS
  // ===============================
  type ToolMode = "navigate" | "measure" | "section";
  let activeMode: ToolMode = "navigate";

  let measureBtnEl: BUI.Button | null = null;
  let sectionBtnEl: BUI.Button | null = null;

  const setMode = (mode: ToolMode) => {
    activeMode = mode;

    // Desactivar todo primero
    measurer.enabled = false;
    highlighter.enabled = false;
    hoverer.enabled = false;
    clipper.enabled = false;

    if (mode === "navigate") {
      highlighter.enabled = true;
      hoverer.enabled = true;
    } else if (mode === "measure") {
      measurer.enabled = true;
    } else if (mode === "section") {
      clipper.enabled = true;
    }

    // Estilos de botón activo/inactivo
    const activeStyle = {
      background: "var(--bim-ui_main-base)",
      borderRadius: "4px",
      outline: "2px solid var(--bim-ui_accent-base, #6528d7)",
    };
    const resetStyle = { background: "", borderRadius: "", outline: "" };

    [measureBtnEl, sectionBtnEl].forEach(btn => {
      if (btn) Object.assign(btn.style, resetStyle);
    });

    if (mode === "measure" && measureBtnEl) Object.assign(measureBtnEl.style, activeStyle);
    if (mode === "section" && sectionBtnEl) Object.assign(sectionBtnEl.style, activeStyle);

    console.log(`🔧 Modo activo: ${mode}`);
  };

  // Doble click: bifurca según modo activo
  viewport.ondblclick = () => {
    if (activeMode === "measure") measurer.create();
    else if (activeMode === "section") clipper.create(world);
  };

  // Delete / Backspace: bifurca según modo activo
  window.onkeydown = (event) => {
    if (event.code === "Delete" || event.code === "Backspace") {
      if (activeMode === "measure") measurer.delete();
      else if (activeMode === "section") clipper.deletePlane();
    }
  };

  // Estado inicial: navegación con highlighter y hoverer activos
  setMode("navigate");
  console.log("✅ MUTEX_Modos de herramienta configurados (navigate | measure | section)");

  // ===============================
  // PASO 6 – Escena y entorno visual
  // ===============================
  world.scene.setup();
  world.scene.three.background = new THREE.Color('#202932');
  const grids = components.get(OBC.Grids);
  grids.create(world);
  await world.camera.controls.setLookAt(10, 10, 10, 0, 0, 0);
  console.log("✅ 6.1_Escena configurada");

  // ===============================
  // PASO 7 – FragmentsManager
  // ===============================
  const fragments = components.get(OBC.FragmentsManager);
  const workerUrl = "/workers/worker.mjs";
  fragments.init(workerUrl);
  console.log("✅ 7.1_FragmentsManager configurado");

  world.camera.controls.addEventListener("update", () => {
    fragments.core.update();
  });

  // PASO 7.3 – Agregar modelos a la escena
  fragments.list.onItemSet.add(({ value: model }) => {
    model.useCamera(world.camera.three);
    world.scene.three.add(model.object);
    fragments.core.update(true);
    console.log("✅ 7.3_Modelo agregado a la escena");
  });

  // ===============================
  // PASO 8 – IfcLoader
  // ===============================
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

  // ===============================
  // PASO 9 – startApp
  // ===============================
  const startApp = async () => {
    await setupIfcLoader();
    BUI.Manager.init();
    CUI.Manager.init();
    console.log("✅ 9.1_BUI y CUI Managers inicializados");

    // PASO 8.3 – Descargar fragmentos
    const downloadFragments = async () => {
      const [model] = fragments.list.values();
      if (!model) { console.warn("No hay modelo para descargar"); return; }
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
    // PASO 10 – Panel de mediciones
    // ===============================
    const deleteDimensions = () => measurer.list.clear();

    const getAllValues = () => {
      const lengths: number[] = [];
      for (const line of measurer.list) lengths.push(line.value);
      return lengths;
    };

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
            processData: { progressCallback: (p) => console.log("Progreso:", p) },
          });
          console.log("✅ Modelo cargado!");
        };
        input.click();
      };
      return BUI.html`
        <bim-button label="Cargar IFC" icon="mage:box-3d-fill" @click=${onClick}>
        </bim-button>
      `;
    });

    const [modelsList] = CUI.tables.modelsList({
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
            <bim-label>Doble click: crear medición / plano de sección</bim-label>
            <bim-label>Delete / Backspace: borrar</bim-label>
            <bim-button label="Descargar .frag" @click=${() => downloadFragments()}>
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

            <bim-dropdown label="Unidades" required
              @change="${({ target }: { target: BUI.Dropdown }) => {
                const [units] = target.value;
                measurer.units = units;
              }}">
              ${measurer.unitsList.map(
                (unit) => BUI.html`
                  <bim-option label=${unit} value=${unit} ?checked=${unit === measurer.units}>
                  </bim-option>`
              )}
            </bim-dropdown>

            <bim-dropdown label="Precisión" required
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

            <bim-button label="Borrar todo" @click=${() => deleteDimensions()}>
            </bim-button>
          </bim-panel-section>

          <!-- ===============================
               SECCIÓN CLIPPER (NUEVA)
               =============================== -->
          <bim-panel-section label="Sección" icon="material-symbols:cut">

            <bim-checkbox label="Flip plano"
              @change="${({ target }: { target: BUI.Checkbox }) => {
                clipper.flipPlane = target.value;
              }}">
            </bim-checkbox>

            <bim-number-input
              label="Tamaño del plano"
              value="5"
              min="1"
              max="30"
              step="1"
              suffix="m"
              @change="${({ target }: { target: BUI.NumberInput }) => {
                clipper.size = target.value;
              }}">
            </bim-number-input>

            <bim-button
              label="Borrar todos los planos"
              icon="material-symbols:delete-outline"
              @click=${() => clipper.deleteAll()}>
            </bim-button>

          </bim-panel-section>

        </bim-panel>
      `;
    });
    console.log("✅ 10.2_Panel creado (incluye sección Clipper)");

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
    // ETAPA 1 – rightPanel con acordeón: Spatial Tree + BCF
    // ===============================
    const rightPanel = document.createElement("bim-panel") as BUI.Panel;
    rightPanel.label = "Panel";

    // 1.2.1 – Spatial Tree
    const [spatialTree, updateSpatialTree] = CUI.tables.spatialTree({
      components,
      models: fragments.list.values(),
      selectHighlighterName: "select",
    });

    // 1.2.2 – Sección acordeón colapsable
    const spatialSection = document.createElement("bim-panel-section") as BUI.PanelSection;
    spatialSection.label = "Spatial Structures";
    spatialSection.icon = "material-symbols:account-tree";
    spatialSection.collapsed = true;
    spatialSection.append(spatialTree);
    rightPanel.append(spatialSection);

    // 1.2.3 – Actualizar árbol al cargar modelo
    fragments.list.onItemSet.add(() => {
      updateSpatialTree({ models: fragments.list.values() });
      spatialSection.collapsed = false;
      console.log("✅ 1.2_SpatialTree actualizado");
    });
    console.log("✅ ETAPA 1_Spatial Structures creado");

    // ===============================
    // ETAPA 2 – Quantities / Selection Information
    // ===============================

    const [itemsDataTable, updateItemsData] = CUI.tables.itemsData({
      components,
      modelIdMap: {},
      emptySelectionWarning: true,
    });

    const quantitiesSection = document.createElement("bim-panel-section") as BUI.PanelSection;
    quantitiesSection.label = "Selection Information";
    quantitiesSection.icon = "material-symbols:info";
    quantitiesSection.collapsed = true;
    quantitiesSection.append(itemsDataTable);
    rightPanel.append(quantitiesSection);

    spatialTree.selectableRows = true;

    spatialTree.addEventListener("click", (event: Event) => {
      const path = event.composedPath();
      const row = path.find((el: any) => el.tagName === "BIM-TABLE-ROW") as any;
      if (!row?.data) return;

      const modelId = row.data.modelId as string;
      const localId = row.data.localId as number;
      if (!modelId || localId === undefined) return;

      updateItemsData({
        modelIdMap: { [modelId]: new Set([localId]) },
        emptySelectionWarning: false,
      });

      quantitiesSection.collapsed = false;
      console.log(`✅ Selection: ${row.data.Name} | localId=${localId}`);
    });

    console.log("✅ ETAPA 2_Quantities Panel creado");

    // ===============================
    // ETAPA 3 – Quantities Panel (Cómputo Métrico)
    // ===============================

    interface ItemComputo {
      id: string;
      nombre: string;
      unidad: string;
      cantidadRef: number;
      categorias: RegExp[];
      metodo: "volumen" | "area" | "longitud" | "conteo" | "manual";
    }

    const rubroII: ItemComputo[] = [
      { id: "3.1",  nombre: "Movimiento de suelo bajo platea",         unidad: "m³", cantidadRef: 923.59, categorias: [/IFCEARTHWORKS/i],    metodo: "volumen" },
      { id: "4.1",  nombre: "Plateas de HºAº",                         unidad: "m³", cantidadRef: 169.29, categorias: [/IFCSLAB/i],           metodo: "volumen" },
      { id: "4.2",  nombre: "Riostras Verticales",                     unidad: "m³", cantidadRef: 27.55,  categorias: [/IFCCOLUMN/i],         metodo: "volumen" },
      { id: "4.3",  nombre: "Encadenado superior",                     unidad: "m³", cantidadRef: 24.51,  categorias: [/IFCBEAM/i],           metodo: "volumen" },
      { id: "4.4",  nombre: "Viga de borde",                           unidad: "m³", cantidadRef: 3.42,   categorias: [/IFCBEAM/i],           metodo: "volumen" },
      { id: "4.5",  nombre: "Losa Voladizo",                           unidad: "m³", cantidadRef: 3.04,   categorias: [/IFCSLAB/i],           metodo: "volumen" },
      { id: "5.1",  nombre: "Mampostería ladrillo hueco e=0.20m",      unidad: "m²", cantidadRef: 2484.25,categorias: [/IFCWALL/i],           metodo: "area"    },
      { id: "5.2",  nombre: "Mampostería ladrillo hueco e=0.15m",      unidad: "m²", cantidadRef: 506.35, categorias: [/IFCWALL/i],           metodo: "area"    },
      { id: "5.3",  nombre: "Mampostería ladrillo hueco e=0.10m",      unidad: "m²", cantidadRef: 110.20, categorias: [/IFCWALL/i],           metodo: "area"    },
      { id: "5.4",  nombre: "Mampostería ladrillo común e=0.30m",      unidad: "m³", cantidadRef: 83.22,  categorias: [/IFCWALL/i],           metodo: "volumen" },
      { id: "6.1",  nombre: "Capa aisladora envolvente",               unidad: "m²", cantidadRef: 963.87, categorias: [/IFCCOVERING/i],       metodo: "area"    },
      { id: "7.1",  nombre: "Cubierta chapa BWG Nº25 + estructura",    unidad: "m²", cantidadRef: 1115.30,categorias: [/IFCROOF/i, /IFCSLAB/i],metodo: "area"   },
      { id: "9.1",  nombre: "Cielorraso Durlock con perfilería",        unidad: "m²", cantidadRef: 911.43, categorias: [/IFCCOVERING/i],       metodo: "area"    },
      { id: "11.3", nombre: "Cerámico 30x30",                          unidad: "m²", cantidadRef: 914.09, categorias: [/IFCCOVERING/i],       metodo: "area"    },
      { id: "14.1", nombre: "Puerta P1 (0.90x2.05) ingreso",           unidad: "un", cantidadRef: 19,     categorias: [/IFCDOOR/i],           metodo: "conteo"  },
      { id: "14.2", nombre: "Puerta P2 (0.80x2.05) interiores",        unidad: "un", cantidadRef: 57,     categorias: [/IFCDOOR/i],           metodo: "conteo"  },
      { id: "14.4", nombre: "Ventana V1 (0.80x0.50)",                  unidad: "un", cantidadRef: 19,     categorias: [/IFCWINDOW/i],         metodo: "conteo"  },
      { id: "14.5", nombre: "Ventana V2 (0.30x1.50)",                  unidad: "un", cantidadRef: 57,     categorias: [/IFCWINDOW/i],         metodo: "conteo"  },
      { id: "14.6", nombre: "Ventana V3 (1.50x1.00)",                  unidad: "un", cantidadRef: 38,     categorias: [/IFCWINDOW/i],         metodo: "conteo"  },
    ];

    interface FilaQuantity {
      item: ItemComputo;
      cantidadModelo: number | null;
      estado: "pendiente" | "ok" | "sin_datos";
      localIds: number[];
    }

    let filasQuantity: FilaQuantity[] = rubroII.map(item => ({
      item,
      cantidadModelo: null,
      estado: "pendiente",
      localIds: [],
    }));

    const extraerCantidades = async () => {
      const [model] = fragments.list.values();
      if (!model) return;

      for (const fila of filasQuantity) {
        try {
          const resultados = await model.getItemsOfCategories(fila.item.categorias);
          const ids: number[] = [];
          for (const [, itemIds] of Object.entries(resultados)) {
            ids.push(...(itemIds as number[]));
          }

          if (ids.length === 0) {
            fila.estado = "sin_datos";
            continue;
          }

          fila.localIds = ids;

          if (fila.item.metodo === "conteo") {
            fila.cantidadModelo = ids.length;
            fila.estado = "ok";
          } else if (fila.item.metodo === "volumen") {
            const vol = await model.getItemsVolume(ids);
            fila.cantidadModelo = Math.round(vol * 100) / 100;
            fila.estado = "ok";
          } else {
            const vol = await model.getItemsVolume(ids);
            fila.cantidadModelo = Math.round(vol * 100) / 100;
            fila.estado = "ok";
          }
        } catch (e) {
          fila.estado = "sin_datos";
          console.warn(`Error ítem ${fila.item.id}:`, e);
        }
      }

      renderQuantitiesTable();
      console.log("✅ 3.3_Cantidades extraídas");
    };

    const quantitiesContainer = document.createElement("div");

    const renderQuantitiesTable = () => {
      quantitiesContainer.innerHTML = "";

      const header = document.createElement("div");
      header.style.cssText = `
        display: grid;
        grid-template-columns: 45px 1fr 45px 75px 75px 30px;
        gap: 2px;
        margin-bottom: 4px;
        font-size: 10px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        padding: 4px 6px;
        background: var(--bim-ui_bg-contrast-20, #2a2a2a);
        border-radius: 4px;
      `;
      header.innerHTML = `
        <span>Ítem</span>
        <span>Descripción</span>
        <span>Und.</span>
        <span style="text-align:right">Ref.</span>
        <span style="text-align:right">Modelo</span>
        <span>⊙</span>
      `;
      quantitiesContainer.append(header);

      for (const fila of filasQuantity) {
        const row = document.createElement("div");
        row.style.cssText = `
          display: grid;
          grid-template-columns: 45px 1fr 45px 75px 75px 30px;
          gap: 2px;
          padding: 3px 6px;
          font-size: 11px;
          border-bottom: 1px solid var(--bim-ui_bg-contrast-10, #222);
          cursor: pointer;
          align-items: center;
        `;

        const diff = fila.cantidadModelo !== null
          ? fila.cantidadModelo - fila.item.cantidadRef
          : null;

        const colorModelo = diff === null ? "inherit"
          : Math.abs(diff) < fila.item.cantidadRef * 0.05 ? "#22c55e"
          : diff > 0 ? "#f59e0b" : "#ef4444";

        const estadoIcon = fila.estado === "ok" ? "✅"
          : fila.estado === "sin_datos" ? "❌" : "⏳";

        row.innerHTML = `
          <span style="opacity:0.7">${fila.item.id}</span>
          <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap"
                title="${fila.item.nombre}">${fila.item.nombre}</span>
          <span style="opacity:0.7;text-align:center">${fila.item.unidad}</span>
          <span style="text-align:right;opacity:0.6">${fila.item.cantidadRef.toLocaleString("es-AR")}</span>
          <span style="text-align:right;color:${colorModelo};font-weight:600">
            ${fila.cantidadModelo !== null
              ? fila.cantidadModelo.toLocaleString("es-AR")
              : "–"}
          </span>
          <span style="text-align:center">${estadoIcon}</span>
        `;

        row.addEventListener("click", () => {
          if (fila.localIds.length === 0) return;
          const [model] = fragments.list.values();
          if (!model) return;

          updateItemsData({
            modelIdMap: { [model.modelId]: new Set(fila.localIds) },
            emptySelectionWarning: false,
          });
          quantitiesSection.collapsed = false;
          console.log(`✅ Ítem ${fila.item.id} → ${fila.localIds.length} elementos`);
        });

        quantitiesContainer.append(row);
      }
    };

    const quantitiesPanelSection = document.createElement("bim-panel-section") as BUI.PanelSection;
    quantitiesPanelSection.label = "Quantities";
    quantitiesPanelSection.icon = "material-symbols:table";
    quantitiesPanelSection.collapsed = true;

    const extractBtn = document.createElement("bim-button") as BUI.Button;
    extractBtn.label = "Extraer Cantidades";
    extractBtn.icon = "material-symbols:calculate";
    extractBtn.addEventListener("click", () => extraerCantidades());

    quantitiesPanelSection.append(extractBtn);
    quantitiesPanelSection.append(quantitiesContainer);
    rightPanel.append(quantitiesPanelSection);

    fragments.list.onItemSet.add(async () => {
      await extraerCantidades();
      quantitiesPanelSection.collapsed = false;
    });

    console.log("✅ ETAPA 3_Quantities Panel creado");

    // ===============================
    // PASO 16 – Floating Toolbar
    // (incluye nueva sección "Sección" con Clipper)
    // ===============================
    const toolbar = BUI.Component.create<BUI.Toolbar>(() => {
      return BUI.html`
        <bim-toolbar style="justify-self: center;">

          <bim-toolbar-section label="Cámara">
            <bim-button
              tooltip-title="Perspectiva"
              tooltip-text="Alternar entre cámara ortográfica y perspectiva"
              icon="tabler:camera"
              @click=${() => world.camera.projection.toggle()}>
            </bim-button>
            <bim-button
              tooltip-title="Fit Model"
              tooltip-text="Ajustar vista al modelo cargado"
              icon="material-symbols:fit-screen"
              @click=${async () => {
                const meshes = world.scene.three.children.filter(
                  (c): c is THREE.Mesh => c instanceof THREE.Mesh
                );
                await world.camera.fit(meshes);
              }}>
            </bim-button>
          </bim-toolbar-section>

          <bim-toolbar-section label="Medición">
            <bim-button
              tooltip-title="Activar Medición"
              tooltip-text="Activa/desactiva la herramienta de medición. Doble click para medir."
              icon="solar:ruler-bold"
              ${BUI.ref((el: Element | undefined) => { measureBtnEl = el as BUI.Button ?? null; })}
              @click=${() => {
                if (activeMode === "measure") setMode("navigate");
                else setMode("measure");
              }}>
            </bim-button>
            <bim-button
              tooltip-title="Borrar mediciones"
              tooltip-text="Elimina todas las líneas de medición"
              icon="material-symbols:delete-outline"
              @click=${() => measurer.list.clear()}>
            </bim-button>
          </bim-toolbar-section>

          <!-- ===============================
               NUEVA SECCIÓN: PLANOS DE CORTE
               =============================== -->
          <bim-toolbar-section label="Sección">
            <bim-button
              tooltip-title="Plano de corte"
              tooltip-text="Activa/desactiva la herramienta de sección. Doble click sobre el modelo para crear un plano de corte."
              icon="material-symbols:cut"
              ${BUI.ref((el: Element | undefined) => { sectionBtnEl = el as BUI.Button ?? null; })}
              @click=${() => {
                if (activeMode === "section") setMode("navigate");
                else setMode("section");
              }}>
            </bim-button>
            <bim-button
              tooltip-title="Borrar planos"
              tooltip-text="Elimina todos los planos de corte activos"
              icon="material-symbols:layers-clear"
              @click=${() => clipper.deleteAll()}>
            </bim-button>
          </bim-toolbar-section>

          <bim-toolbar-section label="Visibilidad">
            <bim-button
              tooltip-title="Mostrar todo"
              tooltip-text="Restaura la visibilidad de todos los elementos"
              icon="material-symbols:visibility"
              @click=${() => {
                for (const [, model] of fragments.list) {
                  model.object.visible = true;
                }
                fragments.core.update(true);
                console.log("Visibilidad: todo visible");
              }}>
            </bim-button>
          </bim-toolbar-section>

          <bim-toolbar-section label="BCF">
            <bim-button
              tooltip-title="Nuevo Topic"
              tooltip-text="Abre el formulario para crear un nuevo BCF Topic"
              icon="material-symbols:task"
              @click=${() => topicsModal.showModal()}>
            </bim-button>
          </bim-toolbar-section>

        </bim-toolbar>
      `;
    });
    console.log("✅ 16.1_Floating Toolbar creada (incluye Sección)");

    // ===============================
    // PASO 11 – Grid layout
    // ===============================
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
    document.body.append(toolbar);
    console.log("✅ 11_bim-grid layout activado");

    // ===============================
    // PASO 13 – BCF Topics
    // ===============================
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

    const [topicsList] = CUI.tables.topicsList({
      components,
      dataStyles: { users: topicUsers },
    });

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

    let currentTopicPanel: HTMLElement | null = null;

    const showTopicPanel = (topic: OBC.Topic) => {
      if (currentTopicPanel) currentTopicPanel.remove();

      const [information] = CUI.sections.topicInformation({
        components, topic, styles: { users: topicUsers },
      });
      const [viewpoints] = CUI.sections.topicViewpoints({ components, topic, world });
      const [relatedTopics] = CUI.sections.topicRelations({ components, topic });
      const [comments] = CUI.sections.topicComments({ topic, styles: topicUsers });

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

    // @ts-ignore
    topicsList.addEventListener(
      "rowcreated",
      (event: CustomEvent<BUI.RowCreatedEventDetail<{ Guid: string }>>) => {
        const { row } = event.detail;
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

    const bcfSection = document.createElement("bim-panel-section") as BUI.PanelSection;
    bcfSection.label = "BCF Topics";
    bcfSection.icon = "material-symbols:task";
    bcfSection.collapsed = true;
    bcfSection.append(topicsList);
    rightPanel.append(bcfSection);
    console.log("✅ 13.3_TopicsList agregada al panel derecho");

    // ===============================
    // PASO 14 – Formulario Modal de Topics
    // ===============================
    const [topicForm, updateTopicForm] = CUI.forms.topic({
      components,
      styles: { users: topicUsers },
    });

    const assigneeDropdown = topicForm.querySelector<BUI.Dropdown>(
      "bim-dropdown[name='assignedTo']",
    );
    if (assigneeDropdown) {
      assigneeDropdown.searchBox = true;
      console.log("✅ D_Searchbox en asignado activado");
    }

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

    updateTopicForm({
      onCancel: () => topicsModal.close(),
      onSubmit: () => topicsModal.close(),
    });

    const showFormBtn = BUI.Component.create(() => {
      return BUI.html`
        <bim-button
          label="Crear Topic BCF"
          icon="material-symbols:task"
          @click=${() => topicsModal.showModal()}>
        </bim-button>
      `;
    });
    rightPanel.prepend(showFormBtn);

    const downloadBtn = BUI.Component.create(() => {
      const onDownload = async () => {
        const selectedTopics = [...topicsList.selection]
          .map(({ Guid }) => {
            if (!(Guid && typeof Guid === "string")) return null;
            return topics.list.get(Guid);
          })
          .filter((topic) => topic) as OBC.Topic[];

        const topicsToExport = selectedTopics.length > 0
          ? selectedTopics
          : [...topics.list.values()];

        if (topicsToExport.length === 0) {
          console.warn("No hay topics para exportar");
          return;
        }

        const bcfData = await topics.export(topicsToExport);
        const timestamp = new Date().toISOString().slice(0, 10);
        const bcfFile = new File([bcfData], `VisorBIM_${timestamp}.bcfzip`);
        const a = document.createElement("a");
        a.href = URL.createObjectURL(bcfFile);
        a.download = bcfFile.name;
        a.click();
        URL.revokeObjectURL(a.href);
        console.log("✅ BCF exportado!");
      };
      return BUI.html`
        <bim-button label="Descargar BCF" icon="material-symbols:download" @click=${onDownload}>
        </bim-button>
      `;
    });
    rightPanel.prepend(downloadBtn);

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
        <bim-button label="Importar BCF" icon="material-symbols:upload" @click=${onImport}>
        </bim-button>
      `;
    });
    rightPanel.prepend(importBtn);
    console.log("✅ E_Botón importar BCF creado");
    console.log("✅ 14.5_Formulario modal y botón BCF creados");

    console.log("Visor BIM activo ✅");
  }; // ✅ Esta llave cierra startApp

  startApp();
}