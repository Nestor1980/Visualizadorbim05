import * as THREE from "three";
import * as OBC from "@thatopen/components";

/**
 * Encuadra la cámara sobre los modelos cargados usando su AABB real.
 *
 * No usa `world.camera.fit()`: esa función de @thatopen/components calcula
 * el radio de la esfera de ajuste como el tamaño completo de la caja (no el
 * radio real del modelo) multiplicado por un offset de 1.5, lo que aleja la
 * cámara mucho más de lo necesario.
 */
export async function fitViewToModels(world: OBC.World, fragments: OBC.FragmentsManager): Promise<void> {
  const box = new THREE.Box3();
  for (const model of fragments.list.values()) {
    box.union(model.box);
  }
  if (box.isEmpty()) return;
  const sphere = new THREE.Sphere();
  box.getBoundingSphere(sphere);
  await world.camera.controls.fitToSphere(sphere, true);
}
