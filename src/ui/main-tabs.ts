export interface MainTabsPanel {
  /** Contenedor a montar como segundo contenedor horizontal del app shell (el frame de contenido). */
  element: HTMLElement;
  /** Riel de botones de las solapas: se monta en la misma barra superior que
   *  el bim-toolbar de proyecto, a la derecha de sus botones. */
  tabsBar: HTMLElement;
  /** Solapa "Layout": el visualizador completo (bim-grid) se monta acá. */
  layoutPane: HTMLElement;
  /** Columna izquierda de la solapa "BCF Topic": acá se reubica el mismo
   *  <bim-viewport> de la solapa Layout mientras esta solapa está activa. */
  bcfViewportSlot: HTMLElement;
  /** Se dispara cada vez que la solapa Layout vuelve a quedar visible, para
   *  que el visualizador pueda resincronizar tamaños de renderer/cámara. */
  onLayoutShown: (cb: () => void) => void;
  /** Se dispara cada vez que la solapa BCF Topic vuelve a quedar visible, por
   *  el mismo motivo (el visualizador se reubicó en bcfViewportSlot). */
  onBcfTopicShown: (cb: () => void) => void;
  /** Activa una solapa por id ("layout" | "bcf-topic" | "computo") desde
   *  fuera del sistema de tabs — p. ej. un botón del panel izquierdo que
   *  quiere llevar al usuario directo a la solapa BCF Topic. */
  activateTab: (id: string) => void;
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

const BCF_TABLE_MIN_WIDTH = 280;
const BCF_TABLE_MAX_WIDTH_RATIO = 0.6;

/**
 * Handle de arrastre entre el visualizador y la tabla de la solapa "BCF
 * Topic" — misma receta que attachRightPanelResize (src/ui/right-panel/index.ts):
 * muta una CSS var (--bcf-split-table-w) en vez de tocar el layout a mano,
 * con la escritura throttleada a un frame para no trabar el render del
 * viewport mientras se arrastra. El ancho por defecto (40%, ver .bcf-split-table
 * en global.css) se resuelve a través de esa misma var.
 */
function attachBcfSplitResize(split: HTMLElement, tableEl: HTMLElement): void {
  const handle = document.createElement("div");
  handle.className = "bcf-split-handle";
  handle.setAttribute("role", "separator");
  handle.setAttribute("aria-orientation", "vertical");
  handle.setAttribute("aria-label", "Redimensionar tabla de topics BCF");
  split.insertBefore(handle, tableEl);

  handle.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    const startX = event.clientX;
    const splitWidth = split.getBoundingClientRect().width;
    const startWidth = tableEl.getBoundingClientRect().width;
    handle.setPointerCapture(event.pointerId);
    document.body.classList.add("resizing-panel");

    let pendingX: number | null = null;
    let rafId = 0;

    const applyPending = () => {
      rafId = 0;
      if (pendingX === null) return;
      const next = startWidth - (pendingX - startX);
      const maxWidth = splitWidth * BCF_TABLE_MAX_WIDTH_RATIO;
      const clamped = Math.min(maxWidth, Math.max(BCF_TABLE_MIN_WIDTH, next));
      split.style.setProperty("--bcf-split-table-w", `${clamped}px`);
      pendingX = null;
    };

    const onMove = (moveEvent: PointerEvent) => {
      pendingX = moveEvent.clientX;
      if (!rafId) rafId = requestAnimationFrame(applyPending);
    };
    const onUp = () => {
      if (rafId) cancelAnimationFrame(rafId);
      applyPending();
      handle.releasePointerCapture(event.pointerId);
      document.body.classList.remove("resizing-panel");
      handle.removeEventListener("pointermove", onMove);
      handle.removeEventListener("pointerup", onUp);
    };
    handle.addEventListener("pointermove", onMove);
    handle.addEventListener("pointerup", onUp);
  });
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
 *
 * La solapa "BCF Topic" divide el frame en dos columnas: a la izquierda el
 * mismo visualizador de la solapa Layout (reubicado ahí mientras la solapa
 * está activa — un <bim-viewport> es un único nodo, no se puede duplicar), a
 * la derecha un frame estático con el contenido del modal "BCF Topics"
 * (acciones + tabla), ver bcfTopicsFrame en bcf-manager.ts.
 */
export function createMainTabs(bcfTopicsFrame: HTMLElement, computoPane: HTMLElement): MainTabsPanel {
  const bar = document.createElement("div");
  bar.className = "main-tabs-bar";

  const content = document.createElement("div");
  content.className = "main-tabs-content";

  const layoutPane = document.createElement("div");
  layoutPane.className = "main-tab-pane";

  const bcfViewportSlot = document.createElement("div");
  bcfViewportSlot.className = "bcf-split-viewport";

  const bcfPane = document.createElement("div");
  bcfPane.className = "bcf-split";
  bcfTopicsFrame.classList.add("bcf-split-table");
  bcfPane.append(bcfViewportSlot, bcfTopicsFrame);
  attachBcfSplitResize(bcfPane, bcfTopicsFrame);

  const panes = new Map<string, HTMLElement>([
    ["layout", layoutPane],
    ["bcf-topic", bcfPane],
    ["computo", computoPane],
  ]);

  for (const pane of panes.values()) {
    pane.classList.add("main-tab-pane");
    content.append(pane);
  }

  const buttons = new Map<string, HTMLButtonElement>();
  const onLayoutShownCbs: Array<() => void> = [];
  const onBcfTopicShownCbs: Array<() => void> = [];

  const activate = (id: string): void => {
    for (const [tabId, pane] of panes) {
      const isActive = tabId === id;
      pane.style.display = isActive ? "" : "none";
      buttons.get(tabId)?.classList.toggle("active", isActive);
    }
    if (id === "layout") {
      for (const cb of onLayoutShownCbs) cb();
    } else if (id === "bcf-topic") {
      for (const cb of onBcfTopicShownCbs) cb();
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
    bcfViewportSlot,
    onLayoutShown: (cb) => onLayoutShownCbs.push(cb),
    onBcfTopicShown: (cb) => onBcfTopicShownCbs.push(cb),
    activateTab: activate,
  };
}
