import * as THREE from "three";
import * as OBC from "@thatopen/components";
import * as OBF from "@thatopen/components-front";
import { createRenderizadoPanel } from "./renderizado-panel";
import { createPropertiesPanel } from "./properties-panel";
import { createDynamicTabsPanel, type DynamicPanelTab } from "./dynamic-tabs-panel";
import type { SelectionManager } from "../../selection/selection-manager";

const INFO_TAB_ID = "informacion";

export interface RightPanel {
  element: HTMLElement;
  addTab: (tab: DynamicPanelTab) => void;
  removeTab: (id: string) => void;
  /** Renderiza las propiedades del elemento seleccionado en la solapa
   *  "Información" y la trae a primer plano. */
  applySelection: (modelIdMap: OBC.ModelIdMap) => Promise<void>;
  /** Ídem para una selección por tipo (grupo del árbol de escena). */
  applyTypeSelection: (modelIdMap: OBC.ModelIdMap, typeLabel: string, count: number) => Promise<void>;
  /** Activa la solapa "Información" sin tocar la selección. */
  activateInfoTab: () => void;
}

/**
 * Panel derecho "dinámico": un riel de solapas verticales (ver
 * dynamic-tabs-panel.ts). Renderizado e Información son las solapas fijas
 * — el resto (ej. detalle de un topic BCF) se agrega/quita en caliente vía
 * addTab/removeTab según lo que esté ocurriendo en la escena.
 */
export function createRightPanel(
  world: OBC.World,
  postproduction: OBF.Postproduction,
  sunLight: THREE.DirectionalLight,
  threeRenderer: THREE.WebGLRenderer,
  components: OBC.Components,
  fragments: OBC.FragmentsManager,
  selectionManager: SelectionManager,
): RightPanel {
  const dynamicPanel = createDynamicTabsPanel();

  const renderizadoPanel = createRenderizadoPanel(world, postproduction, sunLight, threeRenderer);
  dynamicPanel.addTab({
    id: "renderizado",
    label: "Renderizado",
    icon: "material-symbols:photo-camera",
    content: renderizadoPanel.section,
    fixed: true,
  });

  // — Información: propiedades del elemento seleccionado (antes vivía en el
  // panel flotante de opciones de herramienta). Dockeada acá, la sección va
  // siempre expandida y sin header colapsable propio. —
  const propertiesPanel = createPropertiesPanel(components, fragments);
  propertiesPanel.section.collapsed = false;
  propertiesPanel.section.fixed     = true;
  dynamicPanel.addTab({
    id: INFO_TAB_ID,
    label: "Información",
    icon: "material-symbols:info",
    content: propertiesPanel.section,
    fixed: true,
  });
  // Renderizado arranca como la solapa visible.
  dynamicPanel.activateTab("renderizado");

  const activateInfoTab = (): void => dynamicPanel.activateTab(INFO_TAB_ID);

  const applySelection = async (modelIdMap: OBC.ModelIdMap): Promise<void> => {
    selectionManager.lastModelIdMap = modelIdMap;
    activateInfoTab();
    propertiesPanel.updateItemsData({ modelIdMap, emptySelectionWarning: false });
    await propertiesPanel.renderForSelection(modelIdMap);
    propertiesPanel.resetScrollTop();
  };

  const applyTypeSelection = async (
    modelIdMap: OBC.ModelIdMap,
    typeLabel: string,
    count: number,
  ): Promise<void> => {
    selectionManager.lastModelIdMap = modelIdMap;
    activateInfoTab();
    propertiesPanel.updateItemsData({ modelIdMap, emptySelectionWarning: false });
    await propertiesPanel.renderForTypeGroup(modelIdMap, typeLabel, count);
    propertiesPanel.resetScrollTop();
  };

  return {
    element: dynamicPanel.element,
    addTab: dynamicPanel.addTab,
    removeTab: dynamicPanel.removeTab,
    applySelection,
    applyTypeSelection,
    activateInfoTab,
  };
}

export const PANEL_MIN_WIDTH = 280;
export const PANEL_MAX_WIDTH = 640;

/**
 * Inserta el handle de arrastre entre el borde del viewport y el panel. El
 * panel ya no es un overlay flotante: ocupa una columna real del bim-grid, así
 * que redimensionar significa mutar --panel-w en el propio grid (de donde sale
 * el ancho de esa columna vía `var(--panel-w)` en el grid-template).
 */
export function attachRightPanelResize(pane: HTMLElement, grid: HTMLElement): void {
  const panelEl = pane.lastElementChild as HTMLElement | null;
  if (!panelEl) return;

  const resizeHandle = document.createElement("div");
  resizeHandle.className = "panel-resize-handle";
  resizeHandle.setAttribute("role", "separator");
  resizeHandle.setAttribute("aria-orientation", "vertical");
  resizeHandle.setAttribute("aria-label", "Redimensionar panel");
  pane.insertBefore(resizeHandle, panelEl);

  resizeHandle.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = parseFloat(getComputedStyle(grid).getPropertyValue("--panel-w")) || 380;
    resizeHandle.setPointerCapture(event.pointerId);
    document.body.classList.add("resizing-panel");

    // El viewport es un canvas WebGL con postprocesado (varios render targets);
    // aplicar --panel-w en cada pointermove fuerza un resize/realloc de esos
    // targets más rápido de lo que el render loop puede repintar, y eso es lo
    // que se ve como flicker. Limitamos la escritura real a una por frame.
    let pendingX: number | null = null;
    let rafId = 0;

    const applyPending = () => {
      rafId = 0;
      if (pendingX === null) return;
      const next = startWidth - (pendingX - startX);
      const clamped = Math.min(PANEL_MAX_WIDTH, Math.max(PANEL_MIN_WIDTH, next));
      grid.style.setProperty("--panel-w", `${clamped}px`);
      pendingX = null;
    };

    const onMove = (moveEvent: PointerEvent) => {
      pendingX = moveEvent.clientX;
      if (!rafId) rafId = requestAnimationFrame(applyPending);
    };
    const onUp = () => {
      if (rafId) cancelAnimationFrame(rafId);
      applyPending();
      resizeHandle.releasePointerCapture(event.pointerId);
      document.body.classList.remove("resizing-panel");
      resizeHandle.removeEventListener("pointermove", onMove);
      resizeHandle.removeEventListener("pointerup", onUp);
    };
    resizeHandle.addEventListener("pointermove", onMove);
    resizeHandle.addEventListener("pointerup", onUp);
  });
}
