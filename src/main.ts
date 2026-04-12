// ===============================
// IMPORTACIONES
// ===============================
import * as THREE from "three";
import * as OBC from "@thatopen/components";
import * as BUI from "@thatopen/ui";
import * as FRAGS from "@thatopen/fragments";
import * as OBF from "@thatopen/components-front";
import * as CUI from "@thatopen/ui-obc";

// ===============================
// HELPER: Conversión de materiales a Phong
// ===============================

/**
 * Convierte cualquier material a MeshPhongMaterial preservando el color original.
 * MeshPhongMaterial responde a luces direccionales, dando volumen y sombra.
 */
function convertToPhong(mat: THREE.Material): THREE.MeshPhongMaterial {
  const src = mat as any;
  const color = src.color
    ? (src.color as THREE.Color).clone()
    : new THREE.Color(0xd4cfc8);

  return new THREE.MeshPhongMaterial({
    color,
    transparent: src.transparent ?? false,
    opacity:     src.opacity ?? 1,
    side:        THREE.DoubleSide,
    shininess:   12,
    specular:    new THREE.Color(0x1a1a1a),
  });
}

// ===============================
// PALETA DE COLORES POR CATEGORÍA IFC
// ===============================

const IFC_FALLBACK_COLORS: Record<
  string,
  { hex: number; opacity?: number; transparent?: boolean }
> = {
  IFCWALL:              { hex: 0xf0ebe0 },
  IFCWALLSTANDARDCASE: { hex: 0xf0ebe0 },
  IFCSLAB:              { hex: 0xc8c0b0 },
  IFCCOLUMN:            { hex: 0xb8b0a0 },
  IFCBEAM:              { hex: 0xa8a090 },
  IFCROOF:              { hex: 0x606060 },
  IFCDOOR:              { hex: 0x9b7b4a },
  IFCWINDOW:            { hex: 0x88bbdd, opacity: 0.35, transparent: true },
  IFCSTAIR:             { hex: 0xd4c5a9 },
  IFCCOVERING:          { hex: 0xddd0b8 },
  IFCFURNISHINGELEMENT: { hex: 0xc0a882 },
  IFCPLATE:             { hex: 0xb0a898 },
  IFCMEMBER:            { hex: 0x909888 },
  IFCFOOTING:           { hex: 0xa8a090 },
  IFCPILE:              { hex: 0xa8a090 },
  IFCFLOWSEGMENT:       { hex: 0xff6b35 },
  IFCFLOWFITTING:       { hex: 0xff6b35 },
  IFCFLOWTERMINAL:      { hex: 0xff9500 },
  IFCPIPESEGMENT:       { hex: 0xff6b35 },
  IFCPIPEFITTING:       { hex: 0xff6b35 },
  IFCDUCTSEGMENT:       { hex: 0x7ec8e3 },
  IFCDUCTFITTING:       { hex: 0x7ec8e3 },
  IFCCURTAINWALL:       { hex: 0x99ccee, opacity: 0.4, transparent: true },
  IFCSPACE:             { hex: 0x88ccaa, opacity: 0.15, transparent: true },
};

// ===============================
// ESTILOS DE SECCIÓN POR CATEGORÍA IFC
// ===============================

// Categorías IFC que reciben relleno de sección (muros, losas, estructura)
const SECTION_FILL_CATEGORIES: RegExp[] = [
  /IFCWALL/i, /IFCWALLSTANDARDCASE/i,
  /IFCSLAB/i,
  /IFCCOLUMN/i, /IFCBEAM/i,
  /IFCFOOTING/i, /IFCPILE/i,
  /IFCROOF/i,
];

// ===============================
// ESTILOS COMPACTOS PANEL DERECHO
// ===============================
{
  const s = document.createElement("style");
  s.textContent = `
    /* Reducir espaciado interno en tablas BUI del panel derecho ~35% */
    bim-table {
      --bim-ui--gap: 2px;
      --bim-ui--size-xs: 14px;
      --bim-ui--size-sm: 18px;
      line-height: 1.2;
    }
    bim-table-row, bim-table-row * {
      min-height: unset !important;
      padding-top: 1px !important;
      padding-bottom: 1px !important;
      line-height: 1.25 !important;
    }
    bim-label {
      line-height: 1.2 !important;
      padding: 1px 2px !important;
    }
  `;
  document.head.appendChild(s);
}

// ===============================
// BOOTSTRAP
// ===============================

const container = document.getElementById("container");

if (container) {
  const viewport = document.createElement("bim-viewport");

  // ===============================
  // PASO 2 – Components + World
  // ===============================
  const components = new OBC.Components();
  console.log("✅ 02_Components creado");

  const worlds = components.get(OBC.Worlds);
  const world  = worlds.create<
    OBC.SimpleScene,
    OBC.OrthoPerspectiveCamera,
    OBC.SimpleRenderer
  >();
  console.log("✅ 2.2_World creado");

  world.scene    = new OBC.SimpleScene(components);
  world.renderer = new OBF.PostproductionRenderer(components, viewport);
  world.camera   = new OBC.OrthoPerspectiveCamera(components);
  console.log("✅ 2.3_World configurado");

  components.init();
  console.log("✅ 2.4_Components inicializado");

  // ===============================
  // PASO 3 – BCFTopics
  // ===============================
  const topics = components.get(OBC.BCFTopics);
  topics.setup({
    users:  new Set(["arquitecto@proyecto.com", "ingeniero@proyecto.com"]),
    labels: new Set(["Arquitectura", "Estructura", "MEP", "Coordinación"]),
  });

  const viewpoints = components.get(OBC.Viewpoints);
  topics.list.onItemSet.add(({ value: topic }) => {
    const vp   = viewpoints.create();
    vp.world   = world;
    vp.updateCamera();
    topic.viewpoints.add(vp.guid);
  });
  console.log("✅ 3_BCFTopics + Viewpoints configurados");

  // ===============================
  // PASO 4 – Hoverer + Highlighter
  // ===============================
  const hoverer    = components.get(OBF.Hoverer);
  hoverer.world    = world;
  hoverer.enabled  = true;
  hoverer.material = new THREE.MeshBasicMaterial({
    color: 0x6528d7, transparent: true, opacity: 0.5, depthTest: false,
  });
  console.log("✅ 4.1_Hoverer configurado");

  const highlighter = components.get(OBF.Highlighter);
  highlighter.setup({ world });
  console.log("✅ 4.2_Highlighter configurado");

  // ===============================
  // PASO 5 – LengthMeasurement
  // ===============================
  const measurer     = components.get(OBF.LengthMeasurement);
  measurer.world     = world;
  measurer.color     = new THREE.Color("#494cb6");
  measurer.enabled   = false;
  measurer.snappings = [FRAGS.SnappingClass.POINT];

  measurer.list.onItemAdded.add((line) => {
    const center = new THREE.Vector3();
    line.getCenter(center);
    world.camera.controls.fitToSphere(
      new THREE.Sphere(center, line.distance() / 3), true
    );
  });
  console.log("✅ 5_LengthMeasurement configurado");

  // ===============================
  // PASO 5.5 – Clipper + Section Fill via Stencil Buffer
  // Técnica correcta: front-face decrement / back-face increment.
  // El stencil queda > 0 solo en la cara de corte (sección transversal).
  // NOTA: la postproducción se desactiva en modo sección porque el
  // EffectComposer de @pmndrs/postprocessing crea render targets sin
  // stencilBuffer, lo que impediría que esta técnica funcione.
  // ===============================

  const clipper   = components.get(OBC.Clipper);
  clipper.enabled = false;

  const sectionFillGroup   = new THREE.Group();
  sectionFillGroup.name    = "SectionFillGroup";
  sectionFillGroup.visible = false;
  world.scene.three.add(sectionFillGroup);

  // Meshes de categorías objetivo – se populan al cargar el modelo
  let fillSourceMeshes: THREE.Mesh[] = [];

  const rebuildSectionFills = () => {
    while (sectionFillGroup.children.length)
      sectionFillGroup.remove(sectionFillGroup.children[0]);

    if (fillSourceMeshes.length === 0) return;

    for (const [, cp] of (clipper as any).list) {
      const plane: THREE.Plane | undefined = (cp as any).plane;
      if (!(plane instanceof THREE.Plane)) continue;

      // — Paso stencil: front decrement + back increment —
      const stencilGroup = new THREE.Group();
      for (const mesh of fillSourceMeshes) {
        mesh.updateWorldMatrix(true, false);
        for (const [side, op] of [
          [THREE.FrontSide, THREE.DecrementWrapStencilOp],
          [THREE.BackSide,  THREE.IncrementWrapStencilOp],
        ] as [THREE.Side, THREE.StencilOp][]) {
          const mat = new THREE.MeshBasicMaterial({
            colorWrite: false, depthWrite: false,
            side, clippingPlanes: [plane],
          });
          mat.stencilWrite = true;
          mat.stencilFunc  = THREE.AlwaysStencilFunc;
          mat.stencilFail  = op;
          mat.stencilZFail = op;
          mat.stencilZPass = op;
          const sm = new THREE.Mesh(mesh.geometry, mat);
          sm.matrixAutoUpdate = false;
          sm.matrix.copy(mesh.matrixWorld);
          sm.renderOrder = 3;
          stencilGroup.add(sm);
        }
      }
      sectionFillGroup.add(stencilGroup);

      // — Plano de relleno: dibuja donde stencil ≠ 0, luego lo limpia —
      const fillMat = new THREE.MeshBasicMaterial({
        color: 0xC0B8A8, side: THREE.DoubleSide,
        depthWrite: false, depthTest: false,
      });
      fillMat.stencilWrite = true;
      fillMat.stencilRef   = 0;
      fillMat.stencilFunc  = THREE.NotEqualStencilFunc;
      fillMat.stencilFail  = THREE.ReplaceStencilOp;
      fillMat.stencilZFail = THREE.ReplaceStencilOp;
      fillMat.stencilZPass = THREE.ReplaceStencilOp;

      const fillMesh = new THREE.Mesh(new THREE.PlaneGeometry(2000, 2000), fillMat);
      fillMesh.renderOrder = 4;
      fillMesh.quaternion.setFromUnitVectors(
        new THREE.Vector3(0, 0, 1), plane.normal.clone().normalize()
      );
      fillMesh.position.copy(plane.normal.clone().multiplyScalar(-plane.constant));
      sectionFillGroup.add(fillMesh);
    }
  };

  console.log("✅ 5.5_Section Fill Stencil preparado");

  // ===============================
  // MUTEX DE HERRAMIENTAS
  // ===============================
  type ToolMode = "navigate" | "measure" | "section";
  let activeMode: ToolMode = "navigate";

  let measureBtnEl: BUI.Button | null = null;
  let sectionBtnEl: BUI.Button | null = null;
  // Wrapper para postproduction (se asigna después de su creación).
  // Usar un objeto evita que TypeScript estreche el tipo a `never` en closures.
  const pp = { ref: null as { enabled: boolean } | null };

  const setMode = (mode: ToolMode) => {
    activeMode = mode;

    measurer.enabled         = false;
    highlighter.enabled      = false;
    hoverer.enabled          = false;
    clipper.enabled          = false;
    sectionFillGroup.visible = false;

    if (mode === "navigate") {
      highlighter.enabled = true;
      hoverer.enabled     = true;
    } else if (mode === "measure") {
      measurer.enabled = true;
    } else if (mode === "section") {
      clipper.enabled          = true;
      sectionFillGroup.visible = true;
      // Postproducción permanece activa: los render targets del EffectComposer
      // tienen stencilBuffer habilitado (parcheado al iniciar), por lo que
      // el relleno de sección y el estilo visual coexisten sin conflicto.
    }

    const activeStyle = {
      background: "var(--bim-ui_main-base)", borderRadius: "4px",
      outline: "2px solid var(--bim-ui_accent-base, #6528d7)",
    };
    const resetStyle = { background: "", borderRadius: "", outline: "" };

    [measureBtnEl, sectionBtnEl].forEach((btn) => {
      if (btn) Object.assign(btn.style, resetStyle);
    });
    if (mode === "measure" && measureBtnEl) Object.assign(measureBtnEl.style, activeStyle);
    if (mode === "section" && sectionBtnEl) Object.assign(sectionBtnEl.style, activeStyle);

    console.log(`🔧 Modo activo: ${mode}`);
  };

  viewport.ondblclick = () => {
    if (activeMode === "measure")      measurer.create();
    else if (activeMode === "section") { clipper.create(world); rebuildSectionFills(); }
  };

  window.onkeydown = (event) => {
    if (event.code === "Delete" || event.code === "Backspace") {
      if (activeMode === "measure")      measurer.delete();
      else if (activeMode === "section") { clipper.delete(world); rebuildSectionFills(); }
    }
  };

  setMode("navigate");
  console.log("✅ MUTEX_Modos de herramienta configurados");

  // ===============================
  // PASO 6 – Escena y entorno visual
  // ===============================
  world.scene.setup();

  // ── CAMBIO 1: Fondo plano de color en lugar del sky esférico ──
  // La SphereGeometry generaba artefactos de outline (circunferencias visibles
  // en la parte superior) porque el postprocesado de bordes detectaba sus
  // segmentos de latitud/longitud como aristas del modelo.
  world.scene.three.background = new THREE.Color(0xc8deff);

  // Iluminación
  world.scene.three.add(new THREE.AmbientLight(0xffffff, 0.55));

  // ── CAMBIO 2: Intensidad solar 2.0 → 1.0 ──
  const sunLight = new THREE.DirectionalLight(0xfff5e0, 1.0);
  sunLight.position.set(60, 90, 40);
  sunLight.castShadow           = true;
  sunLight.shadow.mapSize.width = sunLight.shadow.mapSize.height = 4096;
  sunLight.shadow.camera.near   = 0.5;
  sunLight.shadow.camera.far    = 800;
  sunLight.shadow.camera.left   = sunLight.shadow.camera.bottom = -120;
  sunLight.shadow.camera.right  = sunLight.shadow.camera.top    =  120;
  sunLight.shadow.bias          = -0.0005;
  sunLight.shadow.normalBias    =  0.02;
  world.scene.three.add(sunLight);

  const fillLight = new THREE.DirectionalLight(0xc8deff, 0.45);
  fillLight.position.set(-40, 30, -30);
  world.scene.three.add(fillLight);
  world.scene.three.add(new THREE.HemisphereLight(0xc8e0ff, 0xd4c8a0, 0.35));

  const threeRenderer = (world.renderer as OBF.PostproductionRenderer).three;
  threeRenderer.shadowMap.enabled    = true;
  threeRenderer.shadowMap.type       = THREE.PCFSoftShadowMap;
  threeRenderer.localClippingEnabled = true;

  const grids     = components.get(OBC.Grids);
  const worldGrid = grids.create(world);
  await world.camera.controls.setLookAt(10, 10, 10, 0, 0, 0);
  console.log("✅ 6.1_Escena configurada con iluminación mejorada");

  // ===============================
  // PASO 6.2 – Postproducción
  // ===============================
  const postproduction = (world.renderer as OBF.PostproductionRenderer).postproduction;
  postproduction.enabled = true;

  postproduction.basePass.isolatedMaterials.push(worldGrid.material);
  postproduction.outlinesEnabled           = true;
  postproduction.glossEnabled              = true;
  postproduction.glossPass.minGloss        = -0.1;
  postproduction.glossPass.maxGloss        = 0.4;
  postproduction.glossPass.glossExponent   = 4;
  postproduction.glossPass.fresnelExponent = 3;

  postproduction.aoPass.updateGtaoMaterial({
    radius: 0.5, distanceFallOff: 1.0, scale: 2.5, samples: 16, thickness: 1.0,
  });

  postproduction.smaaEnabled = true;

  // ── CAMBIO 3: Estilo por defecto COLOR_PEN (era COLOR_SHADOWS) ──
  postproduction.style = OBF.PostproductionAspect.COLOR_PEN;

  // ── CAMBIO 4: Ancho de bordes 1.2 → 1.0 ──
  postproduction.edgesPass.width = 1.0;

  // Enlazar el wrapper pp con la instancia real de postproduction
  pp.ref = postproduction;

  // Habilitar stencilBuffer en los render targets internos del EffectComposer
  // para que el relleno de sección (técnica stencil) funcione con postproducción activa.
  // dispose() fuerza a Three.js a recrear los FBOs con stencil en el próximo frame.
  const ppComposer = (postproduction as any).composer;
  if (ppComposer?.renderTarget1) {
    ppComposer.renderTarget1.stencilBuffer = true;
    ppComposer.renderTarget1.dispose();
    ppComposer.renderTarget2.stencilBuffer = true;
    ppComposer.renderTarget2.dispose();
  }

  console.log("✅ 6.2_Postproducción activada");

  // ===============================
  // PASO 6.3 – Ajustar grilla al piso
  // ===============================
  const adjustGridToModel = () => {
    const box = new THREE.Box3();
    world.scene.three.traverse((obj) => {
      if (obj instanceof THREE.Mesh && !(obj.material instanceof THREE.ShaderMaterial))
        box.union(new THREE.Box3().setFromObject(obj));
    });
    if (!box.isEmpty()) {
      worldGrid.three.position.y = box.min.y;
      console.log(`✅ Grilla ajustada a Y = ${box.min.y.toFixed(4)}`);
    }
  };

  // ===============================
  // PASO 7 – FragmentsManager
  // ===============================
  const fragments = components.get(OBC.FragmentsManager);
  fragments.init("/workers/worker.mjs");
  console.log("✅ 7.1_FragmentsManager configurado");

  world.camera.controls.addEventListener("update", () => {
    fragments.core.update();
    (viewCube as any).updateOrientation();
  });

  // ===============================
  // ViewCube – cubo de navegación
  // ===============================
  const viewCube = document.createElement("bim-view-cube");
  (viewCube as any).camera = world.camera.three;

  // Vistas estándar al hacer clic en cada cara del cubo
  const _D = 80; // distancia desde el origen para las vistas ortogonales
  viewCube.addEventListener("frontclick",  () => world.camera.controls.setLookAt( 0,  0,  _D, 0, 0, 0, true));
  viewCube.addEventListener("backclick",   () => world.camera.controls.setLookAt( 0,  0, -_D, 0, 0, 0, true));
  viewCube.addEventListener("rightclick",  () => world.camera.controls.setLookAt( _D, 0,  0,  0, 0, 0, true));
  viewCube.addEventListener("leftclick",   () => world.camera.controls.setLookAt(-_D, 0,  0,  0, 0, 0, true));
  viewCube.addEventListener("topclick",    () => world.camera.controls.setLookAt( 0,  _D, 0,  0, 0, 0, true));
  viewCube.addEventListener("bottomclick", () => world.camera.controls.setLookAt( 0, -_D, 0,  0, 0, 0, true));

  viewport.append(viewCube);
  console.log("✅ ViewCube agregado");

  // ===============================
  // PASO 7.3 – Modelo cargado: Phong + colores + Hatch Stencil
  // ===============================
  fragments.list.onItemSet.add(async ({ value: model }) => {
    model.useCamera(world.camera.three);
    world.scene.three.add(model.object);
    fragments.core.update(true);
    console.log("✅ 7.3_Modelo agregado a la escena");

    // --- PASO A: Convertir materiales a Phong ---
    model.object.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.castShadow    = true;
        child.receiveShadow = true;
        if (Array.isArray(child.material)) {
          child.material = child.material.map((m) => convertToPhong(m));
        } else {
          child.material = convertToPhong(child.material);
        }
      }
    });
    console.log("✅ 7.4_Materiales convertidos a Phong");

    // --- PASO B: Colores fallback por categoría IFC ---
    for (const [categoryName, colorDef] of Object.entries(IFC_FALLBACK_COLORS)) {
      try {
        const results    = await model.getItemsOfCategories([new RegExp(`^${categoryName}$`, "i")]);
        const ids: number[] = [];
        for (const itemIds of Object.values(results)) ids.push(...(itemIds as number[]));
        if (ids.length === 0) continue;

        const idSet = new Set(ids);
        model.object.traverse((child) => {
          if (!(child instanceof THREE.Mesh)) return;
          const localId = child.userData?.localId as number | undefined;
          if (localId === undefined || !idSet.has(localId)) return;
          const mats = Array.isArray(child.material) ? child.material : [child.material];
          for (const mat of mats) {
            const phong   = mat as THREE.MeshPhongMaterial;
            const isWhite = phong.color.r > 0.95 && phong.color.g > 0.95 && phong.color.b > 0.95;
            if (isWhite) {
              phong.color.setHex(colorDef.hex);
              if (colorDef.transparent) { phong.transparent = true; phong.opacity = colorDef.opacity ?? 0.5; }
            }
          }
        });
        console.log(`  ✅ Color fallback ${categoryName}: ${ids.length} elementos`);
      } catch { /* categoría no presente en este modelo */ }
    }
    console.log("✅ 7.5_Colores por categoría IFC aplicados");

    // --- PASO C: Recolectar meshes de categorías objetivo para relleno de sección ---
    fillSourceMeshes = [];
    try {
      const results = await model.getItemsOfCategories(SECTION_FILL_CATEGORIES);
      const ids = new Set<number>();
      for (const itemIds of Object.values(results))
        for (const id of itemIds as number[]) ids.add(id);
      model.object.traverse((child) => {
        if (!(child instanceof THREE.Mesh)) return;
        const localId = child.userData?.localId as number | undefined;
        if (localId !== undefined && ids.has(localId)) fillSourceMeshes.push(child);
      });
      console.log(`✅ 7.6_${fillSourceMeshes.length} meshes listos para relleno de sección`);
    } catch (e) {
      console.warn("⚠️ Error recolectando meshes para sección:", e);
    }
    setTimeout(() => adjustGridToModel(), 500);
  });

  // ===============================
  // PASO 8 – IfcLoader
  // ===============================
  const ifcLoader      = components.get(OBC.IfcLoader);
  const setupIfcLoader = async () => {
    await ifcLoader.setup({
      autoSetWasm: false,
      wasm: { path: "https://unpkg.com/web-ifc@0.0.74/", absolute: true },
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

    const downloadFragments = async () => {
      const [model] = fragments.list.values();
      if (!model) { console.warn("No hay modelo para descargar"); return; }
      const file = new File([await model.getBuffer(false)], "modelo.frag");
      const link = document.createElement("a");
      link.href = URL.createObjectURL(file); link.download = file.name; link.click();
      URL.revokeObjectURL(link.href);
    };

    // ===============================
    // PASO 10 – Panel izquierdo
    // ===============================
    const deleteDimensions = () => measurer.list.clear();

    const getAllValues = () => {
      const lengths: number[] = [];
      for (const line of measurer.list) lengths.push(line.value);
      return lengths;
    };

    const loadIfcBtn = BUI.Component.create<BUI.Button>(() => {
      const onClick = async () => {
        const input    = document.createElement("input");
        input.type     = "file";
        input.accept   = ".ifc";
        input.onchange = async () => {
          const file = input.files?.[0];
          if (!file) return;
          console.log("📂 Cargando:", file.name);
          await ifcLoader.load(new Uint8Array(await file.arrayBuffer()), false, file.name, {
            processData: { progressCallback: (p) => console.log("Progreso:", p) },
          });
          console.log("✅ Modelo cargado!");
        };
        input.click();
      };
      return BUI.html`<bim-button label="Cargar IFC" icon="mage:box-3d-fill" @click=${onClick}></bim-button>`;
    });

    const [modelsList] = CUI.tables.modelsList({
      components, metaDataTags: ["schema"], actions: { download: false },
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
            <bim-button label="Descargar .frag" @click=${() => downloadFragments()}></bim-button>
          </bim-panel-section>

          <bim-panel-section label="Medidor" icon="solar:ruler-cross-pen-bold">
            <bim-checkbox checked label="Habilitado"
              @change="${({ target }: { target: BUI.Checkbox }) => { measurer.enabled = target.value; }}">
            </bim-checkbox>
            <bim-checkbox checked label="Visible"
              @change="${({ target }: { target: BUI.Checkbox }) => { measurer.visible = target.value; }}">
            </bim-checkbox>
            <bim-color-input label="Color" color=#${measurer.linesMaterial.color.getHexString()}
              @input="${({ target }: { target: BUI.ColorInput }) => { measurer.color = new THREE.Color(target.color); }}">
            </bim-color-input>
            <bim-dropdown label="Unidades" required
              @change="${({ target }: { target: BUI.Dropdown }) => { const [units] = target.value; measurer.units = units; }}">
              ${measurer.unitsList.map((unit) => BUI.html`
                <bim-option label=${unit} value=${unit} ?checked=${unit === measurer.units}></bim-option>`)}
            </bim-dropdown>
            <bim-dropdown label="Precisión" required
              @change="${({ target }: { target: BUI.Dropdown }) => { const [rounding] = target.value; measurer.rounding = rounding; }}">
              <bim-option label="0" value=0></bim-option>
              <bim-option label="1" value=1></bim-option>
              <bim-option label="2" value=2 checked></bim-option>
              <bim-option label="3" value=3></bim-option>
              <bim-option label="4" value=4></bim-option>
            </bim-dropdown>
            <bim-button label="Borrar todo" @click=${() => deleteDimensions()}></bim-button>
          </bim-panel-section>

          <bim-panel-section label="Sección" icon="material-symbols:cut">
            <bim-number-input label="Tamaño del plano"
              value="5" min="1" max="30" step="1" suffix="m"
              @change="${({ target }: { target: BUI.NumberInput }) => { clipper.size = target.value; }}">
            </bim-number-input>
            <bim-checkbox checked label="Mostrar relleno en sección"
              @change="${({ target }: { target: BUI.Checkbox }) => {
                sectionFillGroup.visible = target.value && activeMode === "section";
              }}">
            </bim-checkbox>
            <bim-button label="Borrar todos los planos" icon="material-symbols:delete-outline"
              @click=${() => clipper.deleteAll()}>
            </bim-button>
          </bim-panel-section>

          <bim-panel-section label="Renderizado" icon="material-symbols:photo-camera">
            <bim-checkbox checked label="Postproducción"
              @change="${({ target }: { target: BUI.Checkbox }) => { postproduction.enabled = target.value; }}">
            </bim-checkbox>
            <bim-checkbox checked label="Outlines (bordes)"
              @change="${({ target }: { target: BUI.Checkbox }) => { postproduction.outlinesEnabled = target.value; }}">
            </bim-checkbox>
            <bim-checkbox checked label="Gloss (brillo)"
              @change="${({ target }: { target: BUI.Checkbox }) => { postproduction.glossEnabled = target.value; }}">
            </bim-checkbox>
            <bim-checkbox checked label="SMAA (antialiasing)"
              @change="${({ target }: { target: BUI.Checkbox }) => { postproduction.smaaEnabled = target.value; }}">
            </bim-checkbox>
            <bim-dropdown label="Estilo" required
              @change="${({ target }: { target: BUI.Dropdown }) => {
                postproduction.style = target.value[0] as OBF.PostproductionAspect;
              }}">
              <bim-option label="Color"                  value="${OBF.PostproductionAspect.COLOR}"></bim-option>
              <bim-option label="Pen"                    value="${OBF.PostproductionAspect.PEN}"></bim-option>
              <bim-option label="Pen + Sombras"          value="${OBF.PostproductionAspect.PEN_SHADOWS}"></bim-option>
              <bim-option checked label="Color + Pen"    value="${OBF.PostproductionAspect.COLOR_PEN}"></bim-option>
              <bim-option label="Color + Sombras"        value="${OBF.PostproductionAspect.COLOR_SHADOWS}"></bim-option>
              <bim-option label="Color + Pen + Sombras"  value="${OBF.PostproductionAspect.COLOR_PEN_SHADOWS}"></bim-option>
            </bim-dropdown>
            <!-- ── CAMBIO 4 en UI: valor inicial 1.0 (era 1.2) ── -->
            <bim-number-input label="Ancho de bordes" value="1.0" min="0.5" max="5" step="0.1"
              @change="${({ target }: { target: BUI.NumberInput }) => { postproduction.edgesPass.width = target.value; }}">
            </bim-number-input>
            <bim-number-input label="Intensidad AO" value="2.5" min="0" max="10" step="0.1"
              @change="${({ target }: { target: BUI.NumberInput }) => {
                postproduction.aoPass.updateGtaoMaterial({ scale: target.value });
              }}">
            </bim-number-input>
            <bim-checkbox checked label="Sombras Three.js"
              @change="${({ target }: { target: BUI.Checkbox }) => {
                threeRenderer.shadowMap.enabled = target.value;
                sunLight.castShadow             = target.value;
              }}">
            </bim-checkbox>
            <!-- ── CAMBIO 5 en UI: valor inicial 1.0 (era 2.0) ── -->
            <bim-number-input label="Intensidad solar" value="1.0" min="0" max="5" step="0.1"
              @change="${({ target }: { target: BUI.NumberInput }) => { sunLight.intensity = target.value; }}">
            </bim-number-input>
          </bim-panel-section>

        </bim-panel>
      `;
    });
    console.log("✅ 10.2_Panel creado");

    measurer.list.onItemAdded.add(() => {
      const existing = panel.querySelector("bim-panel-section[label='Mediciones']");
      if (existing) existing.remove();
      const section = document.createElement("bim-panel-section");
      section.setAttribute("label", "Mediciones");
      const values = getAllValues();
      if (values.length === 0) {
        const lbl = document.createElement("bim-label");
        lbl.textContent = "No hay mediciones"; section.append(lbl);
      } else {
        values.forEach((v, i) => {
          const lbl = document.createElement("bim-label");
          lbl.textContent = `Medición ${i + 1}: ${v.toFixed(2)} m`; section.append(lbl);
        });
      }
      panel.append(section);
    });

    // ===============================
    // Panel derecho
    // ===============================
    const rightPanel = document.createElement("bim-panel") as BUI.Panel;
    rightPanel.label = "Panel";

    const [spatialTree, updateSpatialTree] = CUI.tables.spatialTree({
      components, models: fragments.list.values(), selectHighlighterName: "select",
    });

    // ── Etiqueta limpia por tipo de elemento IFC ──────────────────────────
    const IFC_LABEL: Record<string, string> = {
      IFCWALL: "Wall",                IFCWALLSTANDARDCASE: "Wall",
      IFCSLAB: "Slab",               IFCCOLUMN: "Column",
      IFCBEAM: "Beam",               IFCDOOR: "Door",
      IFCWINDOW: "Window",           IFCSTAIR: "Stair",
      IFCROOF: "Roof",               IFCOPENINGELEMENT: "Opening",
      IFCFOOTING: "Footing",         IFCPILE: "Pile",
      IFCFURNISHINGELEMENT: "Furniture", IFCPLATE: "Plate",
      IFCMEMBER: "Member",           IFCSPACE: "Space",
      IFCPIPESEGMENT: "Pipe",        IFCPIPEFITTING: "Pipe Fitting",
      IFCDUCTSEGMENT: "Duct",        IFCDUCTFITTING: "Duct Fitting",
      IFCFLOWSEGMENT: "Flow Segment",IFCFLOWTERMINAL: "Terminal",
      IFCFLOWFITTING: "Flow Fitting",IFCCURTAINWALL: "Curtain Wall",
      IFCCOVERING: "Covering",       IFCRAILING: "Railing",
    };

    // ── Icono Material Symbols por clase IFC ──────────────────────────────
    const IFC_ICON: Record<string, string> = {
      model:               "material-symbols:folder",
      IFCSITE:             "material-symbols:location-on",
      IFCBUILDING:         "material-symbols:apartment",
      IFCBUILDINGSTOREY:   "material-symbols:layers",
      IFCWALL:             "mdi:wall",
      IFCWALLSTANDARDCASE: "mdi:wall",
      IFCCOLUMN:           "material-symbols:view-column",
      IFCBEAM:             "material-symbols:horizontal-rule",
      IFCSLAB:             "material-symbols:table-rows-narrow",
      IFCDOOR:             "material-symbols:door-front",
      IFCWINDOW:           "material-symbols:window",
      IFCSTAIR:            "material-symbols:stairs",
      IFCROOF:             "material-symbols:roofing",
      IFCOPENINGELEMENT:   "material-symbols:border-outer",
      IFCFURNISHINGELEMENT:"material-symbols:chair",
      IFCSPACE:            "material-symbols:space-dashboard",
      IFCPIPESEGMENT:      "material-symbols:plumbing",
      IFCDUCTSEGMENT:      "material-symbols:air",
      IFCFOOTING:          "material-symbols:foundation",
      IFCMEMBER:           "material-symbols:horizontal-distribute",
      IFCCURTAINWALL:      "material-symbols:grid-view",
    };

    // SKIP_FULL: salta clase IFC *y* su instancia directa → va a los nietos.
    // Se usa para IfcProject cuya instancia (número de proyecto) no aporta
    // al usuario y duplica un nivel respecto a BIMcollab Zoom.
    const SKIP_FULL = new Set(["IFCPROJECT"]);

    // SKIP_CLASS: salta el nodo de clase pero conserva el nodo de instancia
    // (con el nombre real) y le asigna el icono de su clase IFC.
    const SKIP_CLASS = new Set(["IFCSITE", "IFCBUILDING", "IFCBUILDINGSTOREY"]);

    /**
     * Crea el valor de la celda Name como TemplateResult de Lit (BUI.html).
     * CellRenderValue = string | HTMLElement | TemplateResult, por lo que
     * Lit renderiza el template directamente sin escapar el HTML.
     * El icono se embebe dentro del valor Name en lugar de ser un campo
     * separado, evitando que computeMissingColumns lo añada como columna extra.
     */
    const nameCell = (label: string, icon?: string): any =>
      icon
        ? BUI.html`<span style="display:inline-flex;align-items:center;gap:5px;overflow:hidden">
            <bim-icon .icon="${icon}" style="font-size:14px;flex-shrink:0;opacity:0.75"></bim-icon>
            <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${label}</span>
          </span>`
        : label;

    /**
     * Transforma el árbol IFC estándar al estilo BIMcollab Zoom:
     * - IfcProject (clase+instancia) → suprimido, se sube un nivel
     * - IfcSite / IfcBuilding / IfcBuildingStorey → clase suprimida,
     *   instancia conservada con nombre real e icono en la celda Name
     * - Grupos de tipo (IfcWall, IfcSlab…) → etiqueta limpia + icono
     * - Nodo raíz del modelo (.ifc) → icono de carpeta en la celda Name
     */
    const toCompactTree = (nodes: any[]): any[] =>
      nodes.flatMap((node: any) => {
        const name: string = node.data?.Name ?? "";
        const upperName    = name.toUpperCase();
        const isIfcClass   = /^IFC[A-Z]+$/.test(upperName);
        const hasLocalId   = node.data?.localId !== undefined;

        if (!isIfcClass) {
          // Nodo raíz del modelo (no IFC class, sin localId): icono carpeta
          const cellName = !hasLocalId ? nameCell(name, IFC_ICON.model) : node.data.Name;
          return [{ data: { ...node.data, Name: cellName }, children: toCompactTree(node.children ?? []) }];
        }

        if (SKIP_FULL.has(upperName)) {
          // Saltar clase E instancia → promover hijos de la instancia
          return (node.children ?? []).flatMap((inst: any) =>
            toCompactTree(inst.children ?? [])
          );
        }

        if (SKIP_CLASS.has(upperName)) {
          // Saltar clase, conservar instancia con icono de la clase en Name
          const icon = IFC_ICON[upperName];
          return (node.children ?? []).map((child: any) => ({
            data: { ...child.data, Name: nameCell(child.data?.Name ?? "", icon) },
            children: toCompactTree(child.children ?? []),
          }));
        }

        // Grupo de tipo (IFCWALL, IFCSLAB…): etiqueta limpia + icono en Name
        const cleanLabel = IFC_LABEL[upperName] ?? upperName.replace(/^IFC/, "");
        return [{
          data: { ...node.data, Name: nameCell(cleanLabel, IFC_ICON[upperName]) },
          children: node.children ?? [],
        }];
      });

    const spatialSection          = document.createElement("bim-panel-section") as BUI.PanelSection;
    spatialSection.label          = "Spatial Structures";
    spatialSection.icon           = "material-symbols:account-tree";
    spatialSection.collapsed      = false;
    spatialTree.style.maxHeight   = "40vh";
    spatialTree.style.overflowY   = "auto";
    spatialTree.style.fontSize    = "11px";
    spatialSection.append(spatialTree);
    rightPanel.append(spatialSection);

    fragments.list.onItemSet.add(() => {
      updateSpatialTree({ models: fragments.list.values() });
      spatialSection.collapsed = false;

      // Esperar a que updateSpatialTree llene los datos del BUI.Table
      // (operación asíncrona) y luego aplicar la transformación compacta.
      const applyCompact = () => {
        const tbl = spatialTree as any;
        if (Array.isArray(tbl.data) && tbl.data.length > 0) {
          tbl.data = toCompactTree(tbl.data);
          requestAnimationFrame(() => { spatialTree.expanded = true; });
          console.log("✅ SpatialTree compactado (BIMcollab style)");
        } else {
          requestAnimationFrame(applyCompact); // reintentar en el próximo frame
        }
      };
      requestAnimationFrame(applyCompact);
    });

    // ===============================
    // Selection Information
    // ===============================
    const [itemsDataTable, updateItemsData] = CUI.tables.itemsData({
      components, modelIdMap: {}, emptySelectionWarning: true,
    });

    const quantitiesSection          = document.createElement("bim-panel-section") as BUI.PanelSection;
    quantitiesSection.label          = "Selection Information";
    quantitiesSection.icon           = "material-symbols:info";
    quantitiesSection.collapsed      = true;
    (itemsDataTable as HTMLElement).style.maxHeight = "45vh";
    (itemsDataTable as HTMLElement).style.overflowY = "auto";
    (itemsDataTable as HTMLElement).style.fontSize  = "11px";
    quantitiesSection.append(itemsDataTable);
    rightPanel.append(quantitiesSection);

    spatialTree.selectableRows = true;
    spatialTree.addEventListener("click", (event: Event) => {
      const path    = event.composedPath();
      const row     = path.find((el: any) => el.tagName === "BIM-TABLE-ROW") as any;
      if (!row?.data) return;
      const modelId = row.data.modelId as string;
      const localId = row.data.localId as number;
      if (!modelId || localId === undefined) return;
      updateItemsData({ modelIdMap: { [modelId]: new Set([localId]) }, emptySelectionWarning: false });
      quantitiesSection.collapsed = false;
      requestAnimationFrame(() => quantitiesSection.scrollIntoView({ behavior: "smooth", block: "nearest" }));
      console.log(`✅ Selection: ${row.data.Name} | localId=${localId}`);
    });


    // ===============================
    // PASO 16 – Floating Toolbar
    // ===============================
    const toolbar = BUI.Component.create<BUI.Toolbar>(() => {
      return BUI.html`
        <bim-toolbar style="justify-self: center;">

          <bim-toolbar-section label="Cámara">
            <bim-button tooltip-title="Perspectiva"
              tooltip-text="Alternar cámara ortográfica / perspectiva"
              icon="tabler:camera"
              @click=${() => world.camera.projection.toggle()}>
            </bim-button>
            <bim-button tooltip-title="Fit Model"
              tooltip-text="Ajustar vista al modelo"
              icon="material-symbols:fit-screen"
              @click=${async () => {
                const meshes = world.scene.three.children.filter((c): c is THREE.Mesh => c instanceof THREE.Mesh);
                await world.camera.fit(meshes);
              }}>
            </bim-button>
          </bim-toolbar-section>

          <bim-toolbar-section label="Medición">
            <bim-button tooltip-title="Activar Medición"
              tooltip-text="Doble click para medir"
              icon="solar:ruler-bold"
              ${BUI.ref((el: Element | undefined) => { measureBtnEl = el as BUI.Button ?? null; })}
              @click=${() => { if (activeMode === "measure") setMode("navigate"); else setMode("measure"); }}>
            </bim-button>
            <bim-button tooltip-title="Borrar mediciones"
              icon="material-symbols:delete-outline"
              @click=${() => measurer.list.clear()}>
            </bim-button>
          </bim-toolbar-section>

          <bim-toolbar-section label="Sección">
            <bim-button tooltip-title="Plano de corte"
              tooltip-text="Doble click para crear. Muestra hatch por categoría IFC."
              icon="material-symbols:cut"
              ${BUI.ref((el: Element | undefined) => { sectionBtnEl = el as BUI.Button ?? null; })}
              @click=${() => { if (activeMode === "section") setMode("navigate"); else setMode("section"); }}>
            </bim-button>
            <bim-button tooltip-title="Borrar planos"
              icon="material-symbols:layers-clear"
              @click=${() => clipper.deleteAll()}>
            </bim-button>
          </bim-toolbar-section>

          <bim-toolbar-section label="Visibilidad">
            <bim-button tooltip-title="Mostrar todo"
              icon="material-symbols:visibility"
              @click=${() => {
                for (const [, model] of fragments.list) model.object.visible = true;
                fragments.core.update(true);
              }}>
            </bim-button>
          </bim-toolbar-section>

          <bim-toolbar-section label="BCF">
            <bim-button tooltip-title="Nuevo Topic"
              icon="material-symbols:task"
              @click=${() => topicsModal.showModal()}>
            </bim-button>
          </bim-toolbar-section>

        </bim-toolbar>
      `;
    });
    console.log("✅ 16.1_Floating Toolbar creada");

    // ===============================
    // PASO 11 – Grid layout
    // ===============================
    const grid = document.createElement("bim-grid") as BUI.Grid<["main"]>;
    document.body.append(grid);
    await new Promise((r) => setTimeout(r, 50));

    grid.layouts = {
      main: {
        template: `"sidebar viewport right" 1fr / 300px 1fr 370px`,
        elements: { sidebar: panel, viewport, right: rightPanel },
      },
    };

    grid.layout = "main";
    document.body.append(toolbar);
    console.log("✅ 11_bim-grid layout activado");

    // ===============================
    // PASO 13 – BCF Topics
    // ===============================
    const topicUsers: CUI.TopicUserStyles = {
      "arquitecto@proyecto.com": { name: "Arquitecto Principal", picture: "https://i.pravatar.cc/150?img=3" },
      "ingeniero@proyecto.com":  { name: "Ingeniero Estructural",  picture: "https://i.pravatar.cc/150?img=7" },
    };

    const [topicsList] = CUI.tables.topicsList({ components, dataStyles: { users: topicUsers } });

    let currentTopicPanel: HTMLElement | null = null;

    const showTopicPanel = (topic: OBC.Topic) => {
      if (currentTopicPanel) currentTopicPanel.remove();

      const [information]   = CUI.sections.topicInformation({ components, topic, styles: { users: topicUsers } });
      const [vpSection]     = CUI.sections.topicViewpoints({ components, topic, world });
      const [relatedTopics] = CUI.sections.topicRelations({ components, topic });
      const [comments]      = CUI.sections.topicComments({ topic, styles: topicUsers });

      currentTopicPanel = BUI.Component.create(() => BUI.html`
        <bim-panel label="${topic.title}">
          <bim-panel-section label="Acciones" icon="material-symbols:settings">
            <bim-button label="Eliminar Topic" icon="material-symbols:delete"
              @click=${() => {
                topics.list.delete(topic.guid);
                if (currentTopicPanel) currentTopicPanel.remove();
                currentTopicPanel = null;
                console.log("✅ Topic eliminado:", topic.title);
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
        row.addEventListener("mouseout", () => { row.style.removeProperty("background-color"); });
        row.addEventListener("click", () => {
          const { Guid } = row.data;
          if (!Guid) return;
          const topic = topics.list.get(Guid);
          if (!topic) return;
          showTopicPanel(topic);
          console.log("✅ Topic seleccionado:", topic.title);
        });
      }
    );

    const bcfSection          = document.createElement("bim-panel-section") as BUI.PanelSection;
    bcfSection.label          = "BCF Topics";
    bcfSection.icon           = "material-symbols:task";
    bcfSection.collapsed      = true;

    // ===============================
    // PASO 14 – Formulario Modal de Topics
    // ===============================
    const [topicForm, updateTopicForm] = CUI.forms.topic({ components, styles: { users: topicUsers } });

    const assigneeDropdown = topicForm.querySelector<BUI.Dropdown>("bim-dropdown[name='assignedTo']");
    if (assigneeDropdown) assigneeDropdown.searchBox = true;

    const topicsModal = BUI.Component.create<HTMLDialogElement>(() => BUI.html`
      <dialog style="border:none;border-radius:8px;padding:0;background:transparent;box-shadow:0 8px 32px rgba(0,0,0,.4);">
        <bim-panel style="border-radius:8px;width:22rem;">${topicForm}</bim-panel>
      </dialog>
    `);
    document.body.append(topicsModal);

    updateTopicForm({ onCancel: () => topicsModal.close(), onSubmit: () => topicsModal.close() });

    // Botones BCF integrados dentro de la sección (no en el panel raíz)
    bcfSection.append(BUI.Component.create(() => BUI.html`
      <bim-button label="Crear Topic BCF" icon="material-symbols:task"
        @click=${() => topicsModal.showModal()}>
      </bim-button>
    `));

    bcfSection.append(BUI.Component.create(() => {
      const onDownload = async () => {
        const selected = [...topicsList.selection]
          .map(({ Guid }) => (Guid && typeof Guid === "string") ? topics.list.get(Guid) : null)
          .filter(Boolean) as OBC.Topic[];
        const toExport = selected.length > 0 ? selected : [...topics.list.values()];
        if (toExport.length === 0) { console.warn("No hay topics para exportar"); return; }
        const bcfData = await topics.export(toExport);
        const ts      = new Date().toISOString().slice(0, 10);
        const file    = new File([bcfData], `VisorBIM_${ts}.bcfzip`);
        const a       = document.createElement("a");
        a.href        = URL.createObjectURL(file);
        a.download    = file.name;
        a.click();
        URL.revokeObjectURL(a.href);
        console.log("✅ BCF exportado!");
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
          console.log("📂 Importando BCF:", file.name);
          await topics.load(new Uint8Array(await file.arrayBuffer()));
          console.log("✅ BCF importado correctamente");
        };
        input.click();
      };
      return BUI.html`
        <bim-button label="Importar BCF" icon="material-symbols:upload" @click=${onImport}></bim-button>
      `;
    }));

    bcfSection.append(topicsList);
    rightPanel.append(bcfSection);
    console.log("✅ 13.3_TopicsList agregada al panel derecho");

    console.log("✅ 14.5_Formulario modal y botones BCF creados");
    console.log("Visor BIM activo ✅");
  }; // fin startApp

  startApp();
}