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

  setupCotas(measurer, world);
  setupVertexPickerRulerIcon(measurer);
  setupHoverShiftDebugLog(world); // TEMP — quitar una vez diagnosticado el desplazamiento en hover

  return measurer;
}

/** TEMP DEBUG — instrumentación para diagnosticar el desplazamiento de
 *  círculos/etiquetas durante el hover. La primera versión (tamaño de
 *  canvas/CSS2DRenderer + transform del primer círculo) descartó un
 *  desajuste de tamaño (siempre coinciden) y el primer círculo nunca
 *  cambió — así que ahora trackea el `transform` de CADA marca (inicio, fin,
 *  etiqueta) de CADA cota, para encontrar cuál es la que realmente se mueve.
 *  Borrar esta función y su llamada una vez encontrada la causa. */
function setupHoverShiftDebugLog(world: OBC.World): void {
  const prevTransforms = new Map<string, string>();

  world.renderer?.onBeforeUpdate.add(() => {
    let i = 0;
    for (const cota of cotas.values()) {
      i++;
      const marks: [string, OBF.Mark][] = [
        ["start", cota.startMark],
        ["end", cota.endMark],
        ["label", cota.label],
      ];
      for (const [name, mark] of marks) {
        const key = `cota${i}-${name}`;
        const transform = mark.three.element.style.transform;
        if (transform !== prevTransforms.get(key)) {
          console.log(`[measure-debug] t=${performance.now().toFixed(0)} ${key} transform="${transform}"`);
          prevTransforms.set(key, transform);
        }
      }
    }
  });
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

/** Mismo estilo que usa la librería para la etiqueta de una cota (ver
 *  `ma()` interno de `@thatopen/components-front`), reproducido acá porque
 *  la etiqueta propia de la librería queda oculta (ver {@link Cota}). */
function createLabelElement(colorHex: string): HTMLElement {
  const el = document.createElement("div");
  el.style.backgroundColor = colorHex;
  el.style.color           = "white";
  el.style.padding         = "6px";
  el.style.borderRadius    = "6px";
  el.style.boxShadow       = "0px 4px 6px rgba(0, 0, 0, 0.6)";
  el.style.zIndex          = "-10";
  return el;
}

/** Elemento invisible usado para apagar los círculos de vértice propios de
 *  la librería (ver {@link Cota}); `dim.endpointElement` clona este mismo
 *  nodo para el segundo extremo, así que el `display:none` alcanza para
 *  ambos. */
function createHiddenElement(): HTMLElement {
  const el = document.createElement("div");
  el.style.display = "none";
  return el;
}

function createArrowHead(color: THREE.Color): THREE.Mesh {
  const geometry = new THREE.ConeGeometry(1, 1, 9);
  geometry.translate(0, -0.5, 0); // la punta queda en el origen local
  const material = new THREE.MeshBasicMaterial({ color, depthTest: false });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.renderOrder = 3;
  return mesh;
}

function createShaft(color: THREE.Color): { shaft: Line2; material: LineMaterial } {
  const material = new LineMaterial({ color: color.getHex(), linewidth: DIMENSION_LINE_WIDTH_PX });
  const shaft = new Line2(new LineGeometry(), material);
  shaft.renderOrder = 1;
  return { shaft, material };
}

function createLeader(color: THREE.Color): { leader: Line2; material: LineMaterial } {
  const material = new LineMaterial({
    color: color.getHex(),
    linewidth: 1.5,
    dashed: true,
    dashSize: LEADER_DASH_SIZE,
    gapSize: LEADER_GAP_SIZE,
  });
  const leader = new Line2(new LineGeometry(), material);
  leader.renderOrder = 1;
  leader.visible = false;
  return { leader, material };
}

const UP = new THREE.Vector3(0, 1, 0);
function orient(mesh: THREE.Mesh, tip: THREE.Vector3, outward: THREE.Vector3, length: number): void {
  mesh.position.copy(tip);
  mesh.quaternion.setFromUnitVectors(UP, outward);
  const radius = length * 0.35;
  mesh.scale.set(radius, length, radius);
}
const arrowDirection = new THREE.Vector3();


/**
 * Representación visual propia de una cota ya fijada: círculos de vértice,
 * etiqueta arrastrable, línea gruesa y flechas de doble punta. Se apoya en
 * el `OBF.DimensionLine` de la librería solo para los datos (`dim.line`,
 * `boundingBox`, formato de valor/unidades) — su propia representación
 * visual (línea fina, círculos de vértice, etiqueta) queda oculta en el
 * constructor y jamás se usa para dibujar nada.
 *
 * Motivo: los círculos de vértice de la librería (`DimensionLine._endpoints`,
 * privado, gestionado internamente por el picker de vértices) podían
 * quedar visualmente separados del vértice real durante el hover — sin
 * poder aislar la causa exacta dentro del bundle minificado de
 * `@thatopen/components-front`. Al posicionar nosotros mismos los círculos
 * y la etiqueta, directamente desde `dim.line.start/end` (la misma fuente
 * que ya usan la flecha y la línea, y que nunca cambia para una cota ya
 * fijada), ningún código ajeno tiene una referencia a estos objetos para
 * desplazarlos.
 *
 * Todas las mallas/objetos propios se parentean al mismo grupo (`_root`) que
 * ya usa la cota de la librería, pero eso NO alcanza para que se limpien
 * solos: `DimensionLine.dispose()` remueve `_root` de la escena con
 * `removeFromParent()` (un único `Object3D.remove`, sin recorrer hijos) y
 * solo saca explícitamente del DOM a SUS propios elementos conocidos (label,
 * endpoints) — cualquier otro hijo que le hayamos agregado a `_root` queda
 * huérfano ahí adentro, y si es un `CSS2DObject` (nuestros círculos y
 * etiqueta) su `<div>` nunca recibe el evento `removed` que lo saca del DOM.
 * Por eso {@link Cota.dispose} es obligatorio y hay que llamarlo nosotros.
 */
class Cota {
  readonly dim: OBF.DimensionLine;
  readonly startMark: OBF.Mark;
  readonly endMark: OBF.Mark;
  readonly label: OBF.Mark;
  readonly shaft: Line2;
  readonly shaftMaterial: LineMaterial;
  readonly arrowStart: THREE.Mesh;
  readonly arrowEnd: THREE.Mesh;
  readonly leader: Line2;
  readonly leaderMaterial: LineMaterial;
  private readonly world: OBC.World;
  private readonly labelAnchor = new THREE.Vector3();

  constructor(dim: OBF.DimensionLine, world: OBC.World, color: THREE.Color) {
    this.dim = dim;
    this.world = world;

    // La cota de la librería sigue calculando geometría/valor/bounding box,
    // pero su representación visual queda apagada: dibujamos la nuestra.
    dim.lineElement.visible = false;
    dim.endpointElement = createHiddenElement();
    dim.label.visible = false;

    const colorHex = `#${color.getHexString()}`;
    const parent = dim.lineElement.parent ?? world.scene.three;

    this.startMark = new OBF.Mark(world, createVertexCircleElement(colorHex), parent);
    this.endMark   = new OBF.Mark(world, createVertexCircleElement(colorHex), parent);
    this.label     = new OBF.Mark(world, createLabelElement(colorHex), parent);

    const { shaft, material: shaftMaterial } = createShaft(color);
    const { leader, material: leaderMaterial } = createLeader(color);
    this.shaft = shaft;
    this.shaftMaterial = shaftMaterial;
    this.leader = leader;
    this.leaderMaterial = leaderMaterial;
    this.arrowStart = createArrowHead(color);
    this.arrowEnd   = createArrowHead(color);
    parent.add(shaft, leader, this.arrowStart, this.arrowEnd);

    dim.line.getCenter(this.labelAnchor);
    this.label.three.position.copy(this.labelAnchor);
    this.refreshLabelText();

    this.updateGeometry();
    this.setupLabelDrag();
  }

  /** Reposiciona círculos, flechas y línea desde `dim.line.start/end`. La
   *  etiqueta no se toca acá: su posición solo cambia por arrastre. */
  updateGeometry(): void {
    const { start, end } = this.dim.line;
    this.startMark.three.position.copy(start);
    this.endMark.three.position.copy(end);
    this.shaft.geometry.setFromPoints([start, end]);
    this.shaft.computeLineDistances();

    arrowDirection.subVectors(end, start);
    const distance = arrowDirection.length();
    if (distance < 1e-6) {
      this.arrowStart.visible = false;
      this.arrowEnd.visible = false;
      return;
    }
    arrowDirection.normalize();
    // Tope en cotas muy cortas para que las dos puntas no se superpongan.
    const length = Math.min(ARROW_HEAD_LENGTH, distance * 0.45);
    this.arrowStart.visible = true;
    this.arrowEnd.visible = true;
    orient(this.arrowStart, start, arrowDirection.clone().negate(), length);
    orient(this.arrowEnd, end, arrowDirection, length);
  }

  /** Refresca el texto (valor + unidad) reusando el formato de la librería
   *  vía la etiqueta oculta de `dim`, y lo copia a la nuestra. */
  refreshLabelText(): void {
    this.dim.updateLabel();
    this.label.three.element.textContent = this.dim.label.three.element.textContent;
  }

  setColor(color: THREE.Color): void {
    const hex = `#${color.getHexString()}`;
    this.startMark.three.element.style.borderColor = hex;
    this.endMark.three.element.style.borderColor = hex;
    this.label.three.element.style.backgroundColor = hex;
    (this.arrowStart.material as THREE.MeshBasicMaterial).color.copy(color);
    (this.arrowEnd.material as THREE.MeshBasicMaterial).color.copy(color);
    this.shaftMaterial.color.copy(color);
    this.leaderMaterial.color.copy(color);
  }

  setSelected(selected: boolean, baseColor: THREE.Color): void {
    this.dim.isSelected = selected;
    this.setColor(selected ? SELECTION_HIGHLIGHT_COLOR : baseColor);
    this.shaftMaterial.linewidth = selected ? DIMENSION_LINE_WIDTH_PX + 2 : DIMENSION_LINE_WIDTH_PX;
  }

  setVisible(visible: boolean): void {
    this.startMark.visible = visible;
    this.endMark.visible = visible;
    this.label.visible = visible;
    this.shaft.visible = visible;
    this.arrowStart.visible = visible;
    this.arrowEnd.visible = visible;
    if (!visible) this.leader.visible = false;
  }

  /** `Mark.dispose()` ya hace `removeFromParent()` + `element.remove()`
   *  (ver librería), así que es la única forma confiable de sacar del DOM
   *  los círculos/etiqueta — dejar que `DimensionLine.dispose()` se ocupe
   *  de esto, como se hacía antes, deja los `<div>` huérfanos en pantalla. */
  dispose(): void {
    this.startMark.dispose();
    this.endMark.dispose();
    this.label.dispose();

    this.shaft.removeFromParent();
    this.shaft.geometry.dispose();
    this.shaftMaterial.dispose();
    this.leader.removeFromParent();
    this.leader.geometry.dispose();
    this.leaderMaterial.dispose();
    this.arrowStart.removeFromParent();
    this.arrowStart.geometry.dispose();
    (this.arrowStart.material as THREE.Material).dispose();
    this.arrowEnd.removeFromParent();
    this.arrowEnd.geometry.dispose();
    (this.arrowEnd.material as THREE.Material).dispose();
  }

  /** Arrastrar la etiqueta en el plano paralelo a la cámara (a su propia
   *  profundidad). Al alejarse de su posición original se dibuja una línea
   *  punteada uniéndola con el punto medio de la cota. */
  private setupLabelDrag(): void {
    const el = this.label.three.element;
    el.style.pointerEvents = "auto";
    el.style.cursor = "grab";

    const plane = new THREE.Plane();
    const raycaster = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    const cameraDirection = new THREE.Vector3();
    const target = new THREE.Vector3();
    let dragging = false;

    const updateLeader = (): void => {
      const pos = this.label.three.position;
      if (this.labelAnchor.distanceTo(pos) < LEADER_MIN_DISTANCE) {
        this.leader.visible = false;
        return;
      }
      this.leader.visible = true;
      this.leader.geometry.setFromPoints([this.labelAnchor, pos]);
      this.leader.computeLineDistances();
    };

    const pickOnPlane = (event: PointerEvent): boolean => {
      if (!this.world.renderer) return false;
      const rect = this.world.renderer.three.domElement.getBoundingClientRect();
      ndc.set(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        -((event.clientY - rect.top) / rect.height) * 2 + 1,
      );
      raycaster.setFromCamera(ndc, this.world.camera.three);
      return raycaster.ray.intersectPlane(plane, target) !== null;
    };

    el.addEventListener("pointerdown", (event: PointerEvent) => {
      if (event.button !== 0) return;
      event.stopPropagation();
      event.preventDefault();
      dragging = true;
      el.style.cursor = "grabbing";
      el.setPointerCapture(event.pointerId);
      (this.world.camera as OBC.OrthoPerspectiveCamera).setUserInput(false);

      this.world.camera.three.getWorldDirection(cameraDirection);
      plane.setFromNormalAndCoplanarPoint(cameraDirection, this.label.three.position);
    });

    el.addEventListener("pointermove", (event: PointerEvent) => {
      if (!dragging) return;
      event.stopPropagation();
      if (pickOnPlane(event)) {
        this.label.three.position.copy(target);
        updateLeader();
      }
    });

    const endDrag = (event: PointerEvent): void => {
      if (!dragging) return;
      dragging = false;
      el.style.cursor = "grab";
      el.releasePointerCapture(event.pointerId);
      (this.world.camera as OBC.OrthoPerspectiveCamera).setUserInput(true);
    };
    el.addEventListener("pointerup", endDrag);
    el.addEventListener("pointercancel", endDrag);
  }
}

/**
 * Compartido entre `setupCotas` (que crea/destruye estas `Cota`) y
 * `setupWallOcclusion`/`setupMeasurementSelection` (que necesitan
 * ocultarlas/resaltarlas) — vive a nivel de módulo porque las tres
 * funciones se enganchan a la misma instancia de `measurer.lines` pero no
 * tienen otra forma de pasarse este estado sin cambiar la firma pública de
 * `createMeasurementTool`.
 */
const cotas = new Map<OBF.DimensionLine, Cota>();

/** Crea/destruye una {@link Cota} por cada cota fijada y mantiene su color,
 *  unidades y precisión sincronizados con el panel del medidor. */
function setupCotas(measurer: OBF.LengthMeasurement, world: OBC.World): void {
  measurer.lines.onItemAdded.add((dim) => {
    cotas.set(dim, new Cota(dim, world, measurer.linesMaterial.color));
  });

  // `DimensionLine.dispose()` no limpia los hijos que le agregamos a `_root`
  // (ver el comentario de la clase), así que hay que disponer la `Cota`
  // nosotros mismos acá, antes de soltar la referencia.
  measurer.lines.onBeforeDelete.add((dim) => {
    cotas.get(dim)?.dispose();
    cotas.delete(dim);
  });
  measurer.lines.onCleared.add(() => {
    for (const cota of cotas.values()) cota.dispose();
    cotas.clear();
  });

  measurer.onStateChanged.add((changes) => {
    if (changes.includes("color")) {
      const color = measurer.linesMaterial.color;
      for (const cota of cotas.values()) cota.setColor(color);
    }
    if (changes.includes("units") || changes.includes("rounding")) {
      for (const cota of cotas.values()) cota.refreshLabelText();
    }
  });

  // Defensivo: `dim.line.start/end` no cambia para una cota ya fijada, así
  // que en teoría alcanza con posicionar los círculos una sola vez al
  // crearlos (`Cota` ya lo hace). En la práctica, mientras el picker de
  // vértices de la librería está activo (hover con la herramienta
  // habilitada), los círculos de cotas YA FIJADAS se ven levemente
  // desplazados — sin poder aislar dentro del bundle minificado de
  // `@thatopen/components-front` qué línea exactamente les toca la
  // posición. `onBeforeUpdate` se dispara inmediatamente antes de que el
  // renderer proyecte los `CSS2DObject` a pantalla (ver `RendererWith2D`:
  // dispara `onBeforeUpdate` y a continuación, en el mismo tick, llama a
  // `three2D.render()`) — reanclarlos ahí, en cada frame, es barato (un
  // par de copias de vector por cota) y los deja siempre consistentes con
  // `dim.line`, sea lo que sea lo que los mueve mientras tanto.
  world.renderer?.onBeforeUpdate.add(() => {
    for (const cota of cotas.values()) cota.updateGeometry();
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
    cotas.get(dim)?.setSelected(isSelected, measurer.linesMaterial.color);
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
    cotas.get(dim)?.setVisible(visible);
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
