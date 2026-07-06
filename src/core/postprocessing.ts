import * as THREE from "three";
import * as OBC from "@thatopen/components";
import * as OBF from "@thatopen/components-front";
import { HIGHLIGHT_COLOR } from "../config/constants";

export function setupPostprocessing(
  world: OBC.World,
  worldGrid: ReturnType<OBC.Grids["create"]>,
  components: OBC.Components,
): OBF.Postproduction {
  const postproduction = (world.renderer as OBF.PostproductionRenderer).postproduction;
  postproduction.enabled = true;

  // On projection change: flush old frames from the EffectComposer before the
  // new camera renders to avoid ghosting artifacts.
  world.camera.projection.onChanged.add((newCam: any) => {
    const pp  = postproduction as any;
    const rdr = (world.renderer as OBF.PostproductionRenderer).three;

    if (pp._basePass) pp._basePass.camera = newCam;
    if (pp._aoPass)   pp._aoPass.camera   = newCam;
    if (pp.composer?.passes) {
      for (const pass of pp.composer.passes) {
        if (pass.camera !== undefined) pass.camera = newCam;
      }
    }

    if (pp.composer) {
      rdr.setRenderTarget(pp.composer.renderTarget1); rdr.clear();
      rdr.setRenderTarget(pp.composer.renderTarget2); rdr.clear();
      rdr.setRenderTarget(null);
    }

    const prev = rdr.autoClear;
    rdr.autoClear = true;
    rdr.clear();
    rdr.autoClear = prev;

    world.camera.updateAspect();
  });

  postproduction.basePass.isolatedMaterials.push(worldGrid.material);
  postproduction.outlinesEnabled         = true;
  postproduction.glossEnabled            = true;
  postproduction.glossPass.minGloss      = -0.1;
  postproduction.glossPass.maxGloss      = 0.4;
  postproduction.glossPass.glossExponent   = 4;
  postproduction.glossPass.fresnelExponent = 3;

  postproduction.aoPass.updateGtaoMaterial({
    radius: 0.5, distanceFallOff: 1.0, scale: 2.5, samples: 16, thickness: 1.0,
  });

  postproduction.smaaEnabled  = true;
  postproduction.style        = OBF.PostproductionAspect.COLOR_PEN;
  postproduction.edgesPass.width = 1.0;

  // Enable stencilBuffer on the EffectComposer render targets so that the
  // section-fill stencil technique works alongside post-processing.
  const ppComposer = (postproduction as any).composer;
  if (ppComposer?.renderTarget1) {
    ppComposer.renderTarget1.stencilBuffer = true;
    ppComposer.renderTarget1.dispose();
    ppComposer.renderTarget2.stencilBuffer = true;
    ppComposer.renderTarget2.dispose();
  }

  // Outliner — must be set up AFTER postproduction.enabled = true because
  // its setters access outlinePass which only exists once the composer is live.
  const outliner    = components.get(OBF.Outliner);
  outliner.world    = world;
  outliner.enabled  = true;
  outliner.color    = new THREE.Color(0x39ff14);
  outliner.thickness = 3;
  outliner.fillColor = HIGHLIGHT_COLOR.clone();
  outliner.fillOpacity = 0.35;
  outliner.styles.add("select");

  return postproduction;
}
