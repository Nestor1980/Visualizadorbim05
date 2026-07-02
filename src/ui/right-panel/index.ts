import * as THREE from "three";
import * as OBC from "@thatopen/components";
import * as OBF from "@thatopen/components-front";
import * as BUI from "@thatopen/ui";
import { createPropertiesPanel } from "./properties-panel";
import { createControlsPanel } from "./controls-panel";
import { createRenderizadoPanel } from "./renderizado-panel";
import { createMedidorPanel } from "./medidor-panel";
import { createSectionPanel } from "./section-panel";
import type { SectionTool } from "../../tools/section-tool";

export type RightPanelView = "controls" | "measure" | "section" | "properties";

export interface RightPanel {
  element: BUI.Panel;
  setView: (view: RightPanelView) => void;
  applySelection: (modelIdMap: OBC.ModelIdMap) => Promise<void>;
  applyTypeSelection: (modelIdMap: OBC.ModelIdMap, typeLabel: string, count: number) => Promise<void>;
}

export function createRightPanel(
  components: OBC.Components,
  fragments: OBC.FragmentsManager,
  measurer: OBF.LengthMeasurement,
  sectionTool: SectionTool,
  postproduction: OBF.Postproduction,
  sunLight: THREE.DirectionalLight,
  threeRenderer: THREE.WebGLRenderer,
): RightPanel {
  const panel = document.createElement("bim-panel") as BUI.Panel;
  panel.label = "Panel";

  const propertiesPanel  = createPropertiesPanel(components, fragments);
  const controlsPanel    = createControlsPanel(fragments);
  const renderizadoPanel = createRenderizadoPanel(postproduction, sunLight, threeRenderer);
  const medidorPanel     = createMedidorPanel(measurer);
  const sectionPanel     = createSectionPanel(sectionTool);

  propertiesPanel.section.collapsed = false;

  const controlsView = document.createElement("div");
  controlsView.append(controlsPanel.section, renderizadoPanel.section);

  const measureView = document.createElement("div");
  measureView.append(medidorPanel.element);

  const sectionView = document.createElement("div");
  sectionView.append(sectionPanel.section);

  const propertiesView = document.createElement("div");
  propertiesView.append(propertiesPanel.section);

  const views: Record<RightPanelView, HTMLElement> = {
    controls:   controlsView,
    measure:    measureView,
    section:    sectionView,
    properties: propertiesView,
  };

  panel.append(controlsView, measureView, sectionView, propertiesView);

  const setView = (view: RightPanelView): void => {
    for (const [key, el] of Object.entries(views)) {
      el.style.display = key === view ? "" : "none";
    }
  };

  setView("controls");

  const applySelection = async (modelIdMap: OBC.ModelIdMap): Promise<void> => {
    propertiesPanel.updateItemsData({ modelIdMap, emptySelectionWarning: false });
    await propertiesPanel.renderForSelection(modelIdMap);
    propertiesPanel.resetScrollTop();
  };

  const applyTypeSelection = async (
    modelIdMap: OBC.ModelIdMap,
    typeLabel: string,
    count: number,
  ): Promise<void> => {
    propertiesPanel.updateItemsData({ modelIdMap, emptySelectionWarning: false });
    await propertiesPanel.renderForTypeGroup(modelIdMap, typeLabel, count);
    propertiesPanel.resetScrollTop();
  };

  return { element: panel, setView, applySelection, applyTypeSelection };
}

const MIN_WIDTH = 280;
const MAX_WIDTH = 640;

/** Inserta el handle de arrastre del panel derecho entre el botón de colapso y el panel. */
export function attachRightPanelResize(wrapper: HTMLElement): void {
  const panelEl = wrapper.lastElementChild as HTMLElement | null;
  if (!panelEl) return;

  const resizeHandle = document.createElement("div");
  resizeHandle.className = "panel-resize-handle";
  resizeHandle.setAttribute("role", "separator");
  resizeHandle.setAttribute("aria-orientation", "vertical");
  resizeHandle.setAttribute("aria-label", "Redimensionar panel derecho");
  wrapper.insertBefore(resizeHandle, panelEl);

  resizeHandle.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = parseFloat(getComputedStyle(wrapper).getPropertyValue("--panel-w")) || 370;
    resizeHandle.setPointerCapture(event.pointerId);
    document.body.classList.add("resizing-panel");

    const onMove = (moveEvent: PointerEvent) => {
      const next = startWidth - (moveEvent.clientX - startX);
      const clamped = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, next));
      wrapper.style.setProperty("--panel-w", `${clamped}px`);
    };
    const onUp = () => {
      resizeHandle.releasePointerCapture(event.pointerId);
      document.body.classList.remove("resizing-panel");
      resizeHandle.removeEventListener("pointermove", onMove);
      resizeHandle.removeEventListener("pointerup", onUp);
    };
    resizeHandle.addEventListener("pointermove", onMove);
    resizeHandle.addEventListener("pointerup", onUp);
  });
}
