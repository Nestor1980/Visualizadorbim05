// Secciones colapsables verticales compartidas por las solapas del panel
// dinámico (Información, Propiedades, Property Set). El markup y las clases
// `.sel-collapsible*` son idénticos en todas, así que viven acá una sola vez.

let stylesInjected = false;

export function injectCollapsibleStyles(): void {
  if (stylesInjected) return;
  stylesInjected = true;
  const s = document.createElement("style");
  s.textContent = `
    .sel-collapsible { border-bottom:1px solid var(--bim-ui_bg-contrast-20); }
    .sel-collapsible:last-child { border-bottom:none; }
    .sel-collapsible-header {
      width:100%; display:flex; align-items:center; gap:6px;
      padding:8px 6px; border:none; cursor:pointer; text-align:left;
      background:var(--bim-ui_bg-contrast-10); color:var(--bim-ui_bg-contrast-90);
      font-size:11px; font-weight:600; letter-spacing:0.2px;
      font-family:inherit; transition:background 0.15s;
    }
    .sel-collapsible-header:hover { background:var(--bim-ui_bg-contrast-20); }
    .sel-collapsible-chevron {
      display:inline-flex; transition:transform 0.15s; font-size:9px;
      color:var(--bim-ui_bg-contrast-60); flex-shrink:0;
    }
    .sel-collapsible.is-open > .sel-collapsible-header > .sel-collapsible-chevron {
      transform:rotate(90deg);
    }
    .sel-collapsible-body { display:none; padding:4px 2px; }
    .sel-collapsible.is-open > .sel-collapsible-body { display:block; }
  `;
  document.head.append(s);
}

export function createCollapsible(
  label: string,
  expanded: boolean,
  onToggle?: (open: boolean) => void,
): { wrapper: HTMLElement; body: HTMLElement } {
  const wrapper = document.createElement("div");
  wrapper.className = `sel-collapsible${expanded ? " is-open" : ""}`;

  const header = document.createElement("button");
  header.className = "sel-collapsible-header";
  header.innerHTML = `<span class="sel-collapsible-chevron">&#9656;</span><span>${label}</span>`;
  header.addEventListener("click", () => {
    wrapper.classList.toggle("is-open");
    onToggle?.(wrapper.classList.contains("is-open"));
  });

  const body = document.createElement("div");
  body.className = "sel-collapsible-body";

  wrapper.append(header, body);
  return { wrapper, body };
}
