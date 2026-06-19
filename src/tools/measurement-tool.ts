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

  measurer.list.onItemAdded.add((line) => {
    const center = new THREE.Vector3();
    line.getCenter(center);
    world.camera.controls.fitToSphere(
      new THREE.Sphere(center, line.distance() / 3), true,
    );
  });

  return measurer;
}
