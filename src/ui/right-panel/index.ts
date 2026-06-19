import * as OBC from "@thatopen/components";
import * as OBF from "@thatopen/components-front";
import * as BUI from "@thatopen/ui";
import { createTreePanel } from "./tree-panel";
import { createPropertiesPanel } from "./properties-panel";

export interface RightPanel {
  element: BUI.Panel;
  onElementSelect: (handler: (modelId: string, localId: number) => void) => void;
  onTypeGroupSelect: (handler: (modelIdMap: OBC.ModelIdMap, typeLabel: string, count: number) => void) => void;
  applySelection: (modelIdMap: OBC.ModelIdMap) => Promise<void>;
  applyTypeSelection: (modelIdMap: OBC.ModelIdMap, typeLabel: string, count: number) => Promise<void>;
  appendSection: (el: HTMLElement) => void;
}

export function createRightPanel(
  components: OBC.Components,
  fragments: OBC.FragmentsManager,
  highlighter: OBF.Highlighter,
): RightPanel {
  const panel = document.createElement("bim-panel") as BUI.Panel;
  panel.label = "Panel";

  const treePanel       = createTreePanel(components, fragments, highlighter);
  const propertiesPanel = createPropertiesPanel(components, fragments);

  panel.append(treePanel.section, propertiesPanel.section);

  // Wire highlighter 3D click → selection
  highlighter.events["select"].onHighlight.add((modelIdMap) => {
    if (!Object.keys(modelIdMap).length) return;
    treePanel.clearTypesSelection();
    applySelection(modelIdMap).catch(console.error);
  });

  const applySelection = async (modelIdMap: OBC.ModelIdMap): Promise<void> => {
    propertiesPanel.updateItemsData({ modelIdMap, emptySelectionWarning: false });
    await propertiesPanel.renderForSelection(modelIdMap);
    propertiesPanel.resetScrollTop();

    const section = propertiesPanel.section;
    section.collapsed = false;
    requestAnimationFrame(() =>
      section.scrollIntoView({ behavior: "smooth", block: "nearest" }),
    );
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

  // Wire tree panel callbacks
  treePanel.onElementClick((modelId, localId) => {
    treePanel.clearTypesSelection();
    applySelection({ [modelId]: new Set([localId]) }).catch(console.error);
  });

  treePanel.onTypeGroupClick((modelIdMap, typeLabel, count) => {
    applyTypeSelection(modelIdMap, typeLabel, count).catch(console.error);
  });

  return {
    element: panel,
    onElementSelect:   (cb) => treePanel.onElementClick(cb),
    onTypeGroupSelect: (cb) => treePanel.onTypeGroupClick(cb),
    applySelection,
    applyTypeSelection,
    appendSection: (el) => panel.append(el),
  };
}
