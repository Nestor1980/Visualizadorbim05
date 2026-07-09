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

export function createMeasurementTool(
  components: OBC.Components,
  world: OBC.World,
): OBF.LengthMeasurement {
  const measurer     = components.get(OBF.LengthMeasurement);
  measurer.world     = world;
  measurer.color     = new THREE.Color("#494cb6");
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

  return measurer;
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
 * Una vez fijada una cota se le agrega: círculos de vértice más grandes en
 * los extremos, una línea gruesa (del mismo color) que los conecta, una
 * flecha de doble punta sobre esa línea apuntando hacia cada vértice, y la
 * posibilidad de arrastrar la etiqueta (queda unida a la cota por una línea
 * punteada) para despejarla en cotas chicas donde el número no entra.
 */
function setupDimensionArrows(measurer: OBF.LengthMeasurement, world: OBC.World): void {
  const visuals = new Map<OBF.DimensionLine, DimensionVisuals>();

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
    visuals.set(dim, visual);

    makeLabelDraggable(dim, visual, world);
  });

  // Las mallas/línea son hijas del mismo grupo que la cota, así que
  // `DimensionLine.dispose()` ya las remueve y libera solo; acá solo hace
  // falta soltar la referencia para no filtrar memoria.
  measurer.lines.onBeforeDelete.add((dim) => visuals.delete(dim));
  measurer.lines.onCleared.add(() => visuals.clear());

  // El color de los círculos de vértice ya lo sincroniza la propia librería
  // (`DimensionLine.color`) cuando cambia `measurer.color`; acá solo hace
  // falta sincronizar las flechas y la línea gruesa, que son nuestras.
  measurer.onStateChanged.add((changes) => {
    if (!changes.includes("color")) return;
    const color = measurer.linesMaterial.color;
    for (const visual of visuals.values()) {
      (visual.arrowStart.material as THREE.MeshBasicMaterial).color.copy(color);
      (visual.arrowEnd.material as THREE.MeshBasicMaterial).color.copy(color);
      visual.shaftMaterial.color.copy(color);
      visual.leaderMaterial.color.copy(color);
    }
  });
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
 * `RaycastHit.facePoints`/`faceIndices`), crea una medición por cada arista
 * única de esa triangulación. Un borde compartido entre dos triángulos
 * adyacentes aparece dos veces en la lista de aristas por triángulo — se
 * cuenta una sola vez.
 */
export function measureFaceEdges(
  measurer: OBF.LengthMeasurement,
  facePoints: Float32Array,
  faceIndices: Uint16Array,
): void {
  const getVertex = (idx: number): THREE.Vector3 =>
    new THREE.Vector3(facePoints[idx * 3], facePoints[idx * 3 + 1], facePoints[idx * 3 + 2]);

  const seenEdges = new Set<string>();
  for (let i = 0; i < faceIndices.length; i += 3) {
    const tri = [faceIndices[i], faceIndices[i + 1], faceIndices[i + 2]];
    for (let e = 0; e < 3; e++) {
      const a = tri[e];
      const b = tri[(e + 1) % 3];
      if (a === b) continue;
      const key = a < b ? `${a}_${b}` : `${b}_${a}`;
      if (seenEdges.has(key)) continue;
      seenEdges.add(key);

      const line = new OBF.Line(getVertex(a), getVertex(b));
      line.units    = measurer.units;
      line.rounding = measurer.rounding;
      measurer.list.add(line);
    }
  }
}
