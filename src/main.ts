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
import { createNavWidget }        from "./camera/nav-widget";
import { fitViewToModels }        from "./camera/fit-view";
import { createSectionTool }      from "./tools/section-tool";
import { createWorldLabelTool }   from "./tools/world-label-tool";
import { createDrawTool }         from "./tools/draw-tool";
import { createCotaTool }         from "./tools/cota-tool";
import { createComputoTool }      from "./tools/computo-tool";
import { ToolManager }            from "./tools/tool-manager";
import { setupIfcLoader }                  from "./ifc/loader";
import { setupModelProcessor, processModel } from "./ifc/model-processor";
import { createViewModesController } from "./core/view-modes";
import { createRightPanel, attachRightPanelResize } from "./ui/right-panel/index";
import { createLeftPanel }    from "./ui/left-panel/index";
import { createToolOptionsPanel } from "./ui/tool-options-panel";
import { createToolbar }          from "./ui/toolbar";
import { createProjectToolbar }   from "./ui/project-toolbar";
import type { ProjectIoDeps }     from "./project/project-io";
import { createSettingsModal }    from "./ui/settings-modal";
import { setupLayout }            from "./ui/layout";
import { createPanelSplit }       from "./ui/panel-split";
import { createMainTabs }         from "./ui/main-tabs";
import { setupBCFSection, BCF_TOPIC_TAB_ID } from "./bcf/bcf-manager";
import { setupComputoSection }    from "./computo/computo-manager";
import { SelectionManager }       from "./selection/selection-manager";
import { guardHovererVisibility } from "./selection/visibility-sync";
import { showWelcomeScreen }      from "./ui/welcome-screen";
import { mountToasts }             from "./ui/toast";
import { setupProjectHistory }     from "./core/project-history";
import { saveThumbnail }          from "./ifc/recent-files";

/** Resuelve en cuanto el renderer dibuja el próximo frame (justo tras postproduction.update()). */
function captureNextFrame(world: OBC.World, threeRenderer: THREE.WebGLRenderer): Promise<string> {
  return new Promise((resolve) => {
    const renderer = world.renderer as OBF.PostproductionRenderer;
    const onAfterUpdate = () => {
      renderer.onAfterUpdate.remove(onAfterUpdate);
      resolve(threeRenderer.domElement.toDataURL("image/jpeg", 0.72));
    };
    renderer.onAfterUpdate.add(onAfterUpdate);
  });
}

async function startApp(): Promise<{
  triggerLoadIfc: () => void;
  loadIfcBytes: (bytes: Uint8Array, name: string) => Promise<void>;
}> {
  BUI.Manager.init();
  injectCompactTableCSS();

  const container = document.getElementById("container");
  if (!container) throw new Error("No se encontró el elemento #container");

  const viewport = document.createElement("bim-viewport");

  // Los toasts se anclan abajo a la derecha del visualizador 3D (el viewport
  // se reubica entre solapas pero es siempre el mismo nodo).
  mountToasts(viewport);

  // — Core scene —
  const { components, world, fragments, worldGrid, sunLight, threeRenderer, adjustGridToModel, axisMaterials } =
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
  highlighter.styles.set("computo", {
    color:         new THREE.Color("#4fc3f7"),
    opacity:       0.55,
    transparent:   true,
    renderedFaces: FRAGS.RenderedFaces.TWO,
  });
  guardHovererVisibility(hoverer, highlighter);

  // — Tools —
  const sectionTool    = createSectionTool(components, world);
  const worldLabelTool = createWorldLabelTool(world, viewport);
  const drawTool       = createDrawTool(world, threeRenderer.domElement);
  const cotaTool       = createCotaTool(world, fragments, threeRenderer.domElement);
  const computoTool    = createComputoTool(fragments, highlighter);
  const toolManager    = new ToolManager(highlighter, hoverer, sectionTool, worldLabelTool, drawTool, cotaTool, computoTool);

  // — Postprocessing —
  const postproduction = setupPostprocessing(world, worldGrid, components, axisMaterials);
  toolManager.setPostproduction(postproduction);

  // — Camera helpers —
  const vcRef = { el: null as any };
  if (world.camera.controls) {
    world.camera.controls.addEventListener("update", () => {
      fragments.core.update();
      if (vcRef.el) vcRef.el.updateOrientation();
      worldLabelTool.updateLOD();
    });
  }
  setupPivotRaycaster(viewport, world, fragments);
  const selectionManager = new SelectionManager();
  toolManager.bindViewportEvents(viewport, world, fragments, threeRenderer.domElement, components, selectionManager);

  // — IFC —
  const ifcLoader = await setupIfcLoader(components);
  setupModelProcessor(fragments, world);
  const viewModes = createViewModesController(fragments);

  // — UI (requires CUI.Manager.init first) —
  CUI.Manager.init();
  createNavWidget(viewport, world, fragments, vcRef);

  const toolOptionsPanel = createToolOptionsPanel(selectionManager, sectionTool, worldLabelTool, drawTool, cotaTool, computoTool);
  viewport.append(toolOptionsPanel.element);

  toolManager.setToolOptionsPanel(toolOptionsPanel);
  toolManager.setMode("navigate");

  const onModelLoaded = async (model: any, name: string) => {
    await processModel(model, fragments, sectionTool, adjustGridToModel);
    await viewModes.applyToModel(model);
    try {
      await fitViewToModels(world, fragments);
      const dataUrl = await captureNextFrame(world, threeRenderer);
      await saveThumbnail(name, dataUrl);
    } catch (error) {
      console.error("No se pudo generar la miniatura del modelo:", error);
    }
  };

  const leftPanel = createLeftPanel(
    components, fragments, ifcLoader, highlighter, onModelLoaded,
    sectionTool.clipper, topics, worldLabelTool, drawTool, cotaTool, computoTool, world, viewModes,
  );

  // Panel dinámico de abajo: Renderizado.
  const rightPanel = createRightPanel(
    world, postproduction, sunLight, threeRenderer, components, fragments, selectionManager, viewModes,
  );

  // Seleccionar un elemento (árbol o click 3D) muestra su información en la
  // solapa "Información" del panel dinámico (ver right-panel/index.ts: tanto
  // applySelection como applyTypeSelection activan esa solapa).
  leftPanel.onElementClick((modelId, localId) => {
    leftPanel.clearTypesSelection();
    rightPanel.applySelection({ [modelId]: new Set([localId]) }).catch(console.error);
  });

  leftPanel.onTypeGroupClick((modelIdMap, typeLabel, count) => {
    rightPanel.applyTypeSelection(modelIdMap, typeLabel, count).catch(console.error);
  });

  highlighter.events["select"].onHighlight.add((modelIdMap) => {
    if (!Object.keys(modelIdMap).length) return;
    if (toolManager.activeMode === "computo") {
      const [modelId, ids] = Object.entries(modelIdMap)[0];
      computoTool.registerClick(modelId, [...ids][0]);
      return;
    }
    leftPanel.clearTypesSelection();
    rightPanel.applySelection(modelIdMap).catch(console.error);
  });

  const { openModal, selectTopic, topicsFrame } = setupBCFSection(components, world, rightPanel);
  const computo = setupComputoSection(computoTool, fragments);
  leftPanel.onTopicSelect((topicGuid) => selectTopic(topicGuid));
  // El modal de lista "BCF Topics" fue reemplazado por la solapa dedicada: el
  // botón "Ver tabla de BCF Topics" del árbol ahora lleva directo a esa solapa.
  leftPanel.onOpenTopicsTable(() => mainTabs.activateTab("bcf-topic"));
  const toolbar        = createToolbar(world, fragments, toolManager, selectionManager, openModal, highlighter);
  const settingsModal   = createSettingsModal(fragments);

  // Undo / redo a nivel proyecto (Ctrl+Z / Ctrl+Shift+Z): snapshot serializado
  // de las capas de datos por cada gesto (cotas, cortes, etiquetas, trazos,
  // ítems y categorías de cómputo) + el `.bcf` de los topics. Ver src/core/project-history.ts.
  const projectHistory = setupProjectHistory({
    leftPanel,
    cotas:       cotaTool,
    drawings:    drawTool,
    labels:      worldLabelTool,
    sectionTool: sectionTool,
    computos:    computoTool,
    topics,
    viewpoints,
    world,
    onTopicsRestored: () => rightPanel.removeTab(BCF_TOPIC_TAB_ID),
  });

  const projectIoDeps: ProjectIoDeps = {
    fragments, topics, viewpoints, world, leftPanel, viewModes,
    history: { suspendWhile: projectHistory.suspendWhile, reset: projectHistory.reset },
  };
  const projectToolbar  = createProjectToolbar(
    projectIoDeps, settingsModal.openModal, leftPanel.triggerLoadIfc, projectHistory.controls,
  );

  // Los botones de la toolbar se registran en el ToolManager al crearla, después
  // del setMode inicial: re-aplicar el modo para que "Navegar" arranque activo.
  toolManager.setMode(toolManager.activeMode);

  const floatingToolbars = document.createElement("div");
  floatingToolbars.className = "floating-toolbars";
  floatingToolbars.append(toolbar);

  // Frame derecho dividido en dos: "Escena" (árbol de modelos IFC cargados,
  // estilo outliner, con exploración Espacial/Tipos por modelo) arriba,
  // paneles dinámicos (Renderizado, BCF) abajo.
  const panelSplit = createPanelSplit(leftPanel.element, rightPanel.element);

  // App shell: primer contenedor horizontal = barra superior con las
  // acciones de proyecto (Nuevo/Abrir/Guardar/Exportar/Config) y, a su
  // derecha, las solapas del frame principal (Layout / BCF Topic / Cómputo);
  // segundo contenedor = el frame de contenido que esas solapas alternan,
  // sin cerrar el proyecto.
  const mainTabs = createMainTabs(topicsFrame, computo.pane);

  const topbar = document.createElement("div");
  topbar.className = "app-topbar";
  topbar.append(projectToolbar, mainTabs.tabsBar);

  document.body.append(topbar, mainTabs.element);

  await setupLayout(viewport, panelSplit, floatingToolbars, mainTabs.layoutPane, attachRightPanelResize);

  // El <bim-viewport> es un único nodo: al abandonar la solapa Layout se
  // guarda acá su lugar original dentro del bim-grid, para poder devolverlo
  // exactamente ahí (en vez de recrear el grid) al volver a esa solapa.
  const layoutViewportHost = viewport.parentElement as HTMLElement;
  const moveViewportTo = (host: HTMLElement) => {
    if (viewport.parentElement !== host) host.append(viewport);
  };

  // Force renderer + camera to pick up the real DOM dimensions after layout is
  // mounted, y de nuevo cada vez que se vuelve a una solapa que aloja el
  // visualizador tras haber estado oculta (display:none, o recién reubicado
  // en otra columna, la dejan con tamaño 0 mientras tanto).
  const syncViewportSize = () => {
    world.renderer?.resize(undefined);
    (world.camera as OBC.OrthoPerspectiveCamera).updateAspect();
  };
  mainTabs.onLayoutShown(() => {
    moveViewportTo(layoutViewportHost);
    syncViewportSize();
  });
  mainTabs.onBcfTopicShown(() => {
    moveViewportTo(mainTabs.bcfViewportSlot);
    syncViewportSize();
  });
  syncViewportSize();

  // Escena base ya armada: a partir de acá cada gesto cuenta como paso deshacible.
  await projectHistory.begin();

  return { triggerLoadIfc: leftPanel.triggerLoadIfc, loadIfcBytes: leftPanel.loadIfcBytes };
}

function hideLoadingScreen() {
  const loadingScreen = document.getElementById("loading-screen");
  if (!loadingScreen) return;
  loadingScreen.classList.add("hidden");
  loadingScreen.addEventListener("transitionend", () => loadingScreen.remove(), { once: true });
}

document.body.classList.add("welcome-active");

startApp()
  .then(({ triggerLoadIfc, loadIfcBytes }) => {
    hideLoadingScreen();
    showWelcomeScreen({
      onLoadIfc: triggerLoadIfc,
      onLoadBytes: loadIfcBytes,
      onClose: () => document.body.classList.remove("welcome-active"),
    });
  })
  .catch((error) => {
    console.error(error);
    const loadingText = document.getElementById("loading-text");
    if (loadingText) {
      loadingText.textContent = "Error al cargar el visualizador. Recarga la página.";
    }
  });
