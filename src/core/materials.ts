import * as THREE from "three";

export function convertToPhong(mat: THREE.Material): THREE.MeshPhongMaterial {
  const src = mat as any;
  const color = src.color
    ? (src.color as THREE.Color).clone()
    : new THREE.Color(0xd4cfc8);

  return new THREE.MeshPhongMaterial({
    color,
    transparent: src.transparent ?? false,
    opacity:     src.opacity ?? 1,
    side:        THREE.DoubleSide,
    shininess:   12,
    specular:    new THREE.Color(0x1a1a1a),
  });
}
