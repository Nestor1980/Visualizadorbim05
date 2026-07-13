import * as THREE from "three";
import * as OBC from "@thatopen/components";
import * as OBF from "@thatopen/components-front";
import { Line2 } from "three/addons/lines/Line2.js";
import { LineGeometry } from "three/addons/lines/LineGeometry.js";
import { LineMaterial } from "three/addons/lines/LineMaterial.js";

export interface DrawStroke {
  id: string;
  color: string;
  width: number;
  points: THREE.Vector3[];
  line: Line2;
  /** Posición y target de la cámara al momento de dibujar este trazo (ver `focus`). */
  cameraPosition: THREE.Vector3;
  cameraTarget: THREE.Vector3;
}

export interface DrawTool {
  list: Map<string, DrawStroke>;
  onItemAdded: OBC.Event<DrawStroke>;
  onItemDeleted: OBC.Event<string>;
  onSelectionChange: OBC.Event<DrawStroke | null>;
  readonly active: boolean;
  /** Marca el modo dibujo como activo. Llamar al entrar al modo "draw". */
  activate: () => void;
  /** Descarta el trazo a medio dibujar (si lo hay). Llamar al salir del modo "draw". */
  deactivate: () => void;
  setActiveColor: (color: string) => void;
  getActiveColor: () => string;
  /** Grosor en píxeles de pantalla (constante sin importar el zoom); también recolorea el trazo seleccionado. */
  setActiveWidth: (width: number) => void;
  getActiveWidth: () => number;
  select: (id: string) => void;
  deselect: () => void;
  getSelected: () => DrawStroke | null;
  deleteStroke: (id: string) => void;
  deleteSelected: () => void;
  /** Devuelve el id del trazo bajo el cursor, o `null` si no hay ninguno cerca. */
  pickStrokeAt: (clientX: number, clientY: number) => string | null;
  beginStroke: (clientX: number, clientY: number) => void;
  extendStroke: (clientX: number, clientY: number) => void;
  endStroke: () => void;
  /** Recrea un trazo ya terminado a partir de sus puntos finales (sin pasar por
   *  el flujo interactivo begin/extend/end) — usada al restaurar un proyecto guardado. */
  addStroke: (data: {
    color: string;
    width: number;
    points: THREE.Vector3[];
    cameraPosition: THREE.Vector3;
    cameraTarget: THREE.Vector3;
  }) => DrawStroke;
  /** Anima la cámara de vuelta a como estaba parada cuando se dibujó este trazo. */
  focus: (id: string) => void;
}

const DEFAULT_COLOR = "#74ac49";
const DEFAULT_WIDTH = 3;

/** Distancia mínima (unidades de mundo) entre puntos crudos consecutivos: evita
 *  acumular miles de muestras casi idénticas en un pointermove de alta frecuencia. */
const MIN_POINT_DISTANCE = 0.01;

/** Suavizado exponencial aplicado a cada punto entrante contra el último punto
 *  suavizado (0 = sin suavizar, cerca de 1 = casi congelado). Reduce el temblor
 *  del trazo a mano alzada antes de interpolar la curva final. */
const SMOOTHING_ALPHA = 0.35;

/** Subdivisiones por segmento al construir la curva Catmull-Rom final, para que
 *  el trazo se vea como una línea suave en vez de segmentos rectos entre muestras. */
const CURVE_SEGMENTS = 8;

/** Por encima de cualquier geometría del modelo: depthTest desactivado en el
 *  material (ver createLine) + renderOrder alto para ganarle a otros overlays
 *  con depthTest off (p. ej. el relleno de secciones). */
const RENDER_ORDER = 100;

/** Line2 necesita al menos 2 vértices (6 floats); un trazo de un solo punto se
 *  representa como un segmento de longitud cero hasta que se agregue el segundo. */
function buildCurvePositions(points: THREE.Vector3[]): number[] {
  if (points.length === 0) return [];
  if (points.length === 1) {
    const p = points[0];
    return [p.x, p.y, p.z, p.x, p.y, p.z];
  }
  const curve = new THREE.CatmullRomCurve3(points, false, "catmullrom", 0.5);
  const samples = Math.max(points.length * CURVE_SEGMENTS, 2);
  const flat: number[] = [];
  for (const p of curve.getPoints(samples)) flat.push(p.x, p.y, p.z);
  return flat;
}

export function createDrawTool(world: OBC.World, canvas: HTMLCanvasElement): DrawTool {
  const list = new Map<string, DrawStroke>();
  const onItemAdded       = new OBC.Event<DrawStroke>();
  const onItemDeleted     = new OBC.Event<string>();
  const onSelectionChange = new OBC.Event<DrawStroke | null>();

  let strokeCounter = 0;
  let selectedId: string | null = null;
  let activeColor = DEFAULT_COLOR;
  let activeWidth = DEFAULT_WIDTH;
  let active = false;

  const raycaster = new THREE.Raycaster();

  // Los trazos viven en una escena aparte, nunca en world.scene.three: si
  // pasaran por el compositor de postproducción (pases de borde/tinta "Pen"),
  // la silueta de alto contraste de una línea fina les dispara un contorno
  // blanco espurio alrededor (y habilitar ExcludedObjectsPass para evitarlo
  // rompe el resto del render). En cambio, se dibujan a mano en un segundo
  // `renderer.render()` después de cada actualización de postproducción,
  // directo sobre el canvas ya compuesto — así quedan siempre por encima de
  // cualquier geometría del modelo y no pasan por ningún post-efecto.
  const strokesScene = new THREE.Scene();
  const strokesGroup = new THREE.Group();
  strokesGroup.name = "DrawStrokesGroup";
  strokesScene.add(strokesGroup);

  const renderer = world.renderer as OBF.PostproductionRenderer | undefined;
  renderer?.onAfterUpdate.add(() => {
    const three = renderer.three;
    const prevAutoClear = three.autoClear;
    three.autoClear = false;
    three.clearDepth();
    three.render(strokesScene, world.camera.three);
    three.autoClear = prevAutoClear;
  });

  // Resolución en píxeles del canvas: LineMaterial la necesita para convertir
  // el grosor deseado (en píxeles) a un ancho de pantalla real. Cada material
  // vivo se registra acá para poder actualizarlo si el canvas cambia de tamaño.
  const resolution = new THREE.Vector2();
  const liveMaterials = new Set<LineMaterial>();

  function updateResolution(): void {
    resolution.set(canvas.clientWidth || 1, canvas.clientHeight || 1);
    for (const material of liveMaterials) material.resolution.copy(resolution);
  }
  updateResolution();
  const resizeObserver = new ResizeObserver(() => updateResolution());
  resizeObserver.observe(canvas);

  /** Plano perpendicular a la dirección de cámara actual, pasando por el origen
   *  del mundo — cada trazo calcula el suyo propio al empezar (ver beginStroke),
   *  así que dos trazos dibujados desde ángulos de cámara distintos quedan cada
   *  uno en su propio plano. */
  function computeCameraPlane(): THREE.Plane {
    const direction = new THREE.Vector3();
    world.camera.three.getWorldDirection(direction);
    return new THREE.Plane().setFromNormalAndCoplanarPoint(direction, new THREE.Vector3(0, 0, 0));
  }

  function pointToNdc(clientX: number, clientY: number): THREE.Vector2 {
    const rect = canvas.getBoundingClientRect();
    return new THREE.Vector2(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1,
    );
  }

  function planePointFromEvent(clientX: number, clientY: number, plane: THREE.Plane): THREE.Vector3 | null {
    raycaster.setFromCamera(pointToNdc(clientX, clientY), world.camera.three);
    const target = new THREE.Vector3();
    return raycaster.ray.intersectPlane(plane, target) ? target : null;
  }

  function focus(id: string): void {
    const stroke = list.get(id);
    if (!stroke) return;
    const { cameraPosition: p, cameraTarget: t } = stroke;
    const camera = world.camera as OBC.OrthoPerspectiveCamera;
    camera.controls.setLookAt(p.x, p.y, p.z, t.x, t.y, t.z, true);
  }

  function createLine(color: string, width: number): Line2 {
    const material = new LineMaterial({
      color: new THREE.Color(color).getHex(),
      linewidth: width,
      transparent: true,
      depthTest: false,
      depthWrite: false,
    });
    material.resolution.copy(resolution);
    liveMaterials.add(material);
    const line = new Line2(new LineGeometry(), material);
    line.renderOrder   = RENDER_ORDER;
    line.frustumCulled = false;
    return line;
  }

  function disposeLine(line: Line2): void {
    strokesGroup.remove(line);
    line.geometry.dispose();
    const material = line.material as LineMaterial;
    liveMaterials.delete(material);
    material.dispose();
  }

  function setLinePositions(line: Line2, points: THREE.Vector3[]): void {
    const positions = buildCurvePositions(points);
    if (positions.length < 6) return;
    const oldGeometry = line.geometry;
    const newGeometry = new LineGeometry();
    newGeometry.setPositions(positions);
    line.geometry = newGeometry;
    oldGeometry.dispose();
    line.computeLineDistances();
  }

  function select(id: string): void {
    if (selectedId === id) return;
    selectedId = id;
    onSelectionChange.trigger(list.get(id) ?? null);
  }

  function deselect(): void {
    if (!selectedId) return;
    selectedId = null;
    onSelectionChange.trigger(null);
  }

  function getSelected(): DrawStroke | null {
    return selectedId ? list.get(selectedId) ?? null : null;
  }

  function setActiveColor(color: string): void {
    activeColor = color;
    if (!selectedId) return;
    const stroke = list.get(selectedId);
    if (!stroke) return;
    stroke.color = color;
    (stroke.line.material as LineMaterial).color.set(color);
  }

  function getActiveColor(): string {
    return activeColor;
  }

  function setActiveWidth(width: number): void {
    activeWidth = width;
    if (!selectedId) return;
    const stroke = list.get(selectedId);
    if (!stroke) return;
    stroke.width = width;
    (stroke.line.material as LineMaterial).linewidth = width;
  }

  function getActiveWidth(): number {
    return activeWidth;
  }

  function deleteStroke(id: string): void {
    const stroke = list.get(id);
    if (!stroke) return;
    if (selectedId === id) {
      selectedId = null;
      onSelectionChange.trigger(null);
    }
    disposeLine(stroke.line);
    list.delete(id);
    onItemDeleted.trigger(id);
  }

  function deleteSelected(): void {
    if (selectedId) deleteStroke(selectedId);
  }

  function pickStrokeAt(clientX: number, clientY: number): string | null {
    raycaster.setFromCamera(pointToNdc(clientX, clientY), world.camera.three);
    const lines = Array.from(list.values()).map((s) => s.line);
    const hit = raycaster.intersectObjects(lines, false)[0];
    if (!hit) return null;
    for (const [id, stroke] of list) if (stroke.line === hit.object) return id;
    return null;
  }

  // ─── Trazo en progreso ────────────────────────────────────────────────────
  let rawPoints: THREE.Vector3[] = [];
  let smoothedPoints: THREE.Vector3[] = [];
  let currentLine: Line2 | null = null;
  let currentPlane: THREE.Plane | null = null;
  let currentCameraPosition: THREE.Vector3 | null = null;
  let currentCameraTarget: THREE.Vector3 | null = null;

  function abortCurrentStroke(): void {
    if (currentLine) disposeLine(currentLine);
    currentLine           = null;
    currentPlane          = null;
    currentCameraPosition = null;
    currentCameraTarget   = null;
    rawPoints      = [];
    smoothedPoints = [];
  }

  function activate(): void {
    active = true;
  }

  function deactivate(): void {
    active = false;
    abortCurrentStroke();
  }

  function beginStroke(clientX: number, clientY: number): void {
    if (!active) return;
    const plane = computeCameraPlane();
    const point = planePointFromEvent(clientX, clientY, plane);
    if (!point) return;
    const camera = world.camera as OBC.OrthoPerspectiveCamera;
    currentPlane          = plane;
    currentCameraPosition = camera.controls.getPosition(new THREE.Vector3());
    currentCameraTarget   = camera.controls.getTarget(new THREE.Vector3());
    rawPoints      = [point];
    smoothedPoints = [point.clone()];
    currentLine = createLine(activeColor, activeWidth);
    strokesGroup.add(currentLine);
    setLinePositions(currentLine, smoothedPoints);
  }

  function extendStroke(clientX: number, clientY: number): void {
    if (!active || !currentLine || !currentPlane) return;
    const point = planePointFromEvent(clientX, clientY, currentPlane);
    if (!point) return;
    const last = rawPoints[rawPoints.length - 1];
    if (last && last.distanceTo(point) < MIN_POINT_DISTANCE) return;
    rawPoints.push(point);

    const lastSmoothed = smoothedPoints[smoothedPoints.length - 1];
    smoothedPoints.push(lastSmoothed.clone().lerp(point, 1 - SMOOTHING_ALPHA));

    setLinePositions(currentLine, smoothedPoints);
  }

  function endStroke(): void {
    if (!currentLine || !currentCameraPosition || !currentCameraTarget) return;
    if (smoothedPoints.length < 2) {
      abortCurrentStroke();
      return;
    }
    strokeCounter += 1;
    const id = `stroke-${Date.now()}-${strokeCounter}`;
    const stroke: DrawStroke = {
      id, color: activeColor, width: activeWidth, points: smoothedPoints.slice(), line: currentLine,
      cameraPosition: currentCameraPosition, cameraTarget: currentCameraTarget,
    };
    list.set(id, stroke);
    currentLine            = null;
    currentPlane           = null;
    currentCameraPosition  = null;
    currentCameraTarget    = null;
    rawPoints      = [];
    smoothedPoints = [];
    onItemAdded.trigger(stroke);
  }

  function addStroke(data: {
    color: string;
    width: number;
    points: THREE.Vector3[];
    cameraPosition: THREE.Vector3;
    cameraTarget: THREE.Vector3;
  }): DrawStroke {
    strokeCounter += 1;
    const id = `stroke-${Date.now()}-${strokeCounter}`;
    const line = createLine(data.color, data.width);
    strokesGroup.add(line);
    setLinePositions(line, data.points);
    const stroke: DrawStroke = {
      id, color: data.color, width: data.width, points: data.points.slice(), line,
      cameraPosition: data.cameraPosition.clone(), cameraTarget: data.cameraTarget.clone(),
    };
    list.set(id, stroke);
    onItemAdded.trigger(stroke);
    return stroke;
  }

  return {
    list, onItemAdded, onItemDeleted, onSelectionChange,
    get active() { return active; },
    activate, deactivate,
    setActiveColor, getActiveColor,
    setActiveWidth, getActiveWidth,
    select, deselect, getSelected, deleteStroke, deleteSelected,
    pickStrokeAt, beginStroke, extendStroke, endStroke, addStroke, focus,
  };
}
