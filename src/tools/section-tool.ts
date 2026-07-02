import * as THREE from "three";
import * as OBC from "@thatopen/components";

export interface SectionTool {
  clipper: OBC.Clipper;
  sectionFillGroup: THREE.Group;
  fillSourceMeshes: THREE.Mesh[];
  rebuildSectionFills: () => void;
}

export function createSectionTool(
  components: OBC.Components,
  world: OBC.World,
): SectionTool {
  const clipper   = components.get(OBC.Clipper);
  clipper.enabled = false;

  const sectionFillGroup   = new THREE.Group();
  sectionFillGroup.name    = "SectionFillGroup";
  sectionFillGroup.visible = false;
  world.scene.three.add(sectionFillGroup);

  const fillSourceMeshes: THREE.Mesh[] = [];

  const rebuildSectionFills = () => {
    while (sectionFillGroup.children.length)
      sectionFillGroup.remove(sectionFillGroup.children[0]);

    if (fillSourceMeshes.length === 0) return;

    for (const [, cp] of (clipper as any).list) {
      const plane: THREE.Plane | undefined = (cp as any).plane;
      if (!(plane instanceof THREE.Plane)) continue;

      const stencilGroup = new THREE.Group();
      for (const mesh of fillSourceMeshes) {
        mesh.updateWorldMatrix(true, false);
        for (const [side, op] of [
          [THREE.FrontSide, THREE.DecrementWrapStencilOp],
          [THREE.BackSide,  THREE.IncrementWrapStencilOp],
        ] as [THREE.Side, THREE.StencilOp][]) {
          const mat = new THREE.MeshBasicMaterial({
            colorWrite: false, depthWrite: false,
            side, clippingPlanes: [plane],
          });
          mat.stencilWrite = true;
          mat.stencilFunc  = THREE.AlwaysStencilFunc;
          mat.stencilFail  = op;
          mat.stencilZFail = op;
          mat.stencilZPass = op;
          const sm = new THREE.Mesh(mesh.geometry, mat);
          sm.matrixAutoUpdate = false;
          sm.matrix.copy(mesh.matrixWorld);
          sm.renderOrder = 3;
          stencilGroup.add(sm);
        }
      }
      sectionFillGroup.add(stencilGroup);

      const fillMat = new THREE.MeshBasicMaterial({
        color: 0xC0B8A8, side: THREE.DoubleSide,
        depthWrite: false, depthTest: false,
      });
      fillMat.stencilWrite = true;
      fillMat.stencilRef   = 0;
      fillMat.stencilFunc  = THREE.NotEqualStencilFunc;
      fillMat.stencilFail  = THREE.ReplaceStencilOp;
      fillMat.stencilZFail = THREE.ReplaceStencilOp;
      fillMat.stencilZPass = THREE.ReplaceStencilOp;

      const fillMesh = new THREE.Mesh(new THREE.PlaneGeometry(2000, 2000), fillMat);
      fillMesh.renderOrder = 4;
      fillMesh.quaternion.setFromUnitVectors(
        new THREE.Vector3(0, 0, 1), plane.normal.clone().normalize(),
      );
      fillMesh.position.copy(plane.normal.clone().multiplyScalar(-plane.constant));
      sectionFillGroup.add(fillMesh);
    }
  };

  return { clipper, sectionFillGroup, fillSourceMeshes, rebuildSectionFills };
}
