import * as BUI from "@thatopen/ui";

export async function setupLayout(
  sidebar: HTMLElement,
  viewport: HTMLElement,
  rightPanel: HTMLElement,
  toolbar: HTMLElement,
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
    createOverlayPanel(sidebar, "left"),
    createOverlayPanel(rightPanel, "right"),
    toolbar,
  );
}

function createOverlayPanel(panel: HTMLElement, side: "left" | "right"): HTMLElement {
  const wrapper = document.createElement("div");
  wrapper.className = `panel-overlay panel-${side}`;

  const collapsedIcon = side === "left"
    ? "material-symbols:chevron-right"
    : "material-symbols:chevron-left";
  const expandedIcon = side === "left"
    ? "material-symbols:chevron-left"
    : "material-symbols:chevron-right";

  const handle = document.createElement("button");
  handle.className = "panel-toggle";
  handle.type = "button";
  handle.setAttribute(
    "aria-label",
    side === "left" ? "Mostrar/ocultar panel izquierdo" : "Mostrar/ocultar panel derecho",
  );

  const icon = document.createElement("bim-icon") as HTMLElement & { icon: string };
  handle.append(icon);

  const setCollapsed = (collapsed: boolean) => {
    wrapper.classList.toggle("collapsed", collapsed);
    icon.icon = collapsed ? collapsedIcon : expandedIcon;
    handle.setAttribute("aria-expanded", String(!collapsed));
  };

  // En pantallas estrechas los paneles taparían casi todo el viewport:
  // arrancan colapsados y el usuario los abre bajo demanda.
  setCollapsed(window.matchMedia("(max-width: 1200px)").matches);

  handle.addEventListener("click", () => {
    setCollapsed(!wrapper.classList.contains("collapsed"));
  });

  if (side === "left") wrapper.append(panel, handle);
  else wrapper.append(handle, panel);

  return wrapper;
}
