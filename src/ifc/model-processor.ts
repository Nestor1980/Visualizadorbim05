import * as THREE from "three";
import * as OBC from "@thatopen/components";
import { convertToPhong } from "../core/materials";
import { IFC_FALLBACK_COLORS, SECTION_FILL_CATEGORIES } from "../config/constants";
import type { SectionTool } from "../tools/section-tool";

export function setupModelProcessor(
  fragments: OBC.FragmentsManager,
  world: OBC.World,
  sectionTool: SectionTool,
  adjustGridToModel: () => void,
): void {
  fragments.list.onItemSet.add(async ({ value: model }) => {
    model.useCamera(world.camera.three);
    world.scene.three.add(model.object);
    fragments.core.update(true);

    // — Convert all materials to Phong for directional-light shading —
    model.object.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.castShadow    = true;
        child.receiveShadow = true;
        if (Array.isArray(child.material)) {
          child.material = child.material.map((m) => convertToPhong(m));
        } else {
          child.material = convertToPhong(child.material);
        }
      }
    });

    // — Apply IFC fallback colors for white-material elements —
    for (const [categoryName, colorDef] of Object.entries(IFC_FALLBACK_COLORS)) {
      try {
        const results    = await model.getItemsOfCategories([new RegExp(`^${categoryName}$`, "i")]);
        const ids: number[] = [];
        for (const itemIds of Object.values(results)) ids.push(...(itemIds as number[]));
        if (ids.length === 0) continue;

        const idSet = new Set(ids);
        model.object.traverse((child) => {
          if (!(child instanceof THREE.Mesh)) return;
          const localId = child.userData?.localId as number | undefined;
          if (localId === undefined || !idSet.has(localId)) return;
          const mats = Array.isArray(child.material) ? child.material : [child.material];
          for (const mat of mats) {
            const phong   = mat as THREE.MeshPhongMaterial;
            const isWhite = phong.color.r > 0.95 && phong.color.g > 0.95 && phong.color.b > 0.95;
            if (isWhite) {
              phong.color.setHex(colorDef.hex);
              if (colorDef.transparent) {
                phong.transparent = true;
                phong.opacity = colorDef.opacity ?? 0.5;
              }
            }
          }
        });
      } catch { /* category not present in this model */ }
    }

    // — Collect meshes of structural categories for section fill —
    sectionTool.fillSourceMeshes.length = 0;
    try {
      const results = await model.getItemsOfCategories(SECTION_FILL_CATEGORIES);
      const ids = new Set<number>();
      for (const itemIds of Object.values(results))
        for (const id of itemIds as number[]) ids.add(id);
      model.object.traverse((child) => {
        if (!(child instanceof THREE.Mesh)) return;
        const localId = child.userData?.localId as number | undefined;
        if (localId !== undefined && ids.has(localId))
          sectionTool.fillSourceMeshes.push(child);
      });
    } catch (e) {
      console.warn("Error collecting meshes for section fill:", e);
    }

    setTimeout(() => adjustGridToModel(), 500);
  });
}
