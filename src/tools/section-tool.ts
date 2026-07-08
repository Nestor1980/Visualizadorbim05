import * as THREE from "three";
import * as OBC from "@thatopen/components";

const DEFAULT_FILL_COLOR = 0xC0B8A8;
const DEFAULT_EDGE_COLOR = 0x2B2B2B;

export interface SectionTool {
  clipper: OBC.Clipper;
  sectionFillGroup: THREE.Group;
  fillSourceMeshes: THREE.Mesh[];
  fillColor: THREE.Color;
  edgeColor: THREE.Color;
  setFillColor: (color: THREE.ColorRepresentation) => void;
  setEdgeColor: (color: THREE.ColorRepresentation) => void;
  rebuildSectionFills: () => void;
}

// Devuelve, por cada triángulo que el plano atraviesa, el segmento de recta
// donde lo corta (0 o 2 intersecciones borde-plano por triángulo; el caso de
// un vértice apoyado exactamente en el plano se descarta, es cosmético).
function collectPlaneCutSegments(meshes: THREE.Mesh[], plane: THREE.Plane): Float32Array {
  const positions: number[] = [];
  const va = new THREE.Vector3();
  const vb = new THREE.Vector3();
  const vc = new THREE.Vector3();
  const pts: THREE.Vector3[] = [];

  const addIfCrosses = (p1: THREE.Vector3, d1: number, p2: THREE.Vector3, d2: number) => {
    if ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) {
      const t = d1 / (d1 - d2);
      pts.push(new THREE.Vector3().lerpVectors(p1, p2, t));
    }
  };

  for (const mesh of meshes) {
    mesh.updateWorldMatrix(true, false);
    const geometry = mesh.geometry;
    const posAttr  = geometry.attributes.position as THREE.BufferAttribute | undefined;
    if (!posAttr) continue;
    const index    = geometry.index;
    const triCount = index ? index.count / 3 : posAttr.count / 3;

    for (let i = 0; i < triCount; i++) {
      const ia = index ? index.getX(i * 3)     : i * 3;
      const ib = index ? index.getX(i * 3 + 1) : i * 3 + 1;
      const ic = index ? index.getX(i * 3 + 2) : i * 3 + 2;

      va.fromBufferAttribute(posAttr, ia).applyMatrix4(mesh.matrixWorld);
      vb.fromBufferAttribute(posAttr, ib).applyMatrix4(mesh.matrixWorld);
      vc.fromBufferAttribute(posAttr, ic).applyMatrix4(mesh.matrixWorld);

      const da = plane.distanceToPoint(va);
      const db = plane.distanceToPoint(vb);
      const dc = plane.distanceToPoint(vc);

      if (da > 0 && db > 0 && dc > 0) continue;
      if (da < 0 && db < 0 && dc < 0) continue;

      pts.length = 0;
      addIfCrosses(va, da, vb, db);
      addIfCrosses(vb, db, vc, dc);
      addIfCrosses(vc, dc, va, da);

      if (pts.length === 2)
        positions.push(pts[0].x, pts[0].y, pts[0].z, pts[1].x, pts[1].y, pts[1].z);
    }
  }

  return new Float32Array(positions);
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

  const fillColor = new THREE.Color(DEFAULT_FILL_COLOR);
  const edgeColor = new THREE.Color(DEFAULT_EDGE_COLOR);
  const fillMaterials: THREE.MeshBasicMaterial[] = [];
  const edgeMaterials: THREE.LineBasicMaterial[] = [];

  const setFillColor = (color: THREE.ColorRepresentation) => {
    fillColor.set(color);
    for (const mat of fillMaterials) mat.color.copy(fillColor);
  };
  const setEdgeColor = (color: THREE.ColorRepresentation) => {
    edgeColor.set(color);
    for (const mat of edgeMaterials) mat.color.copy(edgeColor);
  };

  const rebuildSectionFills = () => {
    console.log("[section-debug] rebuildSectionFills called. fillSourceMeshes:", fillSourceMeshes.length, "clipper.list size:", (clipper as any).list.size);
    while (sectionFillGroup.children.length)
      sectionFillGroup.remove(sectionFillGroup.children[0]);
    fillMaterials.length = 0;
    edgeMaterials.length = 0;

    if (fillSourceMeshes.length === 0) return;

    for (const [, cp] of (clipper as any).list) {
      const plane: THREE.Plane | undefined = (cp as any).three;
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
        color: fillColor, side: THREE.DoubleSide,
        depthWrite: false, depthTest: false,
      });
      fillMat.stencilWrite = true;
      fillMat.stencilRef   = 0;
      fillMat.stencilFunc  = THREE.NotEqualStencilFunc;
      fillMat.stencilFail  = THREE.ReplaceStencilOp;
      fillMat.stencilZFail = THREE.ReplaceStencilOp;
      fillMat.stencilZPass = THREE.ReplaceStencilOp;
      fillMaterials.push(fillMat);

      const fillMesh = new THREE.Mesh(new THREE.PlaneGeometry(2000, 2000), fillMat);
      fillMesh.renderOrder = 4;
      fillMesh.quaternion.setFromUnitVectors(
        new THREE.Vector3(0, 0, 1), plane.normal.clone().normalize(),
      );
      fillMesh.position.copy(plane.normal.clone().multiplyScalar(-plane.constant));
      sectionFillGroup.add(fillMesh);

      // Contorno exacto de la silueta cortada (perímetro real de intersección
      // plano-geometría, no solo la máscara de stencil), para que el corte no
      // se perciba como una superficie plana sin límites definidos.
      const edgePositions = collectPlaneCutSegments(fillSourceMeshes, plane);
      if (edgePositions.length > 0) {
        const edgeGeometry = new THREE.BufferGeometry();
        edgeGeometry.setAttribute("position", new THREE.BufferAttribute(edgePositions, 3));
        const edgeMat = new THREE.LineBasicMaterial({
          color: edgeColor, depthWrite: false, depthTest: false,
        });
        edgeMaterials.push(edgeMat);
        const edgeLines = new THREE.LineSegments(edgeGeometry, edgeMat);
        edgeLines.renderOrder = 5;
        sectionFillGroup.add(edgeLines);
      }
      console.log("[section-debug]", {
        fillSourceMeshesCount: fillSourceMeshes.length,
        edgePositionsLen: edgePositions.length,
        stencilGroupChildren: stencilGroup.children.length,
        planeNormal: plane.normal.toArray(),
        planeConstant: plane.constant,
      });
    }
    console.log("[section-debug] sectionFillGroup.children:", sectionFillGroup.children.length);
  };

  return {
    clipper, sectionFillGroup, fillSourceMeshes,
    fillColor, edgeColor, setFillColor, setEdgeColor,
    rebuildSectionFills,
  };
}
