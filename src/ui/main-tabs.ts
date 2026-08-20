export interface MainTabsPanel {
  /** Contenedor a montar como segundo contenedor horizontal del app shell (el frame de contenido). */
  element: HTMLElement;
  /** Riel de botones de las solapas: se monta en la misma barra superior que
   *  el bim-toolbar de proyecto, a la derecha de sus botones. */
  tabsBar: HTMLElement;
  /** Solapa "Layout": el visualizador completo (bim-grid) se monta acá. */
  layoutPane: HTMLElement;
  /** Se dispara cada vez que la solapa Layout vuelve a quedar visible, para
   *  que el visualizador pueda resincronizar tamaños de renderer/cámara. */
  onLayoutShown: (cb: () => void) => void;
}

interface TabDef {
  id: string;
  label: string;
  icon: string;
}

const TABS: TabDef[] = [
  { id: "layout",    label: "Layout",     icon: "material-symbols:view-in-ar-outline" },
  { id: "bcf-topic", label: "BCF Topic",  icon: "material-symbols:task-outline" },
  { id: "computo",   label: "Cómputo",    icon: "material-symbols:calculate-outline" },
];

function createPlaceholderPane(title: string, description: string): HTMLElement {
  const pane = document.createElement("div");
  pane.className = "main-tab-placeholder";
  pane.innerHTML = `
    <iconify-icon icon="material-symbols:construction-rounded"></iconify-icon>
    <h3>${title}</h3>
    <p>${description}</p>
  `;
  return pane;
}

/**
 * Sistema de solapas horizontales del frame principal: permite alternar qué
 * contenido se muestra (Layout / BCF Topic / Cómputo) sin cerrar el proyecto
 * — las solapas ocultas quedan en el DOM con display:none en vez de
 * desmontarse, así el visualizador (Layout) conserva su estado.
 *
 * El riel de botones (tabsBar) vive en la barra superior, junto al
 * bim-toolbar de proyecto; el contenido (element) es el segundo contenedor
 * horizontal del app shell, debajo de esa barra.
 */
export function createMainTabs(): MainTabsPanel {
  const bar = document.createElement("div");
  bar.className = "main-tabs-bar";

  const content = document.createElement("div");
  content.className = "main-tabs-content";

  const layoutPane = document.createElement("div");
  layoutPane.className = "main-tab-pane";

  const panes = new Map<string, HTMLElement>([
    ["layout", layoutPane],
    ["bcf-topic", createPlaceholderPane("BCF Topic", "Próximamente: gestión de topics BCF en esta solapa.")],
    ["computo", createPlaceholderPane("Cómputo", "Próximamente: tablas de cómputo y costos.")],
  ]);

  for (const pane of panes.values()) {
    pane.classList.add("main-tab-pane");
    content.append(pane);
  }

  const buttons = new Map<string, HTMLButtonElement>();
  const onLayoutShownCbs: Array<() => void> = [];

  const activate = (id: string): void => {
    for (const [tabId, pane] of panes) {
      const isActive = tabId === id;
      pane.style.display = isActive ? "" : "none";
      buttons.get(tabId)?.classList.toggle("active", isActive);
    }
    if (id === "layout") {
      for (const cb of onLayoutShownCbs) cb();
    }
  };

  for (const tab of TABS) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "main-tabs-tab";
    const icon = document.createElement("bim-icon") as HTMLElement & { icon: string };
    icon.icon = tab.icon;
    const label = document.createElement("span");
    label.textContent = tab.label;
    button.append(icon, label);
    button.addEventListener("click", () => activate(tab.id));
    bar.append(button);
    buttons.set(tab.id, button);
  }

  activate("layout");

  return {
    element: content,
    tabsBar: bar,
    layoutPane,
    onLayoutShown: (cb) => onLayoutShownCbs.push(cb),
  };
}
