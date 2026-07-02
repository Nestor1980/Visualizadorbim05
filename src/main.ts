import * as THREE from "three";
import * as OBC from "@thatopen/components";
import * as OBF from "@thatopen/components-front";
import * as FRAGS from "@thatopen/fragments";
import * as BUI from "@thatopen/ui";
import * as CUI from "@thatopen/ui-obc";

import { injectCompactTableCSS, HIGHLIGHT_COLOR } from "./config/constants";
import { createScene }            from "./core/scene";
import { setupPostprocessing }    from "./core/postprocessing";
import { setupPivotRaycaster }    from "./camera/pivot-raycaster";
import { createViewCube }         from "./camera/view-cube";
import { createSectionTool }      from "./tools/section-tool";
import { createMeasurementTool }  from "./tools/measurement-tool";
import { ToolManager }            from "./tools/tool-manager";
import { setupIfcLoader }                  from "./ifc/loader";
import { setupModelProcessor, processModel } from "./ifc/model-processor";
import { createRightPanel }       from "./ui/right-panel/index";
import { createLeftPanel }        from "./ui/left-panel/index";
import { createToolbar }          from "./ui/toolbar";
import { setupLayout }            from "./ui/layout";
import { setupBCFSection }        from "./bcf/bcf-manager";
import { SelectionManager }       from "./selection/selection-manager";

async function startApp() {
  BUI.Manager.init();
  injectCompactTableCSS();

  const container = document.getElementById("container");
  if (!container) throw new Error("No se encontró el elemento #container");

  const viewport = document.createElement("bim-viewport");

  // — Core scene —
  const { components, world, fragments, worldGrid, sunLight, threeRenderer, adjustGridToModel } =
    createScene(viewport);

  fragments.init(await OBC.FragmentsManager.getWorker());

  // — BCF topics setup —
  const topics     = components.get(OBC.BCFTopics);
  const viewpoints = components.get(OBC.Viewpoints);
  topics.setup({
    users:  new Set(["arquitecto@proyecto.com", "ingeniero@proyecto.com"]),
    labels: new Set(["Arquitectura", "Estructura", "MEP", "Coordinación"]),
  });
  topics.list.onItemSet.add(({ value: topic }) => {
    if (topic.viewpoints.size > 0) {
      for (const vpGuid of topic.viewpoints) {
        const vp = viewpoints.list.get(vpGuid);
        if (vp && !vp.world) vp.world = world;
      }
    } else {
      const vp = viewpoints.create();
      vp.world = world;
      vp.updateCamera();
      topic.viewpoints.add(vp.guid);
    }
  });

  // — Hover + Highlight —
  const hoverer    = components.get(OBF.Hoverer);
  hoverer.world    = world;
  hoverer.enabled  = true;
  hoverer.material = new THREE.MeshBasicMaterial({
    color: HIGHLIGHT_COLOR.clone(), transparent: true, opacity: 0.5, depthTest: false,
  });

  const highlighter = components.get(OBF.Highlighter);
  highlighter.setup({ world });
  highlighter.styles.set("select", {
    color:         HIGHLIGHT_COLOR.clone(),
    opacity:       0.55,
    transparent:   true,
    renderedFaces: FRAGS.RenderedFaces.TWO,
  });

  // — Tools —
  const sectionTool = createSectionTool(components, world);
  const measurer    = createMeasurementTool(components, world);
  const toolManager = new ToolManager(measurer, highlighter, hoverer, sectionTool);

  // — Postprocessing —
  const postproduction = setupPostprocessing(world, worldGrid, components);
  toolManager.setPostproduction(postproduction);

  // — Camera helpers —
  const vcRef = { el: null as any };
  if (world.camera.controls) {
    world.camera.controls.addEventListener("update", () => {
      fragments.core.update();
      if (vcRef.el) vcRef.el.updateOrientation();
    });
  }
  setupPivotRaycaster(viewport, world, fragments);
  toolManager.bindViewportEvents(viewport, world);

  // — IFC —
  const ifcLoader = await setupIfcLoader(components);
  setupModelProcessor(fragments, world);

  // — UI (requires CUI.Manager.init first) —
  CUI.Manager.init();
  createViewCube(viewport, world, fragments, vcRef);

  const selectionManager = new SelectionManager();
  const rightPanel = createRightPanel(
    components, fragments, measurer, sectionTool,
    postproduction, sunLight, threeRenderer,
  );

  toolManager.setRightPanel(rightPanel);
  toolManager.setMode("navigate");

  // Sync selectionManager with rightPanel selection handlers
  const origApply     = rightPanel.applySelection.bind(rightPanel);
  const origApplyType = rightPanel.applyTypeSelection.bind(rightPanel);
  rightPanel.applySelection = async (map) => {
    selectionManager.lastModelIdMap = map;
    return origApply(map);
  };
  rightPanel.applyTypeSelection = async (map, label, count) => {
    selectionManager.lastModelIdMap = map;
    return origApplyType(map, label, count);
  };

  const onModelLoaded = (model: any) =>
    processModel(model, fragments, sectionTool, adjustGridToModel);

  const leftPanel = createLeftPanel(components, fragments, ifcLoader, highlighter, onModelLoaded);

  // Selecting an element (tree or 3D click) switches the right panel to the
  // Propiedades view, mirroring an explicit click on the toolbar button.
  const showProperties = () => {
    if (toolManager.activeMode !== "properties") toolManager.setMode("properties");
  };

  leftPanel.treePanel.onElementClick((modelId, localId) => {
    leftPanel.treePanel.clearTypesSelection();
    showProperties();
    rightPanel.applySelection({ [modelId]: new Set([localId]) }).catch(console.error);
  });

  leftPanel.treePanel.onTypeGroupClick((modelIdMap, typeLabel, count) => {
    showProperties();
    rightPanel.applyTypeSelection(modelIdMap, typeLabel, count).catch(console.error);
  });

  highlighter.events["select"].onHighlight.add((modelIdMap) => {
    if (!Object.keys(modelIdMap).length) return;
    leftPanel.treePanel.clearTypesSelection();
    showProperties();
    rightPanel.applySelection(modelIdMap).catch(console.error);
  });

  const { openModal } = setupBCFSection(components, world, rightPanel.element);
  const toolbar       = createToolbar(world, fragments, toolManager, selectionManager, openModal);

  // Los botones de la toolbar se registran en el ToolManager al crearla, después
  // del setMode inicial: re-aplicar el modo para que "Navegar" arranque activo.
  toolManager.setMode(toolManager.activeMode);

  await setupLayout(leftPanel.element, viewport, rightPanel.element, toolbar);

  // Force renderer + camera to pick up the real DOM dimensions after layout is mounted.
  world.renderer?.resize(undefined);
  (world.camera as OBC.OrthoPerspectiveCamera).updateAspect();
}

function hideLoadingScreen() {
  const loadingScreen = document.getElementById("loading-screen");
  if (!loadingScreen) return;
  loadingScreen.classList.add("hidden");
  loadingScreen.addEventListener("transitionend", () => loadingScreen.remove(), { once: true });
}

startApp()
  .then(hideLoadingScreen)
  .catch((error) => {
    console.error(error);
    const loadingText = document.getElementById("loading-text");
    if (loadingText) {
      loadingText.textContent = "Error al cargar el visualizador. Recarga la página.";
    }
  });
