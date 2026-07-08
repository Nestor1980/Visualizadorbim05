import * as THREE from "three";
import * as OBC from "@thatopen/components";
import * as OBF from "@thatopen/components-front";

export interface SceneSetup {
  components: OBC.Components;
  world: OBC.World;
  fragments: OBC.FragmentsManager;
  worldGrid: ReturnType<OBC.Grids["create"]>;
  sunLight: THREE.DirectionalLight;
  threeRenderer: THREE.WebGLRenderer;
  adjustGridToModel: () => void;
}

export function createScene(viewport: HTMLElement): SceneSetup {
  const components = new OBC.Components();

  const worlds = components.get(OBC.Worlds);
  const world  = worlds.create<
    OBC.SimpleScene,
    OBC.OrthoPerspectiveCamera,
    OBC.SimpleRenderer
  >();

  world.scene    = new OBC.SimpleScene(components);
  world.renderer = new OBF.PostproductionRenderer(components, viewport);
  world.camera   = new OBC.OrthoPerspectiveCamera(components);

  components.init();

  const fragments = components.get(OBC.FragmentsManager);

  // — Scene & lighting —
  world.scene.setup();
  world.scene.three.background = new THREE.Color(0x4a4a4a);
  world.scene.three.add(new THREE.AmbientLight(0xffffff, 0.55));

  const sunLight = new THREE.DirectionalLight(0xfff5e0, 1.0);
  sunLight.position.set(60, 90, 40);
  sunLight.castShadow           = true;
  sunLight.shadow.mapSize.width = sunLight.shadow.mapSize.height = 4096;
  sunLight.shadow.camera.near   = 0.5;
  sunLight.shadow.camera.far    = 800;
  sunLight.shadow.camera.left   = sunLight.shadow.camera.bottom = -120;
  sunLight.shadow.camera.right  = sunLight.shadow.camera.top    =  120;
  sunLight.shadow.bias          = -0.0005;
  sunLight.shadow.normalBias    =  0.02;
  world.scene.three.add(sunLight);

  const fillLight = new THREE.DirectionalLight(0xc8deff, 0.45);
  fillLight.position.set(-40, 30, -30);
  world.scene.three.add(fillLight);
  world.scene.three.add(new THREE.HemisphereLight(0xc8e0ff, 0xd4c8a0, 0.35));

  (world.renderer as OBF.PostproductionRenderer).showLogo = false;

  const watermark = document.createElement("img");
  watermark.className = "viewer-watermark";
  watermark.src = "/img/visualizador_bim_logo_dark.png";
  watermark.alt = "";
  viewport.appendChild(watermark);

  const threeRenderer = (world.renderer as OBF.PostproductionRenderer).three;
  threeRenderer.shadowMap.enabled    = true;
  threeRenderer.shadowMap.type       = THREE.PCFSoftShadowMap;
  threeRenderer.localClippingEnabled = true;

  const grids     = components.get(OBC.Grids);
  const worldGrid = grids.create(world);
  worldGrid.config.color = new THREE.Color(0x707070);

  // Ejes X/Y (rojo/verde) al estilo Blender, atados al mismo plano que la
  // grilla: al vivir como hijos de worldGrid.three heredan su position.y
  // cuando adjustGridToModel() la reubica sobre el modelo cargado.
  const axisLength = 500;
  const xAxis = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-axisLength, 0, 0),
      new THREE.Vector3(axisLength, 0, 0),
    ]),
    new THREE.LineBasicMaterial({ color: 0xc4514f }),
  );
  const yAxis = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0, -axisLength),
      new THREE.Vector3(0, 0, axisLength),
    ]),
    new THREE.LineBasicMaterial({ color: 0x6c9e3d }),
  );
  worldGrid.three.add(xAxis, yAxis);

  world.camera.controls.setLookAt(10, 10, 10, 0, 0, 0);

  const cc = world.camera.controls;
  cc.dollyToCursor       = true;
  cc.infinityDolly       = true;
  cc.truckSpeed          = 2.0;
  cc.smoothTime          = 0.15;
  cc.draggingSmoothTime  = 0.05;

  world.camera.updateAspect();
  world.renderer.onResize.add(() => world.camera.updateAspect());

  const adjustGridToModel = () => {
    const box = new THREE.Box3();
    world.scene.three.traverse((obj) => {
      if (obj instanceof THREE.Mesh && !(obj.material instanceof THREE.ShaderMaterial))
        box.union(new THREE.Box3().setFromObject(obj));
    });
    if (!box.isEmpty()) worldGrid.three.position.y = box.min.y;
  };

  return { components, world, fragments, worldGrid, sunLight, threeRenderer, adjustGridToModel };
}
