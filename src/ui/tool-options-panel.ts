import * as OBC from "@thatopen/components";
import * as OBF from "@thatopen/components-front";
import { createPropertiesPanel } from "./right-panel/properties-panel";
import { createMedidorPanel } from "./right-panel/medidor-panel";
import { createSectionPanel } from "./right-panel/section-panel";
import { createLabelPanel } from "./right-panel/label-panel";
import type { SectionTool } from "../tools/section-tool";
import type { WorldLabelTool } from "../tools/world-label-tool";

export type ToolOptionsView = "measure" | "section" | "properties" | "label" | null;

export interface ToolOptionsPanel {
  element: HTMLElement;
  setView: (view: ToolOptionsView) => void;
  applySelection: (modelIdMap: OBC.ModelIdMap) => Promise<void>;
  applyTypeSelection: (modelIdMap: OBC.ModelIdMap, typeLabel: string, count: number) => Promise<void>;
}

/**
 * Panel flotante anclado a la esquina del viewport (al estilo del panel de
 * opciones de herramienta de Blender): muestra los ajustes de la herramienta
 * activa y se oculta por completo cuando no hay ninguna seleccionada. Cada
 * bim-panel-section trae su propio header colapsable.
 */
export function createToolOptionsPanel(
  components: OBC.Components,
  fragments: OBC.FragmentsManager,
  measurer: OBF.LengthMeasurement,
  sectionTool: SectionTool,
  worldLabelTool: WorldLabelTool,
): ToolOptionsPanel {
  const propertiesPanel = createPropertiesPanel(components, fragments);
  const medidorPanel    = createMedidorPanel(measurer);
  const sectionPanel    = createSectionPanel(sectionTool);
  const labelPanel      = createLabelPanel(worldLabelTool);

  propertiesPanel.section.collapsed = false;

  const views: Record<Exclude<ToolOptionsView, null>, HTMLElement> = {
    measure:    medidorPanel.element,
    section:    sectionPanel.section,
    properties: propertiesPanel.section,
    label:      labelPanel.element,
  };

  const element = document.createElement("div");
  element.className = "tool-options-panel";
  element.append(views.measure, views.section, views.properties, views.label);

  const applyView = (view: ToolOptionsView): void => {
    element.style.display = view ? "" : "none";
    for (const [key, el] of Object.entries(views)) {
      el.style.display = key === view ? "" : "none";
    }
  };

  // El panel de etiqueta se rige por la selección de WorldLabelTool en vez
  // del modo activo: aparece apenas se selecciona/crea una etiqueta (en
  // cualquier modo) y al deseleccionarla se restaura la vista del modo actual.
  let modeView: ToolOptionsView = null;
  let labelSelected = false;

  const setView = (view: ToolOptionsView): void => {
    modeView = view;
    if (!labelSelected) applyView(view);
  };

  worldLabelTool.onSelectionChange.add((label) => {
    labelSelected = !!label;
    applyView(labelSelected ? "label" : modeView);
  });

  setView(null);

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

  return { element, setView, applySelection, applyTypeSelection };
}
