import { createSelectionPanel } from "./right-panel/selection-panel";
import { createSectionPanel } from "./right-panel/section-panel";
import { createLabelPanel } from "./right-panel/label-panel";
import { createDrawPanel } from "./right-panel/draw-panel";
import { createCotaPanel } from "./right-panel/cota-panel";
import { createComputoPanel } from "./right-panel/computo-panel";
import type { SectionTool } from "../tools/section-tool";
import type { WorldLabelTool } from "../tools/world-label-tool";
import type { DrawTool } from "../tools/draw-tool";
import type { CotaTool } from "../tools/cota-tool";
import type { ComputoTool } from "../tools/computo-tool";
import type { SelectionManager } from "../selection/selection-manager";

export type ToolOptionsView = "cota" | "section" | "selection" | "label" | "draw" | "computo" | null;

export interface ToolOptionsPanel {
  element: HTMLElement;
  setView: (view: ToolOptionsView) => void;
}

/**
 * Panel flotante anclado a la esquina del viewport (al estilo del panel de
 * opciones de herramienta de Blender): muestra los ajustes de la herramienta
 * activa y se oculta por completo cuando no hay ninguna seleccionada. Cada
 * bim-panel-section trae su propio header colapsable.
 *
 * La información del elemento seleccionado ya no vive acá: se muestra en la
 * solapa "Información" del panel dinámico de abajo (ver right-panel/index.ts).
 */
export function createToolOptionsPanel(
  selectionManager: SelectionManager,
  sectionTool: SectionTool,
  worldLabelTool: WorldLabelTool,
  drawTool: DrawTool,
  cotaTool: CotaTool,
  computoTool: ComputoTool,
): ToolOptionsPanel {
  const selectionPanel = createSelectionPanel(selectionManager);
  const sectionPanel    = createSectionPanel(sectionTool);
  const labelPanel      = createLabelPanel(worldLabelTool);
  const drawPanel       = createDrawPanel(drawTool);
  const cotaPanel       = createCotaPanel(cotaTool);
  const computoPanel    = createComputoPanel(computoTool);

  const views: Record<Exclude<ToolOptionsView, null>, HTMLElement> = {
    cota:      cotaPanel.element,
    section:   sectionPanel.section,
    selection: selectionPanel.element,
    label:     labelPanel.element,
    draw:      drawPanel.element,
    computo:   computoPanel.element,
  };

  const content = document.createElement("div");
  content.className = "tool-options-panel-content";
  content.append(views.cota, views.section, views.selection, views.label, views.draw, views.computo);

  const resizeHandle = document.createElement("div");
  resizeHandle.className = "tool-options-panel-resize-handle";
  resizeHandle.setAttribute("role", "separator");
  resizeHandle.setAttribute("aria-orientation", "vertical");
  resizeHandle.setAttribute("aria-label", "Redimensionar panel de opciones");

  const element = document.createElement("div");
  element.className = "tool-options-panel";
  element.append(resizeHandle, content);

  const MIN_WIDTH = 260;
  const MAX_WIDTH = 640;

  resizeHandle.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = content.getBoundingClientRect().width;
    resizeHandle.setPointerCapture(event.pointerId);
    document.body.classList.add("resizing-panel");

    const onMove = (moveEvent: PointerEvent) => {
      // El panel queda anclado por `right`, así que el borde arrastrable es
      // el izquierdo: moverlo a la izquierda (startX - clientX > 0) agranda
      // el panel.
      const next = startWidth + (startX - moveEvent.clientX);
      const clamped = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, next));
      content.style.width = `${clamped}px`;
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

  return { element, setView };
}
