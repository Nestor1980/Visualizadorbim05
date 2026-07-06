import * as BUI from "@thatopen/ui";

export async function setupLayout(
  sidebar: HTMLElement,
  viewport: HTMLElement,
  rightPanel: HTMLElement,
  toolbar: HTMLElement,
  attachLeftResize?: (wrapper: HTMLElement) => void,
  attachRightResize?: (wrapper: HTMLElement) => void,
): Promise<void> {
  const grid = document.createElement("bim-grid") as BUI.Grid<["main"]>;
  document.body.append(grid);
  await new Promise<void>((r) => setTimeout(r, 50));

  grid.layouts = {
    main: {
      template: `"viewport" 1fr / 1fr`,
      elements: { viewport },
    },
  };

  grid.layout = "main";

  document.body.append(
    createOverlayPanel(sidebar, "left", attachLeftResize),
    createOverlayPanel(rightPanel, "right", attachRightResize),
    toolbar,
  );
}

function createOverlayPanel(
  panel: HTMLElement,
  side: "left" | "right",
  attachResize?: (wrapper: HTMLElement) => void,
): HTMLElement {
  const wrapper = document.createElement("div");
  wrapper.className = `panel-overlay panel-${side}`;

  const collapsedIcon = side === "left"
    ? "material-symbols:chevron-right"
    : "material-symbols:chevron-left";
  const expandedIcon = side === "left"
    ? "material-symbols:chevron-left"
    : "material-symbols:chevron-right";

  const toggleBtn = document.createElement("button");
  toggleBtn.className = "panel-toggle";
  toggleBtn.type = "button";
  toggleBtn.setAttribute(
    "aria-label",
    side === "left" ? "Mostrar/ocultar panel izquierdo" : "Mostrar/ocultar panel derecho",
  );

  const icon = document.createElement("bim-icon") as HTMLElement & { icon: string };
  toggleBtn.append(icon);

  const setCollapsed = (collapsed: boolean) => {
    wrapper.classList.toggle("collapsed", collapsed);
    icon.icon = collapsed ? collapsedIcon : expandedIcon;
    toggleBtn.setAttribute("aria-expanded", String(!collapsed));
  };

  // En pantallas estrechas los paneles taparían casi todo el viewport:
  // arrancan colapsados y el usuario los abre bajo demanda.
  setCollapsed(window.matchMedia("(max-width: 1200px)").matches);

  toggleBtn.addEventListener("click", () => {
    setCollapsed(!wrapper.classList.contains("collapsed"));
  });

  if (side === "left") wrapper.append(panel, toggleBtn);
  else wrapper.append(toggleBtn, panel);

  // Cada panel define su propio handle de arrastre (límites de ancho, punto
  // de anclaje) e inserta el nodo en el hueco correcto dentro del wrapper.
  attachResize?.(wrapper);

  return wrapper;
}
