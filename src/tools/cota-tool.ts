import * as THREE from "three";
import * as OBC from "@thatopen/components";
import * as OBF from "@thatopen/components-front";
import * as FRAGS from "@thatopen/fragments";
import { Line2 } from "three/examples/jsm/lines/Line2.js";
import { LineGeometry } from "three/examples/jsm/lines/LineGeometry.js";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";

/**
 * Herramienta de cotas — reconstrucción desde cero (la anterior, en
 * `measurement-tool.ts`, queda deprecada y sin usar). Primer paso: hover
 * sobre el modelo resaltando el vértice o los bordes más cercanos al cursor,
 * como base para la futura creación de cotas por click.
 */

const HIGHLIGHT_COLOR = new THREE.Color("#00c2ff");
const EDGE_LINE_WIDTH_PX = 3;
const VERTEX_SIZE_PX = 12;
const VERTEX_BORDER_PX = 3;
/** Tope defensivo de bordes dibujados por hover de cara, para no crear un
 *  pool desmedido ante una triangulación inusualmente grande. */
const MAX_FACE_EDGES = 64;

export interface CotaTool {
  readonly active: boolean;
  activate: () => void;
  deactivate: () => void;
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

  function applyHover(result: FRAGS.RaycastResult | undefined): void {
    if (!result) {
      hide();
      return;
    }

    if (result.snappingClass === FRAGS.SnappingClass.POINT) {
      showEdges([]);
      showVertices([result.point]);
      return;
    }

    if (result.snappingClass === FRAGS.SnappingClass.LINE && result.snappedEdgeP1 && result.snappedEdgeP2) {
      showEdges([[result.snappedEdgeP1, result.snappedEdgeP2]]);
      showVertices([result.snappedEdgeP1, result.snappedEdgeP2]);
      return;
    }

    if (result.snappingClass === FRAGS.SnappingClass.FACE && result.facePoints && result.faceIndices) {
      const boundary = computeBoundaryEdges(result.faceIndices).slice(0, MAX_FACE_EDGES);
      const segments: [THREE.Vector3, THREE.Vector3][] = boundary.map(({ a, b }) => [
        faceVertex(result.facePoints!, a),
        faceVertex(result.facePoints!, b),
      ]);
      showEdges(segments);

      const uniqueIndices = new Set<number>();
      for (const { a, b } of boundary) {
        uniqueIndices.add(a);
        uniqueIndices.add(b);
      }
      showVertices([...uniqueIndices].map((idx) => faceVertex(result.facePoints!, idx)));
      return;
    }

    hide();
  }

  let active = false;
  let hoverInFlight = false;
  let pendingEvent: PointerEvent | null = null;

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
        snappingClasses: [FRAGS.SnappingClass.POINT, FRAGS.SnappingClass.LINE, FRAGS.SnappingClass.FACE],
      });
    } catch (error) {
      console.error("Error al raycastear el modelo para el hover de la cota:", error);
      result = undefined;
    }
    hoverInFlight = false;

    if (!active) {
      hide();
    } else {
      applyHover(result);
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
    hide();
  }

  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerleave", onPointerLeave);

  function activate(): void {
    active = true;
  }

  function deactivate(): void {
    active = false;
    pendingEvent = null;
    hide();
  }

  return {
    get active() { return active; },
    activate,
    deactivate,
  };
}
