import * as OBC from "@thatopen/components";
import { createAxisSnap } from "./camera-snap";

const ORBIT_SPEED   = 0.008;
const DRAG_THRESHOLD = 4; // px antes de considerar que es un arrastre y no un click

export const CUBE_DEFAULT_SIZE = 60;

export function createViewCube(
  world: OBC.World,
  fragments: OBC.FragmentsManager,
  initialSize = CUBE_DEFAULT_SIZE,
): HTMLElement & { updateOrientation: () => void; setSize: (size: number) => void } {
  const viewCube = document.createElement("bim-view-cube");
  (viewCube as any).camera    = world.camera.three;
  (viewCube as any).size       = initialSize;
  (viewCube as any).topText    = "TOP";
  (viewCube as any).bottomText = "BOTTOM";
  (viewCube as any).frontText  = "FRONT";
  (viewCube as any).backText   = "BACK";
  (viewCube as any).leftText   = "LEFT";
  (viewCube as any).rightText  = "RIGHT";

  const goTo = createAxisSnap(world, fragments);

  viewCube.addEventListener("frontclick",  () => goTo( 0,  0,  1));
  viewCube.addEventListener("backclick",   () => goTo( 0,  0, -1));
  viewCube.addEventListener("rightclick",  () => goTo( 1,  0,  0));
  viewCube.addEventListener("leftclick",   () => goTo(-1,  0,  0));
  viewCube.addEventListener("topclick",    () => goTo( 0,  1,  0));
  viewCube.addEventListener("bottomclick", () => goTo( 0, -1,  0));

  // El pointer capture solo se toma una vez que el arrastre supera un umbral:
  // capturarlo desde el pointerdown retargeta el "click" nativo posterior al
  // propio bim-view-cube en vez de a la cara tocada dentro de su shadow DOM,
  // así que un click simple (sin mover el mouse) nunca disparaba el evento
  // "topclick"/"frontclick"/etc. de la cara.
  let dragPointerId: number | null = null;
  let dragging = false;
  let startX = 0;
  let startY = 0;
  let lastX = 0;
  let lastY = 0;

  viewCube.addEventListener("pointerdown", (e: PointerEvent) => {
    dragPointerId = e.pointerId;
    dragging = false;
    startX = lastX = e.clientX;
    startY = lastY = e.clientY;
    e.stopPropagation();
  });

  viewCube.addEventListener("pointermove", (e: PointerEvent) => {
    if (dragPointerId !== e.pointerId) return;
    if (!dragging) {
      if (Math.abs(e.clientX - startX) < DRAG_THRESHOLD && Math.abs(e.clientY - startY) < DRAG_THRESHOLD) return;
      dragging = true;
      viewCube.setPointerCapture(e.pointerId);
    }
    const dx = e.clientX - lastX;
    const dy = e.clientY - lastY;
    lastX = e.clientX;
    lastY = e.clientY;
    world.camera.controls.rotate(-dx * ORBIT_SPEED, -dy * ORBIT_SPEED, false);
    e.stopPropagation();
  });

  viewCube.addEventListener("pointerup", (e: PointerEvent) => {
    if (dragPointerId !== e.pointerId) return;
    if (dragging) viewCube.releasePointerCapture(e.pointerId);
    dragging = false;
    dragPointerId = null;
  });

  const el = viewCube as unknown as HTMLElement & { updateOrientation: () => void; setSize: (size: number) => void };
  el.setSize = (size: number) => {
    (viewCube as any).size = size;
  };
  return el;
}
