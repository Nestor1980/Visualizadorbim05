import * as THREE from "three";
import * as OBC from "@thatopen/components";

const ORBIT_SPEED = 0.008;

function getModelCenter(fragments: OBC.FragmentsManager): THREE.Vector3 {
  const box = new THREE.Box3();
  let hasContent = false;
  for (const model of fragments.list.values()) {
    if (model.object) { box.expandByObject(model.object); hasContent = true; }
  }
  return hasContent ? box.getCenter(new THREE.Vector3()) : new THREE.Vector3();
}

function getViewDistance(fragments: OBC.FragmentsManager): number {
  const box = new THREE.Box3();
  let hasContent = false;
  for (const model of fragments.list.values()) {
    if (model.object) { box.expandByObject(model.object); hasContent = true; }
  }
  if (!hasContent) return 80;
  const size = new THREE.Vector3();
  box.getSize(size);
  return Math.max(size.x, size.y, size.z) * 2;
}

export function createViewCube(
  viewport: HTMLElement,
  world: OBC.World,
  fragments: OBC.FragmentsManager,
  vcRef: { el: any },
): void {
  const viewCube = document.createElement("bim-view-cube");
  (viewCube as any).camera = world.camera.three;
  vcRef.el = viewCube;

  const goTo = (dx: number, dy: number, dz: number) => {
    const c   = getModelCenter(fragments);
    const d   = getViewDistance(fragments);
    const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
    const f   = d / len;
    world.camera.controls.setLookAt(
      c.x + dx * f, c.y + dy * f, c.z + dz * f,
      c.x, c.y, c.z,
      true,
    );
  };

  viewCube.addEventListener("frontclick",  () => goTo( 0,  0,  1));
  viewCube.addEventListener("backclick",   () => goTo( 0,  0, -1));
  viewCube.addEventListener("rightclick",  () => goTo( 1,  0,  0));
  viewCube.addEventListener("leftclick",   () => goTo(-1,  0,  0));
  viewCube.addEventListener("topclick",    () => goTo( 0,  1,  0));
  viewCube.addEventListener("bottomclick", () => goTo( 0, -1,  0));

  let dragging = false;
  let lastX = 0;
  let lastY = 0;

  viewCube.addEventListener("pointerdown", (e: PointerEvent) => {
    dragging = true;
    lastX = e.clientX;
    lastY = e.clientY;
    viewCube.setPointerCapture(e.pointerId);
    e.stopPropagation();
  });

  viewCube.addEventListener("pointermove", (e: PointerEvent) => {
    if (!dragging) return;
    const dx = e.clientX - lastX;
    const dy = e.clientY - lastY;
    lastX = e.clientX;
    lastY = e.clientY;
    world.camera.controls.rotate(-dx * ORBIT_SPEED, -dy * ORBIT_SPEED, false);
    e.stopPropagation();
  });

  viewCube.addEventListener("pointerup", (e: PointerEvent) => {
    if (!dragging) return;
    dragging = false;
    viewCube.releasePointerCapture(e.pointerId);
    e.stopPropagation();
  });

  viewport.append(viewCube);
}
