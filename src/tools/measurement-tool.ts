import * as THREE from "three";
import * as OBC from "@thatopen/components";
import * as FRAGS from "@thatopen/fragments";
import * as OBF from "@thatopen/components-front";
import { Line2 } from "three/examples/jsm/lines/Line2.js";
import { LineGeometry } from "three/examples/jsm/lines/LineGeometry.js";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";

/** Tamaño (px) del cuadrado de previsualización de vértice mientras se
 *  apunta, antes de fijar la cota. */
const VERTEX_PREVIEW_SIZE_PX = 14;
/** Grosor (px) del borde de ese mismo cuadrado. */
const VERTEX_PREVIEW_BORDER_PX = "3px";
/** Largo fijo (unidades del mundo) de cada punta de flecha — no depende de
 *  la distancia medida, así todas las cotas se ven con flechas del mismo
 *  tamaño. */
const ARROW_HEAD_LENGTH = 0.15;
/** Tamaño (px) del círculo de vértice de una cota ya fijada. */
const VERTEX_CIRCLE_SIZE_PX = 9;
/** Grosor (px) del borde de ese círculo. */
const VERTEX_CIRCLE_BORDER_PX = 3;
/** Grosor (px en pantalla) de la línea gruesa que conecta los dos vértices. */
const DIMENSION_LINE_WIDTH_PX = 4;
/** Tamaño de guión/espacio (unidades del mundo) de la línea punteada que
 *  conecta la etiqueta arrastrada con su cota. */
const LEADER_DASH_SIZE = 0.06;
const LEADER_GAP_SIZE  = 0.05;
/** Distancia mínima (unidades del mundo) entre la etiqueta y su posición
 *  original para mostrar la línea punteada — evita dibujarla cuando la
 *  etiqueta está prácticamente en su lugar. */
const LEADER_MIN_DISTANCE = 0.05;
/** Tolerancia (unidades del mundo) para la oclusión de cotas: sin este
 *  margen, el rayo hacia el punto medio de una cota apoyada sobre una
 *  superficie vuelve a golpear esa misma superficie a una distancia casi
 *  idéntica (por el error de precisión del raycast) y la cota se marcaría
 *  como "detrás" de sí misma. */
const OCCLUSION_TOLERANCE = 0.03;

export function createMeasurementTool(
  components: OBC.Components,
  world: OBC.World,
): OBF.LengthMeasurement {
  const measurer     = components.get(OBF.LengthMeasurement);
  measurer.world     = world;
  measurer.color     = new THREE.Color("#74ac49");
  measurer.enabled   = false;
  measurer.snappings = [FRAGS.SnappingClass.POINT];
  measurer.pickerSize = VERTEX_PREVIEW_SIZE_PX;

  // Los estilos de la previsualización de vértice (cuadrado antes de fijar
  // el punto) son estáticos y compartidos por cualquier picker de vértices
  // de la librería; como el medidor es el único que pickea vértices en esta
  // app, es seguro engrosarlos acá sin afectar otras herramientas.
  OBF.GraphicVertexPicker.baseSnappingStyle.borderWidth = VERTEX_PREVIEW_BORDER_PX;
  for (const style of Object.values(OBF.GraphicVertexPicker.snappingStyles)) {
    style.borderWidth = VERTEX_PREVIEW_BORDER_PX;
  }

  setupDimensionArrows(measurer, world);
  setupVertexPickerRulerIcon(measurer);

  return measurer;
}

/**
 * Agrega un ícono de regla junto al cuadrado de snap de vértice, mismo
 * lenguaje visual que el ícono fantasma de corte/notas. El picker de
 * vértices es interno a la librería (`Measurement._vertexPicker`, sin API
 * pública) y crea su propio elemento recién en el primer snap exitoso, así
 * que hay que engancharse la primera vez que aparece en vez de crearlo
 * nosotros; `onPointerMove` ya se dispara en cada pick y es idempotente
 * revisar/agregar el ícono ahí.
 */
function setupVertexPickerRulerIcon(measurer: OBF.LengthMeasurement): void {
  measurer.onPointerMove.add(() => {
    const marker = (measurer as any)._vertexPicker?.marker as OBF.Mark | undefined;
    const el = marker?.three?.element as HTMLElement | undefined;
    if (!el || el.querySelector(".measurement-preview-icon")) return;
    el.style.position = "relative";
    const icon = document.createElement("bim-icon") as any;
    icon.className = "measurement-preview-icon";
    icon.icon = "solar:ruler-bold";
    el.append(icon);
  });
}

/** Crea el círculo (más grande que el de la librería) usado como marcador
 *  de vértice en los extremos de una cota ya fijada. */
function createVertexCircleElement(colorHex: string): HTMLElement {
  const el = document.createElement("div");
  el.style.height       = `${VERTEX_CIRCLE_SIZE_PX}px`;
  el.style.width        = `${VERTEX_CIRCLE_SIZE_PX}px`;
  el.style.borderRadius = "50%";
  el.style.border       = `${VERTEX_CIRCLE_BORDER_PX}px solid ${colorHex}`;
  el.style.background   = "white";
  el.style.zIndex       = "-20";
  return el;
}

interface DimensionVisuals {
  arrowStart: THREE.Mesh;
  arrowEnd: THREE.Mesh;
  shaft: Line2;
  shaftMaterial: LineMaterial;
  leader: Line2;
  leaderMaterial: LineMaterial;
}

/**
 * Compartido entre `setupDimensionArrows` (que crea/destruye estas mallas) y
 * `setupWallOcclusion` (que necesita ocultarlas junto con la cota) — vive a
 * nivel de módulo porque ambas funciones se enganchan a la misma instancia
 * de `measurer.lines` pero no tienen otra forma de pasarse este estado sin
 * cambiar la firma pública de `createMeasurementTool`.
 */
const dimensionVisuals = new Map<OBF.DimensionLine, DimensionVisuals>();

/**
 * Una vez fijada una cota se le agrega: círculos de vértice más grandes en
 * los extremos, una línea gruesa (del mismo color) que los conecta, una
 * flecha de doble punta sobre esa línea apuntando hacia cada vértice, y la
 * posibilidad de arrastrar la etiqueta (queda unida a la cota por una línea
 * punteada) para despejarla en cotas chicas donde el número no entra.
 */
function setupDimensionArrows(measurer: OBF.LengthMeasurement, world: OBC.World): void {
  const createArrowHead = (): THREE.Mesh => {
    const geometry = new THREE.ConeGeometry(1, 1, 12);
    geometry.translate(0, -0.5, 0); // la punta queda en el origen local
    const material = new THREE.MeshBasicMaterial({
      color: measurer.linesMaterial.color,
      depthTest: false,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.renderOrder = 3;
    return mesh;
  };

  const createShaft = (): { shaft: Line2; material: LineMaterial } => {
    const material = new LineMaterial({
      color: measurer.linesMaterial.color.getHex(),
      linewidth: DIMENSION_LINE_WIDTH_PX,
    });
    const shaft = new Line2(new LineGeometry(), material);
    shaft.renderOrder = 1;
    return { shaft, material };
  };

  const createLeader = (): { leader: Line2; material: LineMaterial } => {
    const material = new LineMaterial({
      color: measurer.linesMaterial.color.getHex(),
      linewidth: 1.5,
      dashed: true,
      dashSize: LEADER_DASH_SIZE,
      gapSize: LEADER_GAP_SIZE,
    });
    const leader = new Line2(new LineGeometry(), material);
    leader.renderOrder = 1;
    leader.visible = false;
    return { leader, material };
  };

  const up = new THREE.Vector3(0, 1, 0);
  const orient = (mesh: THREE.Mesh, tip: THREE.Vector3, outward: THREE.Vector3, length: number): void => {
    mesh.position.copy(tip);
    mesh.quaternion.setFromUnitVectors(up, outward);
    const radius = length * 0.35;
    mesh.scale.set(radius, length, radius);
  };

  const direction = new THREE.Vector3();
  const updateVisuals = (dim: OBF.DimensionLine, visual: DimensionVisuals): void => {
    const { start, end } = dim.line;
    visual.shaft.geometry.setFromPoints([start, end]);
    visual.shaft.computeLineDistances();

    direction.subVectors(end, start);
    const distance = direction.length();
    if (distance < 1e-6) {
      visual.arrowStart.visible = false;
      visual.arrowEnd.visible = false;
      return;
    }
    direction.normalize();
    // Tope en cotas muy cortas para que las dos puntas no se superpongan.
    const length = Math.min(ARROW_HEAD_LENGTH, distance * 0.45);
    visual.arrowStart.visible = true;
    visual.arrowEnd.visible = true;
    orient(visual.arrowStart, start, direction.clone().negate(), length);
    orient(visual.arrowEnd, end, direction, length);
  };

  measurer.lines.onItemAdded.add((dim) => {
    const colorHex = `#${measurer.linesMaterial.color.getHexString()}`;
    dim.endpointElement = createVertexCircleElement(colorHex);

    const { shaft, material } = createShaft();
    const { leader, material: leaderMaterial } = createLeader();
    const visual: DimensionVisuals = {
      arrowStart: createArrowHead(),
      arrowEnd: createArrowHead(),
      shaft,
      shaftMaterial: material,
      leader,
      leaderMaterial,
    };
    dim.lineElement.parent?.add(visual.shaft, visual.arrowStart, visual.arrowEnd, visual.leader);
    updateVisuals(dim, visual);
    dimensionVisuals.set(dim, visual);

    makeLabelDraggable(dim, visual, world);
  });

  // Las mallas/línea son hijas del mismo grupo que la cota, así que
  // `DimensionLine.dispose()` ya las remueve y libera solo; acá solo hace
  // falta soltar la referencia para no filtrar memoria.
  measurer.lines.onBeforeDelete.add((dim) => dimensionVisuals.delete(dim));
  measurer.lines.onCleared.add(() => dimensionVisuals.clear());

  // El color de los círculos de vértice ya lo sincroniza la propia librería
  // (`DimensionLine.color`) cuando cambia `measurer.color`; acá solo hace
  // falta sincronizar las flechas y la línea gruesa, que son nuestras.
  measurer.onStateChanged.add((changes) => {
    if (!changes.includes("color")) return;
    const color = measurer.linesMaterial.color;
    for (const visual of dimensionVisuals.values()) {
      (visual.arrowStart.material as THREE.MeshBasicMaterial).color.copy(color);
      (visual.arrowEnd.material as THREE.MeshBasicMaterial).color.copy(color);
      visual.shaftMaterial.color.copy(color);
      visual.leaderMaterial.color.copy(color);
    }
  });
}

export interface WallOcclusionControl {
  isEnabled: () => boolean;
  setEnabled: (enabled: boolean) => void;
}

export type MeasurementSubMode = "add" | "select";

export interface MeasurementSelectionControl {
  getSubMode: () => MeasurementSubMode;
  setSubMode: (mode: MeasurementSubMode) => void;
  onSubModeChange: OBC.Event<MeasurementSubMode>;
  getSelected: () => OBF.DimensionLine | null;
  onSelectionChange: OBC.Event<OBF.DimensionLine | null>;
  /** Raycastea la cota bajo el punto de pantalla dado y la selecciona; si no
   *  hay ninguna ahí, deselecciona. Devuelve si encontró algo. */
  pickAt: (clientX: number, clientY: number) => boolean;
  deselect: () => void;
  deleteSelected: () => void;
}

const SELECTION_HIGHLIGHT_COLOR = new THREE.Color("#ffc400");

/**
 * Modo "editar" del panel del medidor: en vez de crear una cota nueva en cada
 * click (modo "agregar"), permite seleccionar una cota ya existente
 * clickeando sobre ella para ver sus propiedades en el panel dinámico.
 * Reutiliza `dim.boundingBox` — la misma caja invisible que la librería crea
 * para cada `DimensionLine` y usa internamente para resolver a qué cota
 * apunta el atajo de teclado "Delete" — así que el hit-test queda
 * garantizado consistente con el resto de la herramienta.
 */
export function setupMeasurementSelection(
  measurer: OBF.LengthMeasurement,
  world: OBC.World,
): MeasurementSelectionControl {
  let subMode: MeasurementSubMode = "add";
  let selected: OBF.DimensionLine | null = null;
  const onSubModeChange = new OBC.Event<MeasurementSubMode>();
  const onSelectionChange = new OBC.Event<OBF.DimensionLine | null>();
  const raycaster = new THREE.Raycaster();

  const applyHighlight = (dim: OBF.DimensionLine, isSelected: boolean): void => {
    dim.isSelected = isSelected;
    const visual = dimensionVisuals.get(dim);
    if (!visual) return;
    const color = isSelected ? SELECTION_HIGHLIGHT_COLOR : measurer.linesMaterial.color;
    visual.shaftMaterial.color.copy(color);
    visual.shaftMaterial.linewidth = isSelected ? DIMENSION_LINE_WIDTH_PX + 2 : DIMENSION_LINE_WIDTH_PX;
    (visual.arrowStart.material as THREE.MeshBasicMaterial).color.copy(color);
    (visual.arrowEnd.material as THREE.MeshBasicMaterial).color.copy(color);
  };

  const deselect = (): void => {
    if (!selected) return;
    applyHighlight(selected, false);
    selected = null;
    onSelectionChange.trigger(null);
  };

  const select = (dim: OBF.DimensionLine): void => {
    if (selected === dim) return;
    if (selected) applyHighlight(selected, false);
    selected = dim;
    applyHighlight(dim, true);
    onSelectionChange.trigger(dim);
  };

  const pickAt = (clientX: number, clientY: number): boolean => {
    const dom = world.renderer?.three.domElement;
    if (!dom) return false;
    const rect = dom.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1,
    );
    raycaster.setFromCamera(ndc, world.camera.three);
    const dims = [...measurer.lines];
    const hit = raycaster.intersectObjects(dims.map((dim) => dim.boundingBox), false)[0];
    const dim = hit && dims.find((d) => d.boundingBox === hit.object);
    if (dim) {
      select(dim);
      return true;
    }
    deselect();
    return false;
  };

  // Si la cota seleccionada se borra (p. ej. con "Delete" mientras el mouse
  // ya no está sobre ella), soltar la referencia para no quedar apuntando a
  // un objeto disposeado.
  measurer.lines.onBeforeDelete.add((dim) => {
    if (selected === dim) {
      selected = null;
      onSelectionChange.trigger(null);
    }
  });

  const deleteSelected = (): void => {
    if (selected) measurer.list.delete(selected.line);
  };

  const setSubMode = (mode: MeasurementSubMode): void => {
    if (subMode === mode) return;
    subMode = mode;
    if (mode === "add") deselect();
    onSubModeChange.trigger(mode);
  };

  return {
    getSubMode: () => subMode,
    setSubMode,
    onSubModeChange,
    getSelected: () => selected,
    onSelectionChange,
    pickAt,
    deselect,
    deleteSelected,
  };
}

/** Proyecta un punto del mundo a coordenadas de cliente (mismo espacio que
 *  `PointerEvent.clientX/Y`) contra el canvas dado, o `null` si cae detrás
 *  de la cámara. */
function projectToClient(
  point: THREE.Vector3,
  camera: THREE.Camera,
  dom: HTMLCanvasElement,
): { x: number; y: number } | null {
  const ndc = point.clone().project(camera);
  if (ndc.z < -1 || ndc.z > 1) return null;
  const rect = dom.getBoundingClientRect();
  return {
    x: rect.left + (ndc.x * 0.5 + 0.5) * rect.width,
    y: rect.top + (1 - (ndc.y * 0.5 + 0.5)) * rect.height,
  };
}

/**
 * Controla el checkbox "Oclusión de pared" del panel del medidor: con la
 * opción activa, oculta por completo las cotas cuyos DOS extremos quedan
 * detrás de geometría del modelo vista desde la cámara actual (p. ej. la
 * cota de una pared posterior, tapada por la pared de enfrente). Se evalúa
 * cada vértice por separado en vez de un único punto medio: alcanza con que
 * la superficie adyacente a uno de los dos extremos esté visible para
 * mostrar la cota completa — esto evita falsos positivos en paredes que sí
 * están a la vista, donde una sola muestra en el medio del borde puede caer
 * justo en una esquina/silueta y reportar oclusión por error. Se recalcula
 * en cada movimiento de cámara y cada vez que se agrega o borra una cota.
 */
export function setupWallOcclusion(
  measurer: OBF.LengthMeasurement,
  world: OBC.World,
  fragments: OBC.FragmentsManager,
): WallOcclusionControl {
  let enabled = false;
  let updateScheduled = false;
  const cameraForward = new THREE.Vector3();
  const toPoint = new THREE.Vector3();

  const setDimVisible = (dim: OBF.DimensionLine, visible: boolean): void => {
    dim.visible = visible;
    const visual = dimensionVisuals.get(dim);
    if (!visual) return;
    visual.shaft.visible = visible;
    visual.arrowStart.visible = visible;
    visual.arrowEnd.visible = visible;
    if (!visible) visual.leader.visible = false;
  };

  // Profundidad de un punto a lo largo de la dirección de vista de la
  // cámara (no la distancia euclídea a `camera.position`): con cámara
  // ortográfica los rayos son paralelos entre sí, no divergen desde la
  // posición de la cámara, así que la distancia euclídea no es comparable
  // entre el vértice de la cota y el punto donde impacta el raycast.
  const depthAlongView = (point: THREE.Vector3, camera: THREE.Camera): number => {
    camera.getWorldDirection(cameraForward);
    toPoint.subVectors(point, camera.position);
    return toPoint.dot(cameraForward);
  };

  // Verifica si la superficie adyacente a un único vértice está tapada:
  // proyecta el punto a pantalla, raycastea el modelo ahí mismo y compara
  // profundidades. Si el primer impacto queda notoriamente más cerca de la
  // cámara que el propio vértice, hay geometría de por medio.
  const isVertexOccluded = async (point: THREE.Vector3, camera: THREE.Camera, dom: HTMLCanvasElement): Promise<boolean> => {
    const screen = projectToClient(point, camera, dom);
    if (!screen) return false;
    const pointDepth = depthAlongView(point, camera);

    let result: FRAGS.RaycastResult | undefined;
    try {
      result = await fragments.raycast({
        camera,
        mouse: new THREE.Vector2(screen.x, screen.y),
        dom,
      });
    } catch {
      return false;
    }
    if (!result) return false;
    const hitDepth = depthAlongView(result.point, camera);
    return hitDepth < pointDepth - OCCLUSION_TOLERANCE;
  };

  const isOccluded = async (dim: OBF.DimensionLine): Promise<boolean> => {
    const dom = world.renderer?.three.domElement;
    if (!dom) return false;
    const camera = world.camera.three;
    const [startOccluded, endOccluded] = await Promise.all([
      isVertexOccluded(dim.line.start, camera, dom),
      isVertexOccluded(dim.line.end, camera, dom),
    ]);
    return startOccluded && endOccluded;
  };

  const updateAll = async (): Promise<void> => {
    if (!enabled) return;
    const dims = [...measurer.lines];
    const occluded = await Promise.all(dims.map(isOccluded));
    dims.forEach((dim, i) => setDimVisible(dim, !occluded[i]));
  };

  // Coalesce recalculos: el evento "update" de camera-controls dispara varias
  // veces por gesto de cámara, y no tiene sentido lanzar un raycast por cota
  // en cada uno — un solo recálculo por frame alcanza.
  const scheduleUpdate = (): void => {
    if (!enabled || updateScheduled) return;
    updateScheduled = true;
    requestAnimationFrame(() => {
      updateScheduled = false;
      updateAll();
    });
  };

  if (world.camera.controls) {
    world.camera.controls.addEventListener("update", scheduleUpdate);
  }
  measurer.lines.onItemAdded.add(scheduleUpdate);
  measurer.lines.onBeforeDelete.add(scheduleUpdate);

  return {
    isEnabled: () => enabled,
    setEnabled: (value: boolean) => {
      if (enabled === value) return;
      enabled = value;
      if (enabled) void updateAll();
      else for (const dim of measurer.lines) setDimVisible(dim, true);
    },
  };
}

/**
 * Permite arrastrar la etiqueta de una cota en el plano paralelo a la
 * cámara (a la profundidad en la que ya está la etiqueta). Mientras se
 * aleja de su posición original se dibuja una línea punteada uniéndola con
 * el punto medio de la cota; si vuelve a acercarse, la línea se oculta de
 * nuevo.
 */
function makeLabelDraggable(dim: OBF.DimensionLine, visual: DimensionVisuals, world: OBC.World): void {
  const el = dim.label.three.element;
  el.style.pointerEvents = "auto";
  el.style.cursor = "grab";

  const anchor = dim.label.three.position.clone();
  const plane = new THREE.Plane();
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const cameraDirection = new THREE.Vector3();
  const target = new THREE.Vector3();
  let dragging = false;

  const updateLeader = (): void => {
    const pos = dim.label.three.position;
    if (anchor.distanceTo(pos) < LEADER_MIN_DISTANCE) {
      visual.leader.visible = false;
      return;
    }
    visual.leader.visible = true;
    visual.leader.geometry.setFromPoints([anchor, pos]);
    visual.leader.computeLineDistances();
  };

  const pickOnPlane = (event: PointerEvent): boolean => {
    if (!world.renderer) return false;
    const rect = world.renderer.three.domElement.getBoundingClientRect();
    ndc.set(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1,
    );
    raycaster.setFromCamera(ndc, world.camera.three);
    return raycaster.ray.intersectPlane(plane, target) !== null;
  };

  el.addEventListener("pointerdown", (event: PointerEvent) => {
    if (event.button !== 0) return;
    event.stopPropagation();
    event.preventDefault();
    dragging = true;
    el.style.cursor = "grabbing";
    el.setPointerCapture(event.pointerId);
    (world.camera as OBC.OrthoPerspectiveCamera).setUserInput(false);

    world.camera.three.getWorldDirection(cameraDirection);
    plane.setFromNormalAndCoplanarPoint(cameraDirection, dim.label.three.position);
  });

  el.addEventListener("pointermove", (event: PointerEvent) => {
    if (!dragging) return;
    event.stopPropagation();
    if (pickOnPlane(event)) {
      dim.label.three.position.copy(target);
      updateLeader();
    }
  });

  const endDrag = (event: PointerEvent): void => {
    if (!dragging) return;
    dragging = false;
    el.style.cursor = "grab";
    el.releasePointerCapture(event.pointerId);
    (world.camera as OBC.OrthoPerspectiveCamera).setUserInput(true);
  };
  el.addEventListener("pointerup", endDrag);
  el.addEventListener("pointercancel", endDrag);
}

/**
 * A partir de una cara raycasteada (triángulos indexados locales al pick, ver
 * `RaycastHit.facePoints`/`faceIndices`), crea una medición por cada borde
 * de perímetro de esa triangulación. Un borde interior compartido entre dos
 * triángulos adyacentes (p.ej. la diagonal de un rectángulo dividido en 2
 * triángulos) aparece en ambos y se excluye del todo — solo son "de
 * perímetro" los bordes que pertenecen a un único triángulo. Si el contorno
 * resulta ser un rectángulo (lados opuestos iguales) alcanza con mostrar
 * largo y alto, así que se descartan los dos lados redundantes; ver
 * `selectFaceEdgesToMeasure`.
 */
export function measureFaceEdges(
  measurer: OBF.LengthMeasurement,
  facePoints: Float32Array,
  faceIndices: Uint16Array,
): void {
  const getVertex = (idx: number): THREE.Vector3 =>
    new THREE.Vector3(facePoints[idx * 3], facePoints[idx * 3 + 1], facePoints[idx * 3 + 2]);

  const edgeCount = new Map<string, { a: number; b: number; count: number }>();
  for (let i = 0; i < faceIndices.length; i += 3) {
    const tri = [faceIndices[i], faceIndices[i + 1], faceIndices[i + 2]];
    for (let e = 0; e < 3; e++) {
      const a = tri[e];
      const b = tri[(e + 1) % 3];
      if (a === b) continue;
      const key = a < b ? `${a}_${b}` : `${b}_${a}`;
      const existing = edgeCount.get(key);
      if (existing) existing.count++;
      else edgeCount.set(key, { a, b, count: 1 });
    }
  }

  const boundaryEdges = [...edgeCount.values()].filter((edge) => edge.count === 1);
  const edgesToMeasure = selectFaceEdgesToMeasure(boundaryEdges, getVertex);
  for (const { a, b } of edgesToMeasure) {
    const line = new OBF.Line(getVertex(a), getVertex(b));
    line.units    = measurer.units;
    line.rounding = measurer.rounding;
    measurer.list.add(line);
  }
}

/**
 * Si el contorno tiene exactamente 4 bordes y estos cierran un rectángulo
 * (lados opuestos de igual longitud), devuelve solo dos bordes adyacentes
 * (largo y alto) — los otros dos son redundantes. En cualquier otro caso
 * (lados opuestos distintos, contorno que no cierra, u otra cantidad de
 * bordes) devuelve todos los bordes sin modificar.
 */
function selectFaceEdgesToMeasure(
  edges: { a: number; b: number }[],
  getVertex: (idx: number) => THREE.Vector3,
): { a: number; b: number }[] {
  if (edges.length !== 4) return edges;

  const ordered = orderEdgeCycle(edges);
  if (!ordered) return edges;

  const length = (edge: { a: number; b: number }) =>
    getVertex(edge.a).distanceTo(getVertex(edge.b));
  const approxEqual = (x: number, y: number) => Math.abs(x - y) <= Math.max(x, y) * 0.005 + 1e-4;

  const isRectangular =
    approxEqual(length(ordered[0]), length(ordered[2])) &&
    approxEqual(length(ordered[1]), length(ordered[3]));

  return isRectangular ? [ordered[0], ordered[1]] : edges;
}

/**
 * Reordena bordes sin orden garantizado en el ciclo que forman, siguiendo la
 * cadena de vértices compartidos. Devuelve `null` si no cierran un ciclo
 * simple (cada borde debe conectar con el siguiente por un vértice en común
 * y el último debe volver al primero).
 */
function orderEdgeCycle(
  edges: { a: number; b: number }[],
): { a: number; b: number }[] | null {
  const remaining = [...edges];
  const ordered = [remaining.shift()!];
  while (remaining.length > 0) {
    const last = ordered[ordered.length - 1];
    const idx = remaining.findIndex((e) => e.a === last.b || e.b === last.b);
    if (idx === -1) return null;
    const [next] = remaining.splice(idx, 1);
    ordered.push(next.a === last.b ? next : { a: next.b, b: next.a });
  }
  if (ordered[ordered.length - 1].b !== ordered[0].a) return null;
  return ordered;
}
