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

BUI.Manager.init();

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

  // FragmentsManager debe inicializarse antes que cualquier componente que lo use
  const fragments = components.get(OBC.FragmentsManager);
  fragments.init("/workers/worker.mjs");
  console.log("✅ 2.5_FragmentsManager inicializado");

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
    if (topic.viewpoints.size > 0) {
      // Topic importado de BCF: ya tiene viewpoints → solo asignar world
      for (const vpGuid of topic.viewpoints) {
        const vp = viewpoints.list.get(vpGuid);
        if (vp && !vp.world) vp.world = world;
      }
    } else {
      // Topic nuevo creado en el visor → capturar cámara actual
      const vp = viewpoints.create();
      vp.world  = world;
      vp.updateCamera();
      topic.viewpoints.add(vp.guid);
    }
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

  // Aumentar opacidad del relleno de selección para mejor contraste
  highlighter.styles.set("select", {
    color: new THREE.Color(0x6528d7),
    opacity: 0.55,
    transparent: true,
    renderedFaces: FRAGS.RenderedFaces.TWO,
  });

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

  // ── Configuración precisa de controles de cámara ──────────────────────
  const cc = world.camera.controls;
  cc.dollyToCursor   = true;
  cc.infinityDolly   = true;
  cc.truckSpeed      = 2.0;
  cc.smoothTime          = 0.15;
  cc.draggingSmoothTime  = 0.05;

  // Forzar aspect ratio correcto al inicio y en cada resize
  world.camera.updateAspect();
  world.renderer.onResize.add(() => world.camera.updateAspect());

  console.log("✅ 6.1_Escena configurada con iluminación mejorada");

  // ===============================
  // PASO 6.2 – Postproducción
  // ===============================
  const postproduction = (world.renderer as OBF.PostproductionRenderer).postproduction;
  postproduction.enabled = true;

  // Al cambiar proyección: desactivar postproducción temporalmente,
  // limpiar los buffers del renderer y reactivar. Esto evita que el
  // EffectComposer mezcle frames de la cámara anterior con la nueva.
  world.camera.projection.onChanged.add((newCam: any) => {
    const pp  = postproduction as any;
    const rdr = (world.renderer as OBF.PostproductionRenderer).three;

    // 1. Actualizar cámara en todos los passes del composer
    if (pp._basePass) pp._basePass.camera = newCam;
    if (pp._aoPass)   pp._aoPass.camera   = newCam;
    if (pp.composer?.passes) {
      for (const pass of pp.composer.passes) {
        if (pass.camera !== undefined) pass.camera = newCam;
      }
    }

    // 2. Limpiar render targets del composer para eliminar el frame viejo
    if (pp.composer) {
      rdr.setRenderTarget(pp.composer.renderTarget1); rdr.clear();
      rdr.setRenderTarget(pp.composer.renderTarget2); rdr.clear();
      rdr.setRenderTarget(null);
    }

    // 3. Limpiar el framebuffer principal
    const prev = rdr.autoClear;
    rdr.autoClear = true;
    rdr.clear();
    rdr.autoClear = prev;

    world.camera.updateAspect();
  });

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

  // Efecto de contorno (outline) al seleccionar.
  // Debe configurarse DESPUÉS de postproduction.enabled = true porque los
  // setters color/thickness/fillColor/fillOpacity acceden a outlinePass, que
  // solo existe una vez que el EffectComposer está inicializado.
  const outliner = components.get(OBF.Outliner);
  outliner.world = world;
  outliner.enabled = true;
  outliner.color = new THREE.Color(0x39ff14);  // verde fluor
  outliner.thickness = 3;         // pixels in the outline shader (default=2)
  outliner.fillColor = new THREE.Color(0x6528d7);
  outliner.fillOpacity = 0.35;    // additional tint on top of highlighter fill
  outliner.styles.add("select");

  console.log("✅ 6.2_Postproducción + Outliner activados");

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
  // PASO 7 – FragmentsManager (ya inicializado arriba)
  // ===============================
  console.log("✅ 7.1_FragmentsManager configurado");

  // Ref para el ViewCube – se inicializa dentro de startApp() una vez que
  // CUI.Manager.init() registra el custom element "bim-view-cube".
  const vcRef = { el: null as any };

  world.camera.controls.addEventListener("update", () => {
    fragments.core.update();
    if (vcRef.el) vcRef.el.updateOrientation();
  });

  // ── Raycaster para pivot preciso al hacer pan / orbit ─────────────────
  // Actualiza el target de camera-controls al punto del modelo bajo el
  // cursor en cada pointerdown con botón derecho (pan) o medio (orbit),
  // de modo que el pivot siempre queda sobre la superficie del modelo.
  const _pivotRaycaster = new THREE.Raycaster();
  viewport.addEventListener("pointerdown", (e: PointerEvent) => {
    if (e.button !== 2 && e.button !== 1) return; // derecho o rueda
    const rect = viewport.getBoundingClientRect();
    const ndc  = new THREE.Vector2(
      ((e.clientX - rect.left) / rect.width)  * 2 - 1,
      -((e.clientY - rect.top)  / rect.height) * 2 + 1,
    );
    _pivotRaycaster.setFromCamera(ndc, world.camera.three);
    const meshes: THREE.Mesh[] = [];
    for (const model of fragments.list.values()) {
      model.object?.traverse(o => { if (o instanceof THREE.Mesh) meshes.push(o); });
    }
    const hits = _pivotRaycaster.intersectObjects(meshes, false);
    if (hits.length === 0) return;
    const pt  = hits[0].point;
    const pos = new THREE.Vector3();
    world.camera.three.getWorldPosition(pos);
    // Reposicionar target sin mover la cámara — el siguiente drag orbita aquí
    world.camera.controls.setLookAt(pos.x, pos.y, pos.z, pt.x, pt.y, pt.z, false);
  });

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
      wasm: { path: "https://unpkg.com/web-ifc@0.0.77/", absolute: true },
    });
    console.log("✅ 8.1_IfcLoader configurado");
  };

  // ===============================
  // PASO 9 – startApp
  // ===============================
  const startApp = async () => {
    await setupIfcLoader();
    CUI.Manager.init();
    console.log("✅ 9.1_BUI y CUI Managers inicializados");

    // ===============================
    // ViewCube – cubo de navegación
    // Creado aquí, después de CUI.Manager.init(), para que "bim-view-cube"
    // esté registrado como custom element antes de instanciarlo.
    // ===============================
    const viewCube = document.createElement("bim-view-cube");
    (viewCube as any).camera = world.camera.three;
    vcRef.el = viewCube;

    // Calcula el centro del bounding box de todos los modelos cargados.
    // Si no hay modelos, devuelve (0,0,0) como fallback.
    const getModelCenter = (): THREE.Vector3 => {
      const box = new THREE.Box3();
      let hasContent = false;
      for (const model of fragments.list.values()) {
        if (model.object) {
          box.expandByObject(model.object);
          hasContent = true;
        }
      }
      return hasContent ? box.getCenter(new THREE.Vector3()) : new THREE.Vector3();
    };

    // Distancia de cámara adaptada al tamaño del modelo
    const getViewDistance = (): number => {
      const box = new THREE.Box3();
      let hasContent = false;
      for (const model of fragments.list.values()) {
        if (model.object) { box.expandByObject(model.object); hasContent = true; }
      }
      if (!hasContent) return 80;
      const size = new THREE.Vector3();
      box.getSize(size);
      return Math.max(size.x, size.y, size.z) * 2;
    };

    const vcGoTo = (dx: number, dy: number, dz: number) => {
      const c = getModelCenter();
      const d = getViewDistance();
      // Normalizar dirección y escalar
      const len = Math.sqrt(dx*dx + dy*dy + dz*dz);
      const f   = d / len;
      world.camera.controls.setLookAt(
        c.x + dx * f, c.y + dy * f, c.z + dz * f,
        c.x, c.y, c.z,
        true
      );
    };

    viewCube.addEventListener("frontclick",  () => vcGoTo( 0,  0,  1));
    viewCube.addEventListener("backclick",   () => vcGoTo( 0,  0, -1));
    viewCube.addEventListener("rightclick",  () => vcGoTo( 1,  0,  0));
    viewCube.addEventListener("leftclick",   () => vcGoTo(-1,  0,  0));
    viewCube.addEventListener("topclick",    () => vcGoTo( 0,  1,  0));
    viewCube.addEventListener("bottomclick", () => vcGoTo( 0, -1,  0));

    // Drag sobre el ViewCube → orbitar alrededor del target actual
    let vcDragging = false;
    let vcLastX = 0;
    let vcLastY = 0;
    const ORBIT_SPEED = 0.008;

    viewCube.addEventListener("pointerdown", (e: PointerEvent) => {
      vcDragging = true;
      vcLastX = e.clientX;
      vcLastY = e.clientY;
      viewCube.setPointerCapture(e.pointerId);
      e.stopPropagation();
    });

    viewCube.addEventListener("pointermove", (e: PointerEvent) => {
      if (!vcDragging) return;
      const dx = e.clientX - vcLastX;
      const dy = e.clientY - vcLastY;
      vcLastX = e.clientX;
      vcLastY = e.clientY;
      world.camera.controls.rotate(-dx * ORBIT_SPEED, -dy * ORBIT_SPEED, false);
      e.stopPropagation();
    });

    viewCube.addEventListener("pointerup", (e: PointerEvent) => {
      if (!vcDragging) return;
      vcDragging = false;
      viewCube.releasePointerCapture(e.pointerId);
      e.stopPropagation();
    });

    viewport.append(viewCube);
    console.log("✅ ViewCube agregado");

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
     * Crea el valor de la celda Name como HTMLElement nativo.
     * Se evita BUI.html/TemplateResult porque bim-table-cell puede tener
     * una instancia de Lit distinta y serializa el template como string.
     */
    const nameCell = (label: string, icon?: string): any => {
      if (!icon) return label;
      const wrap = document.createElement("span");
      wrap.style.cssText = "display:inline-flex;align-items:center;gap:5px;overflow:hidden;width:100%";
      const ico = document.createElement("bim-icon") as any;
      ico.icon = icon;
      ico.style.cssText = "font-size:14px;flex-shrink:0;opacity:0.75";
      const txt = document.createElement("span");
      txt.textContent = label;
      txt.style.cssText = "overflow:hidden;text-overflow:ellipsis;white-space:nowrap";
      wrap.append(ico, txt);
      return wrap;
    };

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
    spatialSection.label          = "Estructuras";
    spatialSection.icon           = "material-symbols:account-tree";
    spatialSection.collapsed      = false;

    // ── View switcher (Spatial / Types) ───────────────────────────────────
    const makeTreeViewBtn = (iconName: string, label: string): HTMLButtonElement => {
      const btn = document.createElement("button");
      btn.style.cssText = [
        "flex:1","display:flex","align-items:center","justify-content:center",
        "gap:4px","padding:4px 8px","border:none","cursor:pointer",
        "border-radius:4px","font-size:11px","font-weight:600",
        "background:var(--bim-ui_bg-contrast-10)",
        "color:var(--bim-ui_bg-contrast-60)",
        "transition:background 0.15s,color 0.15s","font-family:inherit",
      ].join(";");
      const ico = document.createElement("bim-icon") as any;
      ico.icon = iconName;
      ico.style.fontSize = "13px";
      const lbl = document.createElement("span");
      lbl.textContent = label;
      btn.append(ico, lbl);
      return btn;
    };

    const treeSwitcherBar = document.createElement("div");
    treeSwitcherBar.style.cssText = "display:flex;gap:4px;margin-bottom:6px;";
    const btnSpatialTree = makeTreeViewBtn("material-symbols:account-tree", "Spatial");
    const btnTypesTree   = makeTreeViewBtn("material-symbols:category", "Types");
    treeSwitcherBar.append(btnSpatialTree, btnTypesTree);

    spatialTree.style.maxHeight   = "40vh";
    spatialTree.style.overflowY   = "auto";
    spatialTree.style.fontSize    = "11px";

    const typesContainer = document.createElement("div");
    typesContainer.style.cssText = "max-height:40vh;overflow-y:auto;display:none;";

    let currentTreeView: "spatial" | "types" = "spatial";

    const switchTreeView = (view: "spatial" | "types") => {
      currentTreeView = view;
      (spatialTree as HTMLElement).style.display = view === "spatial" ? "" : "none";
      typesContainer.style.display = view === "types" ? "" : "none";
      [btnSpatialTree, btnTypesTree].forEach(btn => {
        const isActive = (view === "spatial" ? btnSpatialTree : btnTypesTree) === btn;
        btn.style.background = isActive ? "var(--bim-ui_bg-contrast-20)" : "var(--bim-ui_bg-contrast-10)";
        btn.style.color      = isActive ? "var(--bim-ui_bg-contrast-100)" : "var(--bim-ui_bg-contrast-60)";
      });
    };

    btnSpatialTree.addEventListener("click", () => switchTreeView("spatial"));
    btnTypesTree.addEventListener("click",   () => switchTreeView("types"));
    switchTreeView("spatial");

    spatialSection.append(treeSwitcherBar, spatialTree, typesContainer);
    rightPanel.append(spatialSection);

    // Interceptar el setter data de bim-table para aplicar toCompactTree
    // SIEMPRE que CUI asigne datos nuevos, incluso en re-renders internos de Lit.
    const tbl = spatialTree as any;
    const tblProto = Object.getPrototypeOf(tbl);
    const originalDescriptor = Object.getOwnPropertyDescriptor(tblProto, "data")
      ?? Object.getOwnPropertyDescriptor(Object.getPrototypeOf(tblProto), "data");

    if (originalDescriptor?.set) {
      Object.defineProperty(tbl, "data", {
        get() { return originalDescriptor.get!.call(this); },
        set(rawData: any[]) {
          // Solo transformar si los datos son del árbol IFC (tienen nodos IFC crudos)
          const needsTransform = Array.isArray(rawData) && rawData.length > 0
            && rawData.some((n: any) => {
              const name: string = n?.data?.Name ?? "";
              return /^IFC[A-Z]+$/i.test(name) || name.endsWith(".ifc");
            });
          const finalData = needsTransform ? toCompactTree(rawData) : rawData;
          originalDescriptor.set!.call(this, finalData);
          if (needsTransform) {
            requestAnimationFrame(() => { spatialTree.expanded = true; });
            // Rebuild Types tree from the raw (pre-transform) data
            buildTypesTree(rawData);
          }
        },
        configurable: true,
      });
      console.log("✅ SpatialTree: setter interceptado para toCompactTree");
    }

    fragments.list.onItemSet.add(() => {
      updateSpatialTree({ models: fragments.list.values() });
      spatialSection.collapsed = false;
    });

    // ── Types tree: data & build ───────────────────────────────────────────
    // Populated from the raw IFC spatial tree data set by CUI.
    /** category → list of all instances across all models */
    const typesData = new Map<string, { localId: number; modelId: string; name: string }[]>();

    // ── Types-tree row selection state ────────────────────────────────────
    let selectedTypesRow: HTMLElement | null = null;

    const selectTypesRow = (row: HTMLElement | null) => {
      if (selectedTypesRow && selectedTypesRow !== row) {
        selectedTypesRow.style.background  = "";
        selectedTypesRow.style.outline     = "";
        selectedTypesRow.style.borderLeft  = "";
        selectedTypesRow.style.paddingLeft = "";
        delete (selectedTypesRow as any)._typSel;
      }
      selectedTypesRow = row;
      if (row) {
        row.style.background  = "rgba(101,40,215,0.18)";
        row.style.outline     = "none";
        row.style.borderLeft  = "3px solid rgba(101,40,215,0.85)";
        row.style.paddingLeft = "5px";    // compensate border so text doesn't shift much
        (row as any)._typSel = true;
      }
    };

    // ── 3D highlight helper: passes ModelIdMap directly to highlighter ────
    const highlightTypesInModel = (modelIdMap: OBC.ModelIdMap): void => {
      highlighter.highlightByID("select", modelIdMap, true, false).catch(console.error);
    };

    const buildTypesTree = (rawNodes: any[]): void => {
      typesData.clear();

      const walkTree = (nodes: any[]) => {
        for (const node of nodes) {
          const nodeName: string = node.data?.Name ?? "";
          const upper = nodeName.toUpperCase();
          const isIfcClass = /^IFC[A-Z]+$/i.test(upper);

          if (isIfcClass) {
            if (!typesData.has(upper)) typesData.set(upper, []);
            const bucket = typesData.get(upper)!;
            for (const child of node.children ?? []) {
              const localId = child.data?.localId;
              const modelId = child.data?.modelId;
              if (localId === undefined || !modelId) continue;
              // child.data.Name may already be an HTMLElement if toCompactTree ran first
              const childName =
                typeof child.data.Name === "string"
                  ? child.data.Name
                  : (child.data.Name as HTMLElement)?.textContent ?? `#${localId}`;
              bucket.push({ localId, modelId, name: childName });
            }
          }

          // Always recurse: category nodes may be nested under storeys
          walkTree(node.children ?? []);
        }
      };

      walkTree(rawNodes);
      renderTypesTree();
    };

    const renderTypesTree = (): void => {
      typesContainer.innerHTML = "";

      if (typesData.size === 0) {
        typesContainer.innerHTML = `<div style="color:var(--bim-ui_bg-contrast-40);
          font-size:11px;text-align:center;padding:20px 8px;">
          Cargue un modelo IFC para ver los tipos.</div>`;
        return;
      }

      // Only show categories with at least one instance, sorted alphabetically by label
      const entries = [...typesData.entries()]
        .filter(([, insts]) => insts.length > 0)
        .sort(([a], [b]) => {
          const la = IFC_LABEL[a] ?? a.replace(/^IFC/, "");
          const lb = IFC_LABEL[b] ?? b.replace(/^IFC/, "");
          return la.localeCompare(lb);
        });

      for (const [category, instances] of entries) {
        const label   = IFC_LABEL[category] ?? category.replace(/^IFC/, "");
        const iconStr = IFC_ICON[category]  ?? "material-symbols:category";

        // ── Category row ──────────────────────────────────────────────────
        const catRow = document.createElement("div");
        catRow.style.cssText = [
          "display:flex","align-items:center","gap:5px",
          "padding:5px 8px","cursor:pointer","user-select:none",
          "border-bottom:1px solid var(--bim-ui_bg-contrast-10)",
          "color:var(--bim-ui_bg-contrast-80)",
        ].join(";");
        catRow.addEventListener("mouseenter", () => {
          if (!(catRow as any)._typSel) catRow.style.background = "var(--bim-ui_bg-contrast-10)";
        });
        catRow.addEventListener("mouseleave", () => {
          catRow.style.background = (catRow as any)._typSel ? "rgba(101,40,215,0.18)" : "";
        });

        const arrow = document.createElement("span");
        arrow.textContent = "▶";
        arrow.style.cssText = "font-size:8px;flex-shrink:0;opacity:0.55;transition:transform 0.15s;width:10px;";

        const catIcon = document.createElement("bim-icon") as any;
        catIcon.icon = iconStr;
        catIcon.style.cssText = "font-size:14px;flex-shrink:0;opacity:0.75;";

        const catLabel = document.createElement("span");
        catLabel.style.cssText = "flex:1;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;";
        catLabel.textContent = label;

        const catCount = document.createElement("span");
        catCount.style.cssText = "font-size:10px;opacity:0.45;flex-shrink:0;";
        catCount.textContent = String(instances.length);

        catRow.append(arrow, catIcon, catLabel, catCount);

        // ── Instances container (collapsed by default) ─────────────────────
        const instsContainer = document.createElement("div");
        instsContainer.style.display = "none";

        let expanded = false;

        arrow.addEventListener("click", (e: Event) => {
          e.stopPropagation();
          expanded = !expanded;
          arrow.style.transform = expanded ? "rotate(90deg)" : "";
          instsContainer.style.display = expanded ? "" : "none";
        });

        // Click on category row body → select ALL instances of this type
        catRow.addEventListener("click", (e: MouseEvent) => {
          if ((e.target as HTMLElement) === arrow) return;

          const modelIdMap: OBC.ModelIdMap = {};
          for (const inst of instances) {
            if (!modelIdMap[inst.modelId]) modelIdMap[inst.modelId] = new Set();
            modelIdMap[inst.modelId].add(inst.localId);
          }

          selectTypesRow(catRow);
          highlightTypesInModel(modelIdMap);
          applyTypeSelection(modelIdMap, label, instances.length).catch(console.error);
        });

        // ── Instance rows ──────────────────────────────────────────────────
        for (const inst of instances) {
          const instRow = document.createElement("div");
          instRow.style.cssText = [
            "display:flex","align-items:center","gap:5px",
            "padding:3px 8px 3px 30px","cursor:pointer",
            "color:var(--bim-ui_bg-contrast-70)",
            "border-bottom:1px solid var(--bim-ui_bg-contrast-05)",
          ].join(";");
          instRow.addEventListener("mouseenter", () => {
            if (!(instRow as any)._typSel) instRow.style.background = "var(--bim-ui_bg-contrast-10)";
          });
          instRow.addEventListener("mouseleave", () => {
            instRow.style.background = (instRow as any)._typSel ? "rgba(101,40,215,0.18)" : "";
          });

          const instLbl = document.createElement("span");
          instLbl.style.cssText = "overflow:hidden;text-overflow:ellipsis;white-space:nowrap;";
          instLbl.textContent = inst.name;
          instRow.append(instLbl);

          instRow.addEventListener("click", () => {
            const map: OBC.ModelIdMap = { [inst.modelId]: new Set([inst.localId]) };
            selectTypesRow(instRow);
            highlightTypesInModel(map);
            applySelection(map).catch(console.error);
          });

          instsContainer.append(instRow);
        }

        typesContainer.append(catRow, instsContainer);
      }
    };

    // ── Shared Psets for multi-item type selection ─────────────────────────
    const getSharedPropertySets = async (
      modelId: string,
      localIds: number[],
    ): Promise<{ name: string; properties: Record<string, string> }[]> => {
      if (localIds.length === 0) return [];
      if (localIds.length === 1) return getPropertySets(modelId, localIds[0]);

      const SAMPLE = Math.min(localIds.length, 8);
      const sample = localIds.slice(0, SAMPLE);
      const allPsets = await Promise.all(sample.map(id => getPropertySets(modelId, id)));

      const firstPsets = allPsets[0] ?? [];
      // Keep only psets whose name appears in every sampled item
      const shared = firstPsets.filter(pset =>
        allPsets.every(itemPsets => itemPsets.some(p => p.name === pset.name))
      );

      // Merge: show common values, mark differing ones as "(varies)"
      return shared.map(pset => {
        const merged: Record<string, string> = {};
        const matchingAll = allPsets.map(
          itemPsets => itemPsets.find(p => p.name === pset.name)
        );
        for (const [propName, propValue] of Object.entries(pset.properties)) {
          const allVals = matchingAll.map(p => p?.properties[propName] ?? "—");
          merged[propName] = allVals.every(v => v === allVals[0]) ? propValue : "(varies)";
        }
        return { name: pset.name, properties: merged };
      });
    };

    // ── Type-group selection handler ───────────────────────────────────────
    const applyTypeSelection = async (
      modelIdMap: OBC.ModelIdMap,
      typeLabel: string,
      count: number,
    ) => {
      activeSelTab = "general";
      lastModelIdMap = modelIdMap;

      // Show a summary in the General tab via the existing itemsData table
      updateItemsData({ modelIdMap, emptySelectionWarning: false });

      // Render tabs with shared Psets
      const myGen = ++renderGeneration;

      tabBar.innerHTML = "";
      tabButtons.clear();
      tabPanels.forEach(p => p.remove());
      tabPanels.clear();
      tabContent.innerHTML = "";

      // General tab: show a count summary
      const summaryPanel = createPanel();
      summaryPanel.innerHTML = `
        <div style="color:var(--bim-ui_bg-contrast-60);font-size:11px;
          padding:10px 8px;line-height:1.6;">
          <strong style="color:var(--bim-ui_bg-contrast-100);">${count} ${typeLabel}</strong>
          elements selected.<br>
          <span style="opacity:0.7;">Shared property sets are shown in the tabs below.</span>
        </div>`;
      tabContent.append(summaryPanel);
      tabPanels.set("general", summaryPanel);
      const genBtn = makeTabBtn("General", "general");
      tabBar.append(genBtn);
      tabButtons.set("general", genBtn);
      activateTab("general");

      selInfoSection.collapsed = false;
      requestAnimationFrame(() =>
        selInfoSection.scrollIntoView({ behavior: "smooth", block: "nearest" })
      );

      // Load shared Psets async
      const entries = Object.entries(modelIdMap);
      if (!entries.length || myGen !== renderGeneration) return;
      const [modelId, ids] = entries[0];
      const localIds = [...ids];

      const sharedPsets = await getSharedPropertySets(modelId, localIds);
      if (myGen !== renderGeneration) return;

      if (sharedPsets.length > 0) {
        sharedPsets.forEach((set, index) => {
          const key = `pset-${index}-${set.name.replace(/\s+/g, "-")}`;
          const panel = createPanel();
          panel.innerHTML = renderPropertiesTable(set.properties);
          tabContent.append(panel);
          tabPanels.set(key, panel);
          tabBar.append(makeTabBtn(set.name, key));
          tabButtons.set(key, tabBar.lastElementChild as HTMLButtonElement);
        });
      }

      // Keep General visible, rest hidden
      tabPanels.forEach((panel, key) => { panel.style.display = key === "general" ? "" : "none"; });
      requestAnimationFrame(updateNavBtns);
    };

    // ===============================
    // Selection Information (tabbed)
    // ===============================
    const [itemsDataTable, updateItemsData] = CUI.tables.itemsData({
      components, modelIdMap: {}, emptySelectionWarning: true,
    });
    (itemsDataTable as HTMLElement).style.maxHeight = "40vh";
    (itemsDataTable as HTMLElement).style.overflowY = "auto";
    (itemsDataTable as HTMLElement).style.fontSize  = "11px";

    // ── Tab state ──────────────────────────────────────────────────────────
    let activeSelTab: string = "general";
    let lastModelIdMap: OBC.ModelIdMap = {};
    let renderGeneration = 0;   // cancela renders en vuelo al cambiar selección
    let isIsolated = false;

    // ── Section container ──────────────────────────────────────────────────
    const selInfoSection = document.createElement("bim-panel-section") as BUI.PanelSection;
    selInfoSection.label     = "Selection Information";
    selInfoSection.icon      = "material-symbols:info";
    selInfoSection.collapsed = true;

    // ── Tab bar con flechas de navegación ─────────────────────────────────
    const tabBarStyle = document.createElement("style");
    tabBarStyle.textContent = `
      .sel-tab-bar::-webkit-scrollbar { display:none }
      .sel-tab-nav-btn {
        flex-shrink:0; width:24px; border:none; cursor:pointer;
        background:var(--bim-ui_bg-contrast-20);
        color:var(--bim-ui_bg-contrast-80);
        font-size:13px; line-height:1; display:flex;
        align-items:center; justify-content:center;
        transition:background 0.15s, opacity 0.15s;
        border-radius:3px; margin-bottom:2px;
      }
      .sel-tab-nav-btn:hover { background:var(--bim-ui_bg-contrast-30); }
      .sel-tab-nav-btn:disabled { opacity:0.25; cursor:default; }
    `;
    document.head.append(tabBarStyle);

    // Contenedor externo que agrupa flechas + tabBar
    const tabBarWrapper = document.createElement("div");
    tabBarWrapper.style.cssText = [
      "display:flex", "align-items:stretch", "gap:2px",
      "border-bottom:2px solid var(--bim-ui_bg-contrast-20)",
      "margin-bottom:4px", "padding-top:4px",
    ].join(";");

    const btnPrev = document.createElement("button");
    btnPrev.className = "sel-tab-nav-btn";
    btnPrev.innerHTML = "&#8249;";   // ‹
    btnPrev.title = "Anterior";

    const btnNext = document.createElement("button");
    btnNext.className = "sel-tab-nav-btn";
    btnNext.innerHTML = "&#8250;";   // ›
    btnNext.title = "Siguiente";

    const tabBar = document.createElement("div");
    tabBar.classList.add("sel-tab-bar");
    tabBar.style.cssText = [
      "display:flex", "gap:2px", "flex:1",
      "overflow-x:auto", "scroll-behavior:smooth",
      "scrollbar-width:none",
    ].join(";");

    // Scroll por paso al hacer click en las flechas
    const TAB_SCROLL_STEP = 120;
    btnPrev.addEventListener("click", () => {
      tabBar.scrollBy({ left: -TAB_SCROLL_STEP, behavior: "smooth" });
    });
    btnNext.addEventListener("click", () => {
      tabBar.scrollBy({ left: TAB_SCROLL_STEP, behavior: "smooth" });
    });

    // Actualizar estado disabled de las flechas según posición del scroll
    const updateNavBtns = () => {
      btnPrev.disabled = tabBar.scrollLeft <= 0;
      btnNext.disabled = tabBar.scrollLeft + tabBar.clientWidth >= tabBar.scrollWidth - 1;
      // Ocultar todo el wrapper de flechas si no hay overflow
      const hasOverflow = tabBar.scrollWidth > tabBar.clientWidth + 2;
      btnPrev.style.display = hasOverflow ? "" : "none";
      btnNext.style.display = hasOverflow ? "" : "none";
    };
    tabBar.addEventListener("scroll", updateNavBtns);

    tabBarWrapper.append(btnPrev, tabBar, btnNext);

    const tabContent = document.createElement("div");
    tabContent.style.cssText = "overflow-y:auto;max-height:45vh;";

    const makeTabBtn = (label: string, key: string) => {
      const btn = document.createElement("button");
      btn.textContent = label;
      btn.dataset.tab = key;
      Object.assign(btn.style, {
        flexShrink: "0",               // no comprimir — scroll horizontal
        padding: "5px 12px", border: "none", cursor: "pointer",
        borderRadius: "4px 4px 0 0", fontSize: "11px", fontWeight: "600",
        letterSpacing: "0.3px", transition: "background 0.15s, color 0.15s, border-color 0.15s",
        background: "var(--bim-ui_bg-contrast-10)",
        color: "var(--bim-ui_bg-contrast-80)",
        borderBottom: "2px solid transparent",
        marginBottom: "-2px",          // solapa el border-bottom del tabBar
        fontFamily: "inherit", whiteSpace: "nowrap",
      });
      btn.addEventListener("click", () => activateTab(key));
      return btn;
    };

    const tabButtons = new Map<string, HTMLButtonElement>();
    const tabPanels = new Map<string, HTMLElement>();

    const createPanel = () => {
      const panel = document.createElement("div");
      panel.style.cssText = "padding:4px 2px;font-family:inherit;display:none;";
      return panel;
    };

    const generalPanel = createPanel();
    generalPanel.append(itemsDataTable);
    tabPanels.set("general", generalPanel);

    const renderPlaceholder = (panel: HTMLElement, message: string) => {
      panel.innerHTML = `
        <div style="color:var(--bim-ui_bg-contrast-40);font-size:11px;
          text-align:center;padding:20px 8px;line-height:1.5;">
          ${message}
        </div>`;
    };

    const renderPropertiesTable = (properties: Record<string, string>) => {
      const rows = Object.entries(properties).map(([label, value]) => {
        const isEmpty = value === "" || value === "—";
        return `
          <tr>
            <td style="
              padding:6px 10px; font-size:10.5px; font-weight:600;
              color:var(--bim-ui_bg-contrast-60); width:38%;
              border-bottom:1px solid var(--bim-ui_bg-contrast-20);
              vertical-align:top; word-break:break-word;
            ">${label}</td>
            <td style="
              padding:6px 10px; font-size:11px;
              color:${isEmpty ? "var(--bim-ui_bg-contrast-40)" : "var(--bim-ui_bg-contrast-100)"};
              border-bottom:1px solid var(--bim-ui_bg-contrast-20);
              word-break:break-word; line-height:1.45;
            ">${value}</td>
          </tr>`;
      }).join("");

      return `
        <table style="width:100%;border-collapse:collapse;">
          <tbody>${rows}</tbody>
        </table>`;
    };

    // ── IFC property extraction helpers ───────────────────────────────────

    /**
     * Fetches full item data from the model for a given express ID.
     * Tries getItemsData (fragments v2), getItemData, and raw properties.
     */
    const getItemData = async (model: any, id: number, deep = true): Promise<any> => {
      if (!Number.isFinite(id)) return null;
      if (typeof model.getItemsData === "function") {
        try {
          const cfg = deep
            ? { attributesDefault: true, relationsDefault: { attributes: true, relations: true } }
            : { attributesDefault: true };
          const result = model.getItemsData([id], cfg);
          const awaited = result?.then ? await result : result;
          return Array.isArray(awaited) ? awaited[0] : awaited;
        } catch { /* try next */ }
      }
      if (typeof model.getItemData === "function") {
        try { return await model.getItemData(id); } catch { /* try next */ }
      }
      if (model?.properties?.getItemData) {
        try { return model.properties.getItemData(id); } catch { /* try next */ }
      }
      return model?.properties?.[id] ?? null;
    };

    /**
     * Extracts the express ID from an inlined ThatOpen object.
     * _localId may be a plain number or a {value: N} wrapper.
     */
    const getExpressId = (obj: any): number | null => {
      if (!obj || typeof obj !== "object") return null;
      if (typeof obj._localId === "number")       return obj._localId;
      if (typeof obj._localId?.value === "number") return obj._localId.value;
      if (typeof obj.expressID === "number")       return obj.expressID;
      return null;
    };

    /**
     * Extracts a display string from an IFC property value.
     * Handles NominalValue / Value, both plain scalars and {value} wrappers.
     */
    const extractPropValue = (prop: any): string => {
      if (!prop || typeof prop !== "object") return "—";
      const raw = prop.NominalValue ?? prop.Value;
      if (raw === null || raw === undefined) return "—";
      if (typeof raw === "object" && raw.value !== undefined) return String(raw.value);
      if (typeof raw === "object") return JSON.stringify(raw);
      return String(raw);
    };

    /**
     * Builds a {name, properties} entry from an IfcPropertySet-like object.
     *
     * Re-fetches the pset by its own express ID (shallow — attributes only)
     * so that HasProperties items come fully inlined rather than as {value:id}
     * references. Individual properties that remain as references are fetched
     * individually via getItemData.
     */
    const processPset = async (
      psetObj: any,
      model: any,
      out: Map<string, { name: string; properties: Record<string, string> }>,
    ): Promise<void> => {
      if (!psetObj || typeof psetObj !== "object") return;

      const rawName = psetObj.Name;
      const name: string =
        typeof rawName === "string"             ? rawName
        : rawName?.value !== undefined          ? String(rawName.value)
        : "";
      if (!name) return;

      // Re-fetch pset by its own ID with attributes-only config.
      // This makes the fragments engine inline HasProperties items directly.
      let workingPset = psetObj;
      const psetId = getExpressId(psetObj);
      if (psetId !== null && typeof model.getItemsData === "function") {
        try {
          const res = model.getItemsData([psetId], { attributesDefault: true });
          const fetched = Array.isArray(res?.then ? await res : res)
            ? (res?.then ? await res : res)[0]
            : (res?.then ? await res : res);
          const hp = fetched?.HasProperties ?? fetched?.Properties ?? fetched?.Quantities;
          if (fetched && Array.isArray(hp)) workingPset = fetched;
        } catch { /* fall through to inline version */ }
      }

      const rawProps = workingPset.HasProperties ?? workingPset.Properties ?? workingPset.Quantities;
      if (!Array.isArray(rawProps) || rawProps.length === 0) return;

      const propertyMap: Record<string, string> = {};
      for (const pRef of rawProps) {
        if (pRef === null || pRef === undefined) continue;

        let prop: any = null;
        if (typeof pRef === "number") {
          prop = await getItemData(model, pRef, false);
        } else if (typeof pRef === "object" && typeof pRef.value === "number") {
          prop = await getItemData(model, pRef.value, false);
        } else if (typeof pRef === "object") {
          prop = pRef;   // already inlined
        }
        if (!prop || typeof prop !== "object") continue;

        const rawPropName = prop.Name;
        const propName: string =
          typeof rawPropName === "string"            ? rawPropName
          : rawPropName?.value !== undefined         ? String(rawPropName.value)
          : "Propiedad";
        propertyMap[propName] = extractPropValue(prop);
      }

      if (Object.keys(propertyMap).length === 0) return;

      // Keep whichever version has more properties
      const existing = out.get(name);
      if (!existing || Object.keys(propertyMap).length > Object.keys(existing.properties).length) {
        out.set(name, { name, properties: propertyMap });
      }
    };

    /**
     * Returns all IfcPropertySets for a given element.
     *
     * Reads ONLY from IsDefinedBy to avoid picking up psets that belong
     * to related structural elements (storeys, types, etc.), which is the
     * cause of cross-category contamination (e.g. Pset_ColumnCommon on walls).
     *
     * ThatOpen's getItemsData flattens IfcRelDefinesByProperties into the
     * IsDefinedBy array, so each entry may be either:
     *   A) A pset object directly (Name + HasProperties) — ThatOpen flattened it
     *   B) A relation object with RelatingPropertyDefinition → follow to pset
     */

    /**
     * Extracts Psets from the IfcElementType linked via IsTypedBy.
     * IFC type objects (IfcWallType, IfcDoorType…) carry default property sets
     * in their own IsDefinedBy / HasPropertySets. This function walks:
     *   itemData.IsTypedBy → IfcRelDefinesByType → RelatingType → IsDefinedBy / HasPropertySets
     */
    const getTypePsets = async (
      model: any,
      itemData: any,
    ): Promise<{ name: string; properties: Record<string, string> }[]> => {
      const out = new Map<string, { name: string; properties: Record<string, string> }>();
      const isTypedBy = itemData.IsTypedBy;
      if (!Array.isArray(isTypedBy) || isTypedBy.length === 0) return [];

      for (const relRef of isTypedBy) {
        if (relRef === null || relRef === undefined) continue;

        // Resolve IfcRelDefinesByType reference
        let relObj: any;
        if (typeof relRef === "number") {
          relObj = await getItemData(model, relRef, false);
        } else if (typeof relRef === "object" && typeof relRef.value === "number") {
          relObj = await getItemData(model, relRef.value, false);
        } else {
          relObj = relRef;
        }
        if (!relObj || typeof relObj !== "object") continue;

        // Get RelatingType (the IfcElementType object)
        const relatingTypeRef = relObj.RelatingType;
        if (!relatingTypeRef) continue;

        let typeObj: any;
        if (typeof relatingTypeRef === "number") {
          typeObj = await getItemData(model, relatingTypeRef, true);
        } else if (typeof relatingTypeRef === "object" && typeof relatingTypeRef.value === "number") {
          typeObj = await getItemData(model, relatingTypeRef.value, true);
        } else {
          typeObj = relatingTypeRef;
        }
        if (!typeObj || typeof typeObj !== "object") continue;

        // Walk IsDefinedBy and HasPropertySets of the type object
        const typePsetSources = [
          ...(Array.isArray(typeObj.IsDefinedBy)     ? typeObj.IsDefinedBy     : []),
          ...(Array.isArray(typeObj.HasPropertySets) ? typeObj.HasPropertySets : []),
        ];

        for (const entry of typePsetSources) {
          if (entry === null || entry === undefined) continue;

          let obj: any;
          if (typeof entry === "number") {
            obj = await getItemData(model, entry, false);
          } else if (typeof entry === "object" && typeof entry.value === "number") {
            obj = await getItemData(model, entry.value, false);
          } else {
            obj = entry;
          }
          if (!obj || typeof obj !== "object") continue;

          // Case A: direct pset (Name + HasProperties)
          const hasProps = obj.HasProperties ?? obj.Properties ?? obj.Quantities;
          if (obj.Name && Array.isArray(hasProps)) {
            await processPset(obj, model, out);
            continue;
          }

          // Case B: relation → follow RelatingPropertyDefinition
          const relPropDef = obj.RelatingPropertyDefinition;
          if (!relPropDef) continue;
          const defs = Array.isArray(relPropDef) ? relPropDef : [relPropDef];
          for (const defRef of defs) {
            let psetObj: any = null;
            if (typeof defRef === "number") {
              psetObj = await getItemData(model, defRef, false);
            } else if (typeof defRef === "object" && typeof defRef.value === "number") {
              psetObj = await getItemData(model, defRef.value, false);
            } else if (typeof defRef === "object") {
              psetObj = defRef;
            }
            if (psetObj) await processPset(psetObj, model, out);
          }
        }
      }

      return Array.from(out.values());
    };

    const getPropertySets = async (
      modelId: string,
      localId: number,
    ): Promise<{ name: string; properties: Record<string, string> }[]> => {
      const model = fragments.list.get(modelId);
      if (!model) return [];

      const out = new Map<string, { name: string; properties: Record<string, string> }>();

      const itemData = await getItemData(model, localId);
      if (!itemData) return [];

      const isDefinedBy = itemData.IsDefinedBy;
      if (Array.isArray(isDefinedBy)) {
        for (const entry of isDefinedBy) {
          if (entry === null || entry === undefined) continue;

          // Resolve reference if needed
          let obj: any;
          if (typeof entry === "number") {
            obj = await getItemData(model, entry, false);
          } else if (typeof entry === "object" && typeof entry.value === "number") {
            obj = await getItemData(model, entry.value, false);
          } else {
            obj = entry;
          }
          if (!obj || typeof obj !== "object") continue;

          // Case A: ThatOpen flattened the relation → obj IS the pset
          const hasProps = obj.HasProperties ?? obj.Properties ?? obj.Quantities;
          if (obj.Name && Array.isArray(hasProps)) {
            await processPset(obj, model, out);
            continue;
          }

          // Case B: obj is an IfcRelDefinesByProperties → follow RelatingPropertyDefinition
          const relPropDef = obj.RelatingPropertyDefinition;
          if (!relPropDef) continue;
          const defs = Array.isArray(relPropDef) ? relPropDef : [relPropDef];
          for (const defRef of defs) {
            let psetObj: any = null;
            if (typeof defRef === "number") {
              psetObj = await getItemData(model, defRef, false);
            } else if (typeof defRef === "object" && typeof defRef.value === "number") {
              psetObj = await getItemData(model, defRef.value, false);
            } else if (typeof defRef === "object") {
              psetObj = defRef;
            }
            if (psetObj) await processPset(psetObj, model, out);
          }
        }
      }

      // Merge Psets from the linked IfcElementType (IsTypedBy → RelatingType)
      // Instance values take precedence: if the same Pset name exists in both,
      // we keep instance properties and only fill missing ones from the type.
      const typePsets = await getTypePsets(model, itemData);
      for (const tPset of typePsets) {
        const existing = out.get(tPset.name);
        if (existing) {
          // Merge: type props as base, instance props override
          out.set(tPset.name, {
            name: tPset.name,
            properties: { ...tPset.properties, ...existing.properties },
          });
        } else {
          out.set(tPset.name, tPset);
        }
      }

      return Array.from(out.values());
    };

    const activateTab = (key: string) => {
      activeSelTab = key;

      tabButtons.forEach((btn, tabKey) => {
        const isActive = tabKey === key;
        Object.assign(btn.style, {
          background:   isActive ? "var(--bim-ui_bg-contrast-20)" : "var(--bim-ui_bg-contrast-10)",
          color:        isActive ? "var(--bim-ui_bg-contrast-100)" : "var(--bim-ui_bg-contrast-80)",
          borderBottom: isActive ? "2px solid var(--bim-ui_accent-base, #6528d7)" : "2px solid transparent",
          fontWeight:   isActive ? "700" : "600",
        });
        // Desplazar la barra para que el tab activo quede visible
        if (isActive) {
          btn.scrollIntoView({ behavior: "smooth", inline: "nearest", block: "nearest" });
        }
      });

      tabPanels.forEach((panel, panelKey) => {
        const isActive = panelKey === key;
        panel.style.display = isActive ? "" : "none";
        if (isActive) panel.scrollTop = 0;   // siempre arriba al activar
      });
    };

    const renderSelectionTabs = async (modelIdMap: OBC.ModelIdMap) => {
      // Token de generación: si llega una nueva selección mientras ésta corre,
      // la generación habrá aumentado y abortamos el render viejo.
      const myGen = ++renderGeneration;

      const entries = Object.entries(modelIdMap);
      const [modelId, ids] = entries[0] ?? [];
      const localId = ids ? [...ids][0] : undefined;

      // ── Limpiar estado anterior ──────────────────────────────────────────
      tabBar.innerHTML = "";
      tabButtons.clear();
      tabPanels.forEach((panel) => panel.remove());
      tabPanels.clear();
      tabContent.innerHTML = "";

      // ── General tab (síncrono, siempre primero) ──────────────────────────
      const genBtn = makeTabBtn("General", "general");
      tabBar.append(genBtn);
      tabButtons.set("general", genBtn);
      generalPanel.style.display = "";       // visible mientras carga el resto
      generalPanel.scrollTop = 0;
      tabContent.append(generalPanel);
      tabPanels.set("general", generalPanel);
      activateTab("general");                // mostrar General inmediatamente

      if (!modelId || localId === undefined) return;

      // ── Cargar psets de forma asíncrona ─────────────────────────────────
      const propertySets = await getPropertySets(modelId, localId);

      // Si llegó otra selección mientras esperábamos, descartar este render
      if (myGen !== renderGeneration) return;

      if (propertySets.length > 0) {
        propertySets.forEach((set, index) => {
          const key = `pset-${index}-${set.name.replace(/\s+/g, "-")}`;
          const panel = createPanel();
          panel.innerHTML = renderPropertiesTable(set.properties);
          tabContent.append(panel);
          tabPanels.set(key, panel);

          const btn = makeTabBtn(set.name, key);
          tabBar.append(btn);
          tabButtons.set(key, btn);
        });
      } else {
        const placeholderPanel = createPanel();
        renderPlaceholder(placeholderPanel, "Este elemento no tiene Property Sets definidos.");
        tabContent.append(placeholderPanel);
        tabPanels.set("no-psets", placeholderPanel);
        const btn = makeTabBtn("Sin Psets", "no-psets");
        tabBar.append(btn);
        tabButtons.set("no-psets", btn);
      }

      // Mantener "general" como tab activa (ya está activada arriba)
      // Asegurar que el panel general siga visible y los pset ocultos
      tabPanels.forEach((panel, panelKey) => {
        panel.style.display = panelKey === "general" ? "" : "none";
      });

      // Recalcular flechas de navegación tras agregar todas las tabs
      requestAnimationFrame(updateNavBtns);
    };

    // Inicializar con la tab General
    tabBar.append(makeTabBtn("General", "general"));
    tabButtons.set("general", tabBar.lastElementChild as HTMLButtonElement);
    tabContent.append(generalPanel);
    selInfoSection.append(tabBarWrapper, tabContent);
    rightPanel.append(selInfoSection);

    // ── Central selection handler ──────────────────────────────────────────
    const applySelection = async (modelIdMap: OBC.ModelIdMap) => {
      // Siempre volver a General al cambiar selección
      activeSelTab = "general";

      // ── Debug: expose raw item data for console inspection ─────────────
      const _dbgEntry = Object.entries(modelIdMap)[0];
      if (_dbgEntry) {
        const [_dbgModelId, _dbgIds] = _dbgEntry;
        const _dbgLocalId = [..._dbgIds][0];
        const _dbgModel = fragments.list.get(_dbgModelId);
        if (_dbgModel && _dbgLocalId !== undefined) {
          getItemData(_dbgModel, _dbgLocalId).then(raw => {
            (window as any)._debugSelection = { modelId: _dbgModelId, localId: _dbgLocalId, raw };
            console.log("[DEBUG] window._debugSelection =", (window as any)._debugSelection);
          });
        }
      }

      lastModelIdMap = modelIdMap;
      updateItemsData({ modelIdMap, emptySelectionWarning: false });
      await renderSelectionTabs(modelIdMap);  // activa "general" al final

      // Scroll to top en todos los contenedores de contenido
      (itemsDataTable as HTMLElement).scrollTop = 0;
      tabContent.scrollTop = 0;
      generalPanel.scrollTop = 0;

      selInfoSection.collapsed = false;
      requestAnimationFrame(() =>
        selInfoSection.scrollIntoView({ behavior: "smooth", block: "nearest" })
      );
    };

    // ── Spatial Tree click ─────────────────────────────────────────────────
    spatialTree.selectableRows = true;
    spatialTree.addEventListener("click", (event: Event) => {
      const path    = event.composedPath();
      const row     = path.find((el: any) => el.tagName === "BIM-TABLE-ROW") as any;
      if (!row?.data) return;
      const modelId = row.data.modelId as string;
      const localId = row.data.localId as number;
      if (!modelId || localId === undefined) return;
      selectTypesRow(null);   // clear Types-tree row highlight on spatial tree click
      applySelection({ [modelId]: new Set([localId]) }).catch(console.error);
      console.log(`✅ Selection: ${row.data.Name} | localId=${localId}`);
    });

    // ── 3D click via Highlighter ───────────────────────────────────────────
    highlighter.events["select"].onHighlight.add((modelIdMap) => {
      if (!Object.keys(modelIdMap).length) return;
      selectTypesRow(null);   // clear Types-tree row highlight on external selection
      applySelection(modelIdMap).catch(console.error);
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
                const meshes: THREE.Mesh[] = [];
                for (const model of fragments.list.values()) {
                  model.object?.traverse((obj) => {
                    if (obj instanceof THREE.Mesh) meshes.push(obj);
                  });
                }
                if (meshes.length > 0) await world.camera.fit(meshes);
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
            <bim-button tooltip-title="Aislar selección"
              tooltip-text="Oculta todo excepto los elementos seleccionados"
              icon="material-symbols:filter-center-focus"
              @click=${async () => {
                if (isIsolated) {
                  // Restaurar visibilidad de todos los elementos
                  for (const [, model] of fragments.list) {
                    await model.setVisible(undefined, true);
                  }
                  isIsolated = false;
                } else {
                  const selectedKeys = Object.keys(lastModelIdMap);
                  if (!selectedKeys.length) return;
                  // Ocultar todos los elementos de todos los modelos
                  for (const [modelUuid, model] of fragments.list) {
                    const selectedIds = lastModelIdMap[modelUuid];
                    if (selectedIds && selectedIds.size > 0) {
                      // En este modelo hay seleccionados: ocultar todos, luego mostrar solo los seleccionados
                      await model.setVisible(undefined, false);
                      await model.setVisible(Array.from(selectedIds), true);
                    } else {
                      // Modelo sin seleccionados: ocultar todo
                      await model.setVisible(undefined, false);
                    }
                  }
                  isIsolated = true;
                }
                fragments.core.update(true);
              }}>
            </bim-button>
            <bim-button tooltip-title="Mostrar todo"
              icon="material-symbols:visibility"
              @click=${async () => {
                for (const [, model] of fragments.list) {
                  await model.setVisible(undefined, true);
                }
                isIsolated = false;
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
        row.addEventListener("click", (e: MouseEvent) => {
          // Ignorar clicks en botones internos de la fila (borrar)
          if ((e.target as HTMLElement).closest("bim-button, button")) return;
          const { Guid } = row.data;
          if (!Guid) return;
          const topic = topics.list.get(Guid);
          if (!topic) return;
          showTopicPanel(topic);

          // Navegar automáticamente al primer viewpoint del topic
          const firstVpGuid = [...topic.viewpoints][0];
          if (firstVpGuid) {
            const vp = viewpoints.list.get(firstVpGuid);
            if (vp) {
              if (!vp.world) vp.world = world;  // asegurar world antes de navegar
              vp.go({ transition: true }).catch(console.error);
              console.log("📷 Navegando al viewpoint:", firstVpGuid);
            }
          }
          console.log("✅ Topic seleccionado:", topic.title);
        });

        // Botón borrar inline en cada fila
        const deleteBtn = document.createElement("bim-button") as any;
        deleteBtn.icon    = "material-symbols:delete-outline";
        deleteBtn.label   = "";
        deleteBtn.title   = "Eliminar topic";
        Object.assign(deleteBtn.style, {
          position: "absolute", right: "4px", top: "50%",
          transform: "translateY(-50%)", zIndex: "10",
          opacity: "0", transition: "opacity 0.15s",
          "--bim-button--bgc": "transparent",
          "--bim-button--c": "var(--bim-ui_bg-contrast-60)",
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
          console.log("✅ Topic eliminado:", topic.title);
        });
        row.style.position = "relative";
        row.addEventListener("mouseover", () => { deleteBtn.style.opacity = "1"; });
        row.addEventListener("mouseout",  () => { deleteBtn.style.opacity = "0"; });
        row.append(deleteBtn);
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
          // Asignar world a todos los viewpoints importados que no lo tengan
          for (const vp of viewpoints.list.values()) {
            if (!vp.world) vp.world = world;
          }
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