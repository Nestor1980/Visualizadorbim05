import * as BUI from "@thatopen/ui";

const DEFAULT_PANEL_WIDTH = 380;

/**
 * Monta el frame principal como un bim-grid de dos columnas reales
 * ("viewport" | "panel"), misma jerarquía y sin overlay flotante: el panel
 * ocupa una columna propia y redimensionarlo empuja el viewport, en vez de
 * superponerse por encima con position:fixed.
 */
export async function setupLayout(
  viewport: HTMLElement,
  panel: HTMLElement,
  toolbar: HTMLElement,
  attachResize?: (pane: HTMLElement, grid: HTMLElement) => void,
): Promise<void> {
  const grid = document.createElement("bim-grid") as BUI.Grid<["main"]>;
  document.body.append(grid);
  await new Promise<void>((r) => setTimeout(r, 50));

  const pane = createPanelPane(panel, grid, attachResize);

  grid.layouts = {
    main: {
      template: `"viewport panel" 1fr / 1fr var(--panel-w, ${DEFAULT_PANEL_WIDTH}px)`,
      elements: { viewport, panel: pane },
    },
  };

  grid.layout = "main";

  viewport.append(toolbar);
}

function createPanelPane(
  panel: HTMLElement,
  grid: HTMLElement,
  attachResize?: (pane: HTMLElement, grid: HTMLElement) => void,
): HTMLElement {
  const pane = document.createElement("div");
  pane.className = "panel-pane";
  pane.append(panel);

  // El panel inserta su propio handle de arrastre entre el borde y el
  // contenido, y sabe cómo mutar --panel-w en el grid al redimensionar.
  attachResize?.(pane, grid);

  return pane;
}
