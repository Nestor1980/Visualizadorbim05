import * as THREE from "three";
import * as OBC from "@thatopen/components";
import * as OBF from "@thatopen/components-front";
import * as FRAGS from "@thatopen/fragments";
import { Line2 } from "three/examples/jsm/lines/Line2.js";
import { LineGeometry } from "three/examples/jsm/lines/LineGeometry.js";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";

/**
 * Herramienta de cotas — reconstrucción desde cero (reemplaza a la vieja
 * herramienta de medición, eliminada). Hover sobre el modelo resalta el
 * vértice/borde/cara bajo el cursor según el modo de snap activo; un click
 * sobre un snap válido fija el primer punto de la cota y el siguiente click
 * sobre otro snap la cierra, creando una cota permanente.
 */

const HIGHLIGHT_COLOR = new THREE.Color("#00c2ff");
const EDGE_LINE_WIDTH_PX = 3;
const VERTEX_SIZE_PX = 12;
const VERTEX_BORDER_PX = 3;
/** Tope defensivo de bordes dibujados por hover de cara, para no crear un
 *  pool desmedido ante una triangulación inusualmente grande. */
const MAX_FACE_EDGES = 64;

/** Grosor (px) de la línea de una cota ya creada — un poco más gruesa que el
 *  resaltado de hover para que se lea como "confirmada". */
const DIMENSION_LINE_WIDTH_PX = 4;
/** Tamaño (px) de los círculos rellenos que marcan los extremos de una cota
 *  ya creada, y del punto de partida mientras se ubica el segundo click. */
const DIMENSION_VERTEX_SIZE_PX = 10;

export type CotaSnapMode = "vertex" | "edge" | "face";

const SNAP_CLASS_FOR_MODE: Record<CotaSnapMode, FRAGS.SnappingClass> = {
  vertex: FRAGS.SnappingClass.POINT,
  edge:   FRAGS.SnappingClass.LINE,
  face:   FRAGS.SnappingClass.FACE,
};

/**
 * Cota ya creada (permanente). Expone `visible` como accessor en vez de una
 * propiedad plana porque, a diferencia de una `WorldLabel` (un solo `Mark`),
 * acá "visible" son cuatro objetos distintos (dos vértices, etiqueta y línea)
 * que tienen que moverse juntos — así el árbol de capas de datos puede seguir
 * escribiendo `cota.visible = ...`, igual que ya hace con labels/trazos.
 */
export class CotaItem {
  readonly id: string;
  readonly start: THREE.Vector3;
  readonly end: THREE.Vector3;
  readonly distance: number;
  private readonly startMark: OBF.Mark;
  private readonly endMark: OBF.Mark;
  private readonly labelMark: OBF.Mark;
  private readonly shaft: Line2;
  private readonly shaftMaterial: LineMaterial;
  private _visible = true;

  constructor(params: {
    id: string;
    start: THREE.Vector3;
    end: THREE.Vector3;
    startMark: OBF.Mark;
    endMark: OBF.Mark;
    labelMark: OBF.Mark;
    shaft: Line2;
    shaftMaterial: LineMaterial;
  }) {
    this.id = params.id;
    this.start = params.start;
    this.end = params.end;
    this.distance = params.start.distanceTo(params.end);
    this.startMark = params.startMark;
    this.endMark = params.endMark;
    this.labelMark = params.labelMark;
    this.shaft = params.shaft;
    this.shaftMaterial = params.shaftMaterial;
  }

  get visible(): boolean {
    return this._visible;
  }

  set visible(value: boolean) {
    this._visible = value;
    this.startMark.visible = value;
    this.endMark.visible = value;
    this.labelMark.visible = value;
    this.shaft.visible = value;
  }

  dispose(): void {
    this.startMark.dispose();
    this.endMark.dispose();
    this.labelMark.dispose();
    this.shaft.removeFromParent();
    this.shaft.geometry.dispose();
    this.shaftMaterial.dispose();
  }
}

export interface CotaTool {
  readonly active: boolean;
  activate: () => void;
  deactivate: () => void;
  getSnapMode: () => CotaSnapMode;
  setSnapMode: (mode: CotaSnapMode) => void;
  /** Cotas ya creadas — el árbol de capas de datos (`data-layers-tree.ts`)
   *  se suscribe a estos eventos para anidar cada cota nueva en la capa
   *  activa, igual que ya hace con mediciones/etiquetas/trazos. */
  list: Map<string, CotaItem>;
  onItemAdded: OBC.Event<CotaItem>;
  onItemDeleted: OBC.Event<string>;
  deleteCota: (id: string) => void;
  /** Recrea una cota ya terminada a partir de sus dos extremos (sin pasar
   *  por el flujo interactivo de click) — usada al restaurar un proyecto
   *  guardado. */
  addCota: (start: THREE.Vector3, end: THREE.Vector3) => CotaItem;
}

interface VertexMarker {
  mark: OBF.Mark;
}

interface EdgeLine {
  line: Line2;
  material: LineMaterial;
}

/** Bordes de perímetro de una cara raycasteada: un borde compartido por dos
 *  triángulos adyacentes es interior y se excluye — solo interesan los que
 *  pertenecen a un único triángulo. Misma lógica que usaba la herramienta
 *  anterior para partir una cara en los bordes a medir. */
function computeBoundaryEdges(faceIndices: Uint16Array): { a: number; b: number }[] {
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
  return [...edgeCount.values()].filter((edge) => edge.count === 1);
}

function faceVertex(facePoints: Float32Array, idx: number): THREE.Vector3 {
  return new THREE.Vector3(facePoints[idx * 3], facePoints[idx * 3 + 1], facePoints[idx * 3 + 2]);
}

interface FaceBoundary {
  segments: [THREE.Vector3, THREE.Vector3][];
  vertices: THREE.Vector3[];
}

function computeFaceBoundary(facePoints: Float32Array, faceIndices: Uint16Array): FaceBoundary {
  const edges = computeBoundaryEdges(faceIndices).slice(0, MAX_FACE_EDGES);
  const segments: [THREE.Vector3, THREE.Vector3][] =
    edges.map(({ a, b }) => [faceVertex(facePoints, a), faceVertex(facePoints, b)]);
  const uniqueIndices = new Set<number>();
  for (const { a, b } of edges) {
    uniqueIndices.add(a);
    uniqueIndices.add(b);
  }
  const vertices = [...uniqueIndices].map((idx) => faceVertex(facePoints, idx));
  return { segments, vertices };
}

/**
 * Estado del snap vigente bajo el cursor, ya validado contra el modo activo
 * — `fragments.raycast(...)` cae de vuelta a un raycast plano (sin
 * `snappingClass`) cuando no encuentra un snap del tipo pedido dentro de la
 * tolerancia, así que un resultado con `snappingClass` distinto al pedido
 * NO es un snap válido y debe tratarse como "sin snap" (`{ kind: "none" }`),
 * tanto para el resaltado como para lo que hace un click. Sin este filtro,
 * en modo "vertex" un click lejos de cualquier vértice terminaba creando la
 * cota en un punto cualquiera de la cara bajo el cursor.
 */
type SnapState =
  | { kind: "none" }
  | { kind: "vertex"; point: THREE.Vector3 }
  | { kind: "edge"; p1: THREE.Vector3; p2: THREE.Vector3 }
  | ({ kind: "face" } & FaceBoundary);

function deriveSnapState(result: FRAGS.RaycastResult | undefined, mode: CotaSnapMode): SnapState {
  if (!result || result.snappingClass !== SNAP_CLASS_FOR_MODE[mode]) return { kind: "none" };

  if (mode === "vertex") return { kind: "vertex", point: result.point };

  if (mode === "edge" && result.snappedEdgeP1 && result.snappedEdgeP2) {
    return { kind: "edge", p1: result.snappedEdgeP1, p2: result.snappedEdgeP2 };
  }

  if (mode === "face" && result.facePoints && result.faceIndices) {
    return { kind: "face", ...computeFaceBoundary(result.facePoints, result.faceIndices) };
  }

  return { kind: "none" };
}

/** Formatea una distancia (unidades de mundo, asumidas metros) para la
 *  etiqueta de una cota. */
function formatDistance(distance: number): string {
  return `${distance.toFixed(2)} m`;
}

export function createCotaTool(
  world: OBC.World,
  fragments: OBC.FragmentsManager,
  canvas: HTMLCanvasElement,
): CotaTool {
  const colorHex = `#${HIGHLIGHT_COLOR.getHexString()}`;

  // Resolución en píxeles del canvas: LineMaterial la necesita para convertir
  // el grosor deseado (en píxeles) a un ancho de pantalla real (ver el mismo
  // patrón en draw-tool.ts).
  const resolution = new THREE.Vector2();
  const liveMaterials = new Set<LineMaterial>();
  function updateResolution(): void {
    resolution.set(canvas.clientWidth || 1, canvas.clientHeight || 1);
    for (const material of liveMaterials) material.resolution.copy(resolution);
  }
  updateResolution();
  const resizeObserver = new ResizeObserver(() => updateResolution());
  resizeObserver.observe(canvas);

  const vertexPool: VertexMarker[] = [];
  const edgePool: EdgeLine[] = [];

  function createVertexMarker(): VertexMarker {
    const el = document.createElement("div");
    el.style.height = `${VERTEX_SIZE_PX}px`;
    el.style.width = `${VERTEX_SIZE_PX}px`;
    el.style.borderRadius = "50%";
    el.style.border = `${VERTEX_BORDER_PX}px solid ${colorHex}`;
    el.style.background = "white";
    el.style.pointerEvents = "none";
    const mark = new OBF.Mark(world, el);
    mark.visible = false;
    return { mark };
  }

  function createEdgeLine(): EdgeLine {
    const material = new LineMaterial({
      color: HIGHLIGHT_COLOR.getHex(),
      linewidth: EDGE_LINE_WIDTH_PX,
      transparent: true,
      depthTest: false,
    });
    material.resolution.copy(resolution);
    liveMaterials.add(material);
    const line = new Line2(new LineGeometry(), material);
    line.renderOrder = 4;
    line.frustumCulled = false;
    line.visible = false;
    world.scene.three.add(line);
    return { line, material };
  }

  function createFilledVertexElement(): HTMLElement {
    const el = document.createElement("div");
    el.style.height = `${DIMENSION_VERTEX_SIZE_PX}px`;
    el.style.width = `${DIMENSION_VERTEX_SIZE_PX}px`;
    el.style.borderRadius = "50%";
    el.style.background = colorHex;
    el.style.border = "2px solid white";
    el.style.pointerEvents = "none";
    return el;
  }

  function createLabelElement(): HTMLElement {
    const el = document.createElement("div");
    el.style.backgroundColor = colorHex;
    el.style.color = "white";
    el.style.padding = "4px 6px";
    el.style.borderRadius = "4px";
    el.style.fontSize = "11px";
    el.style.fontWeight = "600";
    el.style.whiteSpace = "nowrap";
    el.style.pointerEvents = "none";
    el.style.boxShadow = "0px 2px 4px rgba(0, 0, 0, 0.5)";
    return el;
  }

  function getVertexMarker(i: number): VertexMarker {
    let marker = vertexPool[i];
    if (!marker) {
      marker = createVertexMarker();
      vertexPool[i] = marker;
    }
    return marker;
  }

  function getEdgeLine(i: number): EdgeLine {
    let edge = edgePool[i];
    if (!edge) {
      edge = createEdgeLine();
      edgePool[i] = edge;
    }
    return edge;
  }

  function showVertices(points: THREE.Vector3[]): void {
    points.forEach((point, i) => {
      const marker = getVertexMarker(i);
      marker.mark.three.position.copy(point);
      marker.mark.visible = true;
    });
    for (let i = points.length; i < vertexPool.length; i++) vertexPool[i].mark.visible = false;
  }

  function showEdges(segments: [THREE.Vector3, THREE.Vector3][]): void {
    segments.forEach((segment, i) => {
      const edge = getEdgeLine(i);
      edge.line.geometry.setFromPoints(segment);
      edge.line.computeLineDistances();
      edge.line.visible = true;
    });
    for (let i = segments.length; i < edgePool.length; i++) edgePool[i].line.visible = false;
  }

  function hide(): void {
    for (const marker of vertexPool) marker.mark.visible = false;
    for (const edge of edgePool) edge.line.visible = false;
  }

  // — Cotas ya creadas (permanentes) —
  const list = new Map<string, CotaItem>();
  const onItemAdded = new OBC.Event<CotaItem>();
  const onItemDeleted = new OBC.Event<string>();
  let cotaCounter = 0;

  function createCota(start: THREE.Vector3, end: THREE.Vector3): CotaItem {
    const startMark = new OBF.Mark(world, createFilledVertexElement());
    const endMark   = new OBF.Mark(world, createFilledVertexElement());
    startMark.three.position.copy(start);
    endMark.three.position.copy(end);

    const labelMark = new OBF.Mark(world, createLabelElement());
    labelMark.three.position.copy(start.clone().add(end).multiplyScalar(0.5));
    labelMark.three.element.textContent = formatDistance(start.distanceTo(end));

    const material = new LineMaterial({
      color: HIGHLIGHT_COLOR.getHex(),
      linewidth: DIMENSION_LINE_WIDTH_PX,
    });
    material.resolution.copy(resolution);
    liveMaterials.add(material);
    const shaft = new Line2(new LineGeometry(), material);
    shaft.geometry.setFromPoints([start, end]);
    shaft.computeLineDistances();
    shaft.renderOrder = 3;
    shaft.frustumCulled = false;
    world.scene.three.add(shaft);

    cotaCounter += 1;
    const id = `cota-${Date.now()}-${cotaCounter}`;
    const item = new CotaItem({
      id, start: start.clone(), end: end.clone(),
      startMark, endMark, labelMark, shaft, shaftMaterial: material,
    });
    list.set(id, item);
    onItemAdded.trigger(item);
    return item;
  }

  function deleteCota(id: string): void {
    const item = list.get(id);
    if (!item) return;
    item.dispose();
    list.delete(id);
    onItemDeleted.trigger(id);
  }

  // — Colocación en curso: primer click ya fijado, esperando el segundo —
  let pendingStart: THREE.Vector3 | null = null;
  let startPreviewMarker: VertexMarker | null = null;
  let previewLine: EdgeLine | null = null;

  function updatePendingPreview(): void {
    if (!pendingStart) {
      if (startPreviewMarker) startPreviewMarker.mark.visible = false;
      if (previewLine) previewLine.line.visible = false;
      return;
    }

    if (!startPreviewMarker) startPreviewMarker = { mark: new OBF.Mark(world, createFilledVertexElement()) };
    startPreviewMarker.mark.three.position.copy(pendingStart);
    startPreviewMarker.mark.visible = true;

    const target = currentState.kind === "vertex" ? currentState.point : null;
    if (target) {
      if (!previewLine) previewLine = createEdgeLine();
      previewLine.line.geometry.setFromPoints([pendingStart, target]);
      previewLine.line.computeLineDistances();
      previewLine.line.visible = true;
    } else if (previewLine) {
      previewLine.line.visible = false;
    }
  }

  function applyState(state: SnapState): void {
    if (state.kind === "vertex") {
      showEdges([]);
      showVertices([state.point]);
    } else if (state.kind === "edge") {
      showEdges([[state.p1, state.p2]]);
      showVertices([state.p1, state.p2]);
    } else if (state.kind === "face") {
      showEdges(state.segments);
      showVertices(state.vertices);
    } else {
      hide();
    }
  }

  let active = false;
  let snapMode: CotaSnapMode = "vertex";
  let hoverInFlight = false;
  let pendingEvent: PointerEvent | null = null;
  /** Estado del snap vigente bajo el cursor, leído de forma síncrona al
   *  hacer click — se recalcula en cada hover, en background. */
  let currentState: SnapState = { kind: "none" };

  async function flushHover(): Promise<void> {
    const event = pendingEvent;
    pendingEvent = null;
    if (!event) return;

    hoverInFlight = true;
    let result: FRAGS.RaycastResult | undefined;
    try {
      result = await fragments.raycast({
        camera: world.camera.three,
        mouse: new THREE.Vector2(event.clientX, event.clientY),
        dom: canvas,
        snappingClasses: [SNAP_CLASS_FOR_MODE[snapMode]],
      });
    } catch (error) {
      console.error("Error al raycastear el modelo para el hover de la cota:", error);
      result = undefined;
    }
    hoverInFlight = false;

    if (!active) {
      currentState = { kind: "none" };
      hide();
    } else {
      currentState = deriveSnapState(result, snapMode);
      applyState(currentState);
      updatePendingPreview();
    }

    if (pendingEvent) void flushHover();
  }

  function onPointerMove(event: PointerEvent): void {
    if (!active) return;
    pendingEvent = event;
    if (!hoverInFlight) void flushHover();
  }

  function onPointerLeave(): void {
    pendingEvent = null;
    currentState = { kind: "none" };
    hide();
    updatePendingPreview();
  }

  function onPointerDown(event: PointerEvent): void {
    if (!active || event.button !== 0) return;

    // Mismo truco que usaba la herramienta anterior: camera-controls ya
    // registró este pointerdown y solo aplica la rotación en los próximos
    // pointermove (releyendo `enabled` en cada uno), así que deshabilitarlo
    // acá alcanza para que este click puntual no orbite la cámara.
    const disableOrbitForThisClick = (): void => {
      const camera = world.camera as OBC.OrthoPerspectiveCamera;
      camera.setUserInput(false);
      window.addEventListener("pointerup", () => camera.setUserInput(true), { once: true });
    };

    // Modo "borde": el hover ya resalta el borde entero, así que un único
    // click lo mide de punta a punta usando sus extremos reales — el punto
    // continuo del raycast (donde apunta el cursor a lo largo del borde)
    // crearía la cota en un punto intermedio cualquiera en vez del borde
    // resaltado completo.
    if (currentState.kind === "edge") {
      const { p1, p2 } = currentState;
      disableOrbitForThisClick();
      createCota(p1.clone(), p2.clone());
      return;
    }

    // Modo "superficie": el hover resalta todo el perímetro de la cara, así
    // que un único click crea una cota por cada borde de ese perímetro.
    if (currentState.kind === "face") {
      disableOrbitForThisClick();
      for (const [a, b] of currentState.segments) createCota(a.clone(), b.clone());
      return;
    }

    // Modo "vértice": requiere dos clicks, uno por extremo de la cota.
    if (currentState.kind !== "vertex") return;
    const point = currentState.point.clone();
    disableOrbitForThisClick();

    if (!pendingStart) {
      pendingStart = point;
    } else {
      createCota(pendingStart, point);
      pendingStart = null;
    }
    updatePendingPreview();
  }

  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerleave", onPointerLeave);
  canvas.addEventListener("pointerdown", onPointerDown);

  function activate(): void {
    active = true;
  }

  function deactivate(): void {
    active = false;
    pendingEvent = null;
    pendingStart = null;
    currentState = { kind: "none" };
    hide();
    updatePendingPreview();
  }

  function setSnapMode(mode: CotaSnapMode): void {
    if (snapMode === mode) return;
    snapMode = mode;
    pendingEvent = null;
    pendingStart = null;
    currentState = { kind: "none" };
    hide();
    updatePendingPreview();
  }

  return {
    get active() { return active; },
    activate,
    deactivate,
    getSnapMode: () => snapMode,
    setSnapMode,
    list,
    onItemAdded,
    onItemDeleted,
    deleteCota,
    addCota: createCota,
  };
}
