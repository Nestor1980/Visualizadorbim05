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
      template: `"sidebar viewport right" 1fr / 300px 1fr 370px`,
      elements: { sidebar, viewport, right: rightPanel },
    },
  };

  grid.layout = "main";
  document.body.append(toolbar);
}
