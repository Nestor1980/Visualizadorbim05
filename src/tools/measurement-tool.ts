import * as THREE from "three";
import * as OBC from "@thatopen/components";
import * as FRAGS from "@thatopen/fragments";
import * as OBF from "@thatopen/components-front";

export function createMeasurementTool(
  components: OBC.Components,
  world: OBC.World,
): OBF.LengthMeasurement {
  const measurer     = components.get(OBF.LengthMeasurement);
  measurer.world     = world;
  measurer.color     = new THREE.Color("#494cb6");
  measurer.enabled   = false;
  measurer.snappings = [FRAGS.SnappingClass.POINT];

  return measurer;
}

/**
 * A partir de una cara raycasteada (triángulos indexados locales al pick, ver
 * `RaycastHit.facePoints`/`faceIndices`), crea una medición por cada arista
 * única de esa triangulación. Un borde compartido entre dos triángulos
 * adyacentes aparece dos veces en la lista de aristas por triángulo — se
 * cuenta una sola vez.
 */
export function measureFaceEdges(
  measurer: OBF.LengthMeasurement,
  facePoints: Float32Array,
  faceIndices: Uint16Array,
): void {
  const getVertex = (idx: number): THREE.Vector3 =>
    new THREE.Vector3(facePoints[idx * 3], facePoints[idx * 3 + 1], facePoints[idx * 3 + 2]);

  const seenEdges = new Set<string>();
  for (let i = 0; i < faceIndices.length; i += 3) {
    const tri = [faceIndices[i], faceIndices[i + 1], faceIndices[i + 2]];
    for (let e = 0; e < 3; e++) {
      const a = tri[e];
      const b = tri[(e + 1) % 3];
      if (a === b) continue;
      const key = a < b ? `${a}_${b}` : `${b}_${a}`;
      if (seenEdges.has(key)) continue;
      seenEdges.add(key);

      const line = new OBF.Line(getVertex(a), getVertex(b));
      line.units    = measurer.units;
      line.rounding = measurer.rounding;
      measurer.list.add(line);
    }
  }
}
