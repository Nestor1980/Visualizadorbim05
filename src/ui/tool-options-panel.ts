import * as OBC from "@thatopen/components";
import * as OBF from "@thatopen/components-front";
import { createPropertiesPanel } from "./right-panel/properties-panel";
import { createMedidorPanel } from "./right-panel/medidor-panel";
import { createSectionPanel } from "./right-panel/section-panel";
import { createLabelPanel } from "./right-panel/label-panel";
import { createDrawPanel } from "./right-panel/draw-panel";
import type { SectionTool } from "../tools/section-tool";
import type { WorldLabelTool } from "../tools/world-label-tool";
import type { DrawTool } from "../tools/draw-tool";
import type { WallOcclusionControl } from "../tools/measurement-tool";

export type ToolOptionsView = "measure" | "section" | "properties" | "label" | "draw" | null;

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
  wallOcclusion: WallOcclusionControl,
  sectionTool: SectionTool,
  worldLabelTool: WorldLabelTool,
  drawTool: DrawTool,
): ToolOptionsPanel {
  const propertiesPanel = createPropertiesPanel(components, fragments);
  const medidorPanel    = createMedidorPanel(measurer, wallOcclusion);
  const sectionPanel    = createSectionPanel(sectionTool);
  const labelPanel      = createLabelPanel(worldLabelTool);
  const drawPanel       = createDrawPanel(drawTool);

  propertiesPanel.section.collapsed = false;

  const views: Record<Exclude<ToolOptionsView, null>, HTMLElement> = {
    measure:    medidorPanel.element,
    section:    sectionPanel.section,
    properties: propertiesPanel.section,
    label:      labelPanel.element,
    draw:       drawPanel.element,
  };

  const element = document.createElement("div");
  element.className = "tool-options-panel";
  element.append(views.measure, views.section, views.properties, views.label, views.draw);

  const applyView = (view: ToolOptionsView): void => {
    element.style.display = view ? "" : "none";
    for (const [key, el] of Object.entries(views)) {
      el.style.display = key === view ? "" : "none";
    }
  };

  // Los paneles de etiqueta y dibujo se rigen por la selección de su propia
  // herramienta en vez del modo activo: aparecen apenas se selecciona/crea un
  // ítem (en cualquier modo, p. ej. desde el árbol de escena) y al
  // deseleccionarlo se restaura la vista del modo actual.
  let modeView: ToolOptionsView = null;
  let labelSelected = false;
  let drawSelected  = false;

  const applyOverride = (): void => {
    applyView(labelSelected ? "label" : drawSelected ? "draw" : modeView);
  };

  const setView = (view: ToolOptionsView): void => {
    modeView = view;
    if (!labelSelected && !drawSelected) applyView(view);
  };

  worldLabelTool.onSelectionChange.add((label) => {
    labelSelected = !!label;
    applyOverride();
  });

  drawTool.onSelectionChange.add((stroke) => {
    drawSelected = !!stroke;
    applyOverride();
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
