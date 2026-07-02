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

  const collapsedIcon = side === "left" ? "❯" : "❮";
  const expandedIcon  = side === "left" ? "❮" : "❯";

  const handle = document.createElement("button");
  handle.className = "panel-toggle";
  handle.type = "button";
  handle.textContent = expandedIcon;
  handle.setAttribute(
    "aria-label",
    side === "left" ? "Mostrar/ocultar panel izquierdo" : "Mostrar/ocultar panel derecho",
  );

  handle.addEventListener("click", () => {
    const collapsed = wrapper.classList.toggle("collapsed");
    handle.textContent = collapsed ? collapsedIcon : expandedIcon;
  });

  if (side === "left") wrapper.append(panel, handle);
  else wrapper.append(handle, panel);

  return wrapper;
}
