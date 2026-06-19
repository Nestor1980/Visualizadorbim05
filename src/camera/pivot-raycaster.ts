import * as THREE from "three";
import * as OBC from "@thatopen/components";

export function setupPivotRaycaster(
  viewport: HTMLElement,
  world: OBC.World,
  fragments: OBC.FragmentsManager,
): void {
  const raycaster = new THREE.Raycaster();

  viewport.addEventListener("pointerdown", (e: PointerEvent) => {
    if (e.button !== 2 && e.button !== 1) return;

    const rect = viewport.getBoundingClientRect();
    const ndc  = new THREE.Vector2(
      ((e.clientX - rect.left) / rect.width)  * 2 - 1,
      -((e.clientY - rect.top)  / rect.height) * 2 + 1,
    );

    raycaster.setFromCamera(ndc, world.camera.three);

    const meshes: THREE.Mesh[] = [];
    for (const model of fragments.list.values()) {
      model.object?.traverse(o => { if (o instanceof THREE.Mesh) meshes.push(o); });
    }

    const hits = raycaster.intersectObjects(meshes, false);
    if (hits.length === 0) return;

    const pt  = hits[0].point;
    const pos = new THREE.Vector3();
    world.camera.three.getWorldPosition(pos);
    world.camera.controls.setLookAt(pos.x, pos.y, pos.z, pt.x, pt.y, pt.z, false);
  });
}
