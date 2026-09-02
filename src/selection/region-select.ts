import * as THREE from "three";
import * as OBC from "@thatopen/components";

export type RegionMode = "box" | "lasso";

export interface RegionResult {
  mode: RegionMode;
  /** Esquinas del rectángulo que encierra la región, en coordenadas de cliente. */
  topLeft: { x: number; y: number };
  bottomRight: { x: number; y: number };
  /** Contorno a mano alzada (coordenadas de cliente); solo para `lasso`. */
  polygon?: { x: number; y: number }[];
  /** true = solo elementos completamente dentro; false = también los que toca. */
  fullyIncluded: boolean;
}

const SVG_NS = "http://www.w3.org/2000/svg";
/** Movimiento mínimo (px) para considerar el gesto un arrastre real y no un click. */
const DRAG_THRESHOLD = 4;
/** Distancia mínima (px) entre puntos consecutivos del lazo, para no acumular miles. */
const LASSO_STEP = 3;

/**
 * Dibuja el rectángulo / contorno de selección sobre el viewport mientras el
 * usuario arrastra, y al soltar devuelve la región resultante. No toca la
 * escena 3D: el cálculo de qué elementos caen dentro lo hace
 * `selectItemsInRegion`.
 */
export class RegionSelect {
  private readonly host: HTMLElement;
  private readonly svg: SVGSVGElement;
  private readonly rect: SVGRectElement;
  private readonly poly: SVGPolygonElement;

  private mode: RegionMode = "box";
  private start = { x: 0, y: 0 };
  private current = { x: 0, y: 0 };
  private points: { x: number; y: number }[] = [];

  constructor(host: HTMLElement) {
    this.host = host;

    this.svg = document.createElementNS(SVG_NS, "svg");
    this.svg.classList.add("region-select-overlay");
    this.svg.style.display = "none";

    this.rect = document.createElementNS(SVG_NS, "rect");
    this.rect.classList.add("region-select-shape");
    this.poly = document.createElementNS(SVG_NS, "polygon");
    this.poly.classList.add("region-select-shape");

    this.svg.append(this.rect, this.poly);
    host.append(this.svg);
  }

  begin(mode: RegionMode, clientX: number, clientY: number): void {
    this.mode = mode;
    this.start = { x: clientX, y: clientY };
    this.current = { x: clientX, y: clientY };
    this.points = [{ x: clientX, y: clientY }];
    this.rect.style.display = mode === "box" ? "" : "none";
    this.poly.style.display = mode === "lasso" ? "" : "none";
    this.svg.style.display = "";
    this.draw();
  }

  update(clientX: number, clientY: number): void {
    this.current = { x: clientX, y: clientY };
    if (this.mode === "lasso") {
      const last = this.points[this.points.length - 1];
      if (Math.hypot(clientX - last.x, clientY - last.y) >= LASSO_STEP) {
        this.points.push({ x: clientX, y: clientY });
      }
    }
    this.draw();
  }

  /** Cierra el gesto. Devuelve `null` si fue demasiado corto (equivale a un click). */
  end(): RegionResult | null {
    this.svg.style.display = "none";

    const xs = this.mode === "lasso" ? this.points.map((p) => p.x) : [this.start.x, this.current.x];
    const ys = this.mode === "lasso" ? this.points.map((p) => p.y) : [this.start.y, this.current.y];
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);

    if (maxX - minX < DRAG_THRESHOLD && maxY - minY < DRAG_THRESHOLD) return null;
    if (this.mode === "lasso" && this.points.length < 3) return null;

    return {
      mode: this.mode,
      topLeft: { x: minX, y: minY },
      bottomRight: { x: maxX, y: maxY },
      polygon: this.mode === "lasso" ? this.points.slice() : undefined,
      fullyIncluded: false,
    };
  }

  cancel(): void {
    this.svg.style.display = "none";
  }

  private draw(): void {
    const rect = this.host.getBoundingClientRect();
    if (this.mode === "box") {
      this.rect.setAttribute("x", `${Math.min(this.start.x, this.current.x) - rect.left}`);
      this.rect.setAttribute("y", `${Math.min(this.start.y, this.current.y) - rect.top}`);
      this.rect.setAttribute("width", `${Math.abs(this.current.x - this.start.x)}`);
      this.rect.setAttribute("height", `${Math.abs(this.current.y - this.start.y)}`);
    } else {
      this.poly.setAttribute(
        "points",
        this.points.map((p) => `${p.x - rect.left},${p.y - rect.top}`).join(" "),
      );
    }
  }
}

/** Proyecta un punto del mundo a coordenadas de cliente (mismas que usa
 *  `model.rectangleRaycast` / los eventos de puntero). */
function worldToClient(
  point: THREE.Vector3,
  camera: THREE.Camera,
  canvas: HTMLCanvasElement,
): { x: number; y: number } {
  const ndc = point.clone().project(camera);
  const rect = canvas.getBoundingClientRect();
  return {
    x: rect.left + (ndc.x * 0.5 + 0.5) * rect.width,
    y: rect.top + (-ndc.y * 0.5 + 0.5) * rect.height,
  };
}

/** Ray casting clásico: ¿el punto está dentro del polígono? */
function pointInPolygon(p: { x: number; y: number }, poly: { x: number; y: number }[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    const intersects = a.y > p.y !== b.y > p.y
      && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x;
    if (intersects) inside = !inside;
  }
  return inside;
}

/**
 * Devuelve el `ModelIdMap` de los elementos visibles que caen dentro de la
 * región. Para `box` alcanza con el `rectangleRaycast` nativo de fragments;
 * para `lasso` se usa el rectángulo que envuelve al contorno como primer
 * filtro y después se descartan los elementos cuyo centro queda fuera del
 * polígono real.
 */
export async function selectItemsInRegion(
  region: RegionResult,
  world: OBC.World,
  fragments: OBC.FragmentsManager,
  canvas: HTMLCanvasElement,
): Promise<OBC.ModelIdMap> {
  const camera = world.camera.three as THREE.PerspectiveCamera | THREE.OrthographicCamera;
  const topLeft = new THREE.Vector2(region.topLeft.x, region.topLeft.y);
  const bottomRight = new THREE.Vector2(region.bottomRight.x, region.bottomRight.y);

  const map: OBC.ModelIdMap = {};

  for (const [modelId, model] of fragments.list) {
    let result: { localIds: number[] } | null = null;
    try {
      result = await model.rectangleRaycast({
        camera,
        dom: canvas,
        topLeft,
        bottomRight,
        fullyIncluded: region.fullyIncluded,
      });
    } catch (error) {
      console.error(`rectangleRaycast falló para el modelo ${modelId}:`, error);
      continue;
    }
    if (!result || result.localIds.length === 0) continue;

    let ids = result.localIds;

    if (region.polygon && region.polygon.length >= 3) {
      const polygon = region.polygon;
      const boxes = await model.getBoxes(ids);
      const center = new THREE.Vector3();
      ids = ids.filter((_, i) => {
        const box = boxes[i];
        if (!box) return false;
        box.getCenter(center);
        return pointInPolygon(worldToClient(center, camera, canvas), polygon);
      });
    }

    if (ids.length > 0) map[modelId] = new Set(ids);
  }

  return map;
}
