import * as THREE from "three";
import * as OBC from "@thatopen/components";
import { createAxisSnap } from "./camera-snap";

const ORBIT_SPEED    = 0.008;
const DRAG_THRESHOLD = 4;    // px antes de considerar que es un arrastre y no un click
const RADIUS_RATIO   = 34 / 90; // proporción histórica radio/tamaño del widget
const PERSPECTIVE    = 400;
const DEPTH_OFFSET   = -300; // debe coincidir con el usado por bim-view-cube

export const GIZMO_DEFAULT_SIZE = 90;

const epsilon = (v: number) => (Math.abs(v) < 1e-10 ? 0 : v);

type AxisDef = {
  cls:      string;
  ux: number; uy: number; uz: number; // dirección unitaria del eje
  label?:   string;
  goTo:     [number, number, number];
  positive: boolean;
};

const AXES: AxisDef[] = [
  { cls: "gizmo-dot-x-pos", ux:  1, uy: 0, uz: 0, label: "X", goTo: [ 1, 0, 0], positive: true  },
  { cls: "gizmo-dot-x-neg", ux: -1, uy: 0, uz: 0,             goTo: [-1, 0, 0], positive: false },
  { cls: "gizmo-dot-y-pos", ux: 0, uy:  1, uz: 0, label: "Y", goTo: [ 0, 1, 0], positive: true  },
  { cls: "gizmo-dot-y-neg", ux: 0, uy: -1, uz: 0,             goTo: [ 0,-1, 0], positive: false },
  { cls: "gizmo-dot-z-pos", ux: 0, uy: 0, uz:  1, label: "Z", goTo: [ 0, 0, 1], positive: true  },
  { cls: "gizmo-dot-z-neg", ux: 0, uy: 0, uz: -1,             goTo: [ 0, 0,-1], positive: false },
];

export function createAxisGizmo(
  world: OBC.World,
  fragments: OBC.FragmentsManager,
  initialSize = GIZMO_DEFAULT_SIZE,
): HTMLElement & { updateOrientation: () => void; setSize: (size: number) => void } {
  const goTo = createAxisSnap(world, fragments);
  const rotationMatrix = new THREE.Matrix4();
  let radius = initialSize * RADIUS_RATIO;

  const parent = document.createElement("div");
  parent.className = "axis-gizmo-parent";
  parent.style.perspective = `${PERSPECTIVE}px`;

  const inner = document.createElement("div");
  inner.className = "axis-gizmo-inner";
  parent.append(inner);

  // Líneas de los tres ejes: X/Y se extienden de forma nativa por el ancho o
  // alto de la caja (sin rotación); Z usa rotateY(90deg) para apuntar en
  // profundidad. El signo de esa rotación no afecta el resultado porque la
  // línea es simétrica respecto al centro.
  const lineX = document.createElement("div");
  lineX.className = "gizmo-line gizmo-line-x";
  const lineY = document.createElement("div");
  lineY.className = "gizmo-line gizmo-line-y";
  const lineZ = document.createElement("div");
  lineZ.className = "gizmo-line gizmo-line-z";
  inner.append(lineX, lineY, lineZ);

  const dots = AXES.map((axis) => {
    const dot = document.createElement("div");
    dot.className = `gizmo-dot ${axis.cls} ${axis.positive ? "gizmo-dot-positive" : "gizmo-dot-negative"}`;
    if (axis.label) dot.textContent = axis.label;
    dot.addEventListener("click", (e) => {
      e.stopPropagation();
      goTo(...axis.goTo);
    });
    inner.append(dot);
    return dot;
  });

  // Igual que en view-cube.ts: no capturar el puntero desde el pointerdown,
  // porque eso retargeta el "click" nativo posterior hacia `parent` en vez
  // del dot tocado, y su listener de click nunca se dispara.
  let dragPointerId: number | null = null;
  let dragging = false;
  let startX = 0;
  let startY = 0;
  let lastX = 0;
  let lastY = 0;

  parent.addEventListener("pointerdown", (e: PointerEvent) => {
    dragPointerId = e.pointerId;
    dragging = false;
    startX = lastX = e.clientX;
    startY = lastY = e.clientY;
    e.stopPropagation();
  });

  parent.addEventListener("pointermove", (e: PointerEvent) => {
    if (dragPointerId !== e.pointerId) return;
    if (!dragging) {
      if (Math.abs(e.clientX - startX) < DRAG_THRESHOLD && Math.abs(e.clientY - startY) < DRAG_THRESHOLD) return;
      dragging = true;
      parent.setPointerCapture(e.pointerId);
    }
    const dx = e.clientX - lastX;
    const dy = e.clientY - lastY;
    lastX = e.clientX;
    lastY = e.clientY;
    world.camera.controls.rotate(-dx * ORBIT_SPEED, -dy * ORBIT_SPEED, false);
    e.stopPropagation();
  });

  parent.addEventListener("pointerup", (e: PointerEvent) => {
    if (dragPointerId !== e.pointerId) return;
    if (dragging) parent.releasePointerCapture(e.pointerId);
    dragging = false;
    dragPointerId = null;
  });

  const applyDimensions = () => {
    const size = radius / RADIUS_RATIO;
    parent.style.width  = `${size}px`;
    parent.style.height = `${size}px`;

    const length = radius * 2;
    lineX.style.width      = `${length}px`;
    lineX.style.marginLeft = `${-radius}px`;
    lineY.style.height     = `${length}px`;
    lineY.style.marginTop  = `${-radius}px`;
    lineZ.style.width      = `${length}px`;
    lineZ.style.marginLeft = `${-radius}px`;
  };

  const el = parent as unknown as HTMLElement & { updateOrientation: () => void; setSize: (size: number) => void };

  el.updateOrientation = () => {
    rotationMatrix.extractRotation(world.camera.three.matrixWorldInverse);
    const { elements: t } = rotationMatrix;

    // Matriz aplicada al contenedor: rotación de la cámara con el eje Y
    // invertido (three.js es Y-up, CSS es Y-down), igual que bim-view-cube.
    const innerMatrix3d = `matrix3d(
      ${epsilon(t[0])}, ${epsilon(-t[1])}, ${epsilon(t[2])}, ${epsilon(t[3])},
      ${epsilon(t[4])}, ${epsilon(-t[5])}, ${epsilon(t[6])}, ${epsilon(t[7])},
      ${epsilon(t[8])}, ${epsilon(-t[9])}, ${epsilon(t[10])}, ${epsilon(t[11])},
      ${epsilon(t[12])}, ${epsilon(-t[13])}, ${epsilon(t[14])}, ${epsilon(t[15])})`;
    inner.style.transform = `translateZ(${DEPTH_OFFSET}px) ${innerMatrix3d}`;

    // Matriz de "cancelación": la transpuesta de la de arriba (es ortogonal,
    // así que su inversa es su transpuesta). Al aplicarla en el transform
    // propio de cada dot, después de posicionarlo, el efecto neto es que el
    // dot queda con rotación cero real (billboard: siempre mirando a la
    // cámara) mientras su posición sigue rotando junto con el gizmo.
    const cancelMatrix3d = `matrix3d(
      ${epsilon(t[0])}, ${epsilon(t[4])}, ${epsilon(t[8])}, 0,
      ${epsilon(-t[1])}, ${epsilon(-t[5])}, ${epsilon(-t[9])}, 0,
      ${epsilon(t[2])}, ${epsilon(t[6])}, ${epsilon(t[10])}, 0,
      0, 0, 0, 1)`;

    for (let i = 0; i < AXES.length; i++) {
      const axis = AXES[i];
      const x = axis.ux * radius;
      const y = axis.uy * radius;
      const z = axis.uz * radius;
      dots[i].style.transform =
        `translate3d(${x}px, ${y}px, ${z}px) ${cancelMatrix3d} translate(-50%, -50%)`;
    }
  };

  el.setSize = (size: number) => {
    radius = size * RADIUS_RATIO;
    applyDimensions();
    el.updateOrientation();
  };

  applyDimensions();
  el.updateOrientation();

  return el;
}
