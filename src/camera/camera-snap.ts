import * as THREE from "three";
import * as OBC from "@thatopen/components";

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

/**
 * Devuelve una función que anima la cámara para mirar al modelo desde la
 * dirección (dx, dy, dz), manteniendo la convención +X=right, +Y=top, +Z=front
 * usada tanto por el view-cube como por el gizmo de ejes.
 */
export function createAxisSnap(world: OBC.World, fragments: OBC.FragmentsManager) {
  return (dx: number, dy: number, dz: number) => {
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
}
