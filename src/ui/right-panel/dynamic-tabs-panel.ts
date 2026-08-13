export interface DynamicPanelTab {
  id: string;
  label: string;
  icon: string;
  content: HTMLElement;
  /** Las solapas fijas no se pueden cerrar y siempre quedan primero en el riel. */
  fixed?: boolean;
}

export interface DynamicTabsPanel {
  element: HTMLElement;
  addTab: (tab: DynamicPanelTab) => void;
  removeTab: (id: string) => void;
  activateTab: (id: string) => void;
}

interface TabEntry {
  button: HTMLButtonElement;
  content: HTMLElement;
  fixed: boolean;
}

/**
 * Contenedor con un riel de solapas verticales sobre el borde izquierdo (al
 * estilo del editor de Propiedades de Blender): cada solapa es un ícono que
 * alterna qué contenido se muestra a la derecha. Las solapas fijas (ej.
 * Renderizado) viven siempre en el riel; las dinámicas se agregan/quitan en
 * caliente (ej. el detalle de un topic BCF seleccionado) y se activan solas
 * al añadirse para traer su contenido a primer plano.
 */
export function createDynamicTabsPanel(): DynamicTabsPanel {
  const element = document.createElement("div");
  element.className = "vtabs";

  const rail = document.createElement("div");
  rail.className = "vtabs-rail";

  const content = document.createElement("div");
  content.className = "vtabs-content";

  element.append(rail, content);

  const tabs = new Map<string, TabEntry>();
  let activeId: string | null = null;

  const activateTab = (id: string): void => {
    if (!tabs.has(id)) return;
    activeId = id;
    for (const [tabId, entry] of tabs) {
      const isActive = tabId === id;
      entry.button.classList.toggle("active", isActive);
      entry.content.style.display = isActive ? "" : "none";
    }
  };

  const removeTab = (id: string): void => {
    const entry = tabs.get(id);
    if (!entry) return;
    const wasActive = activeId === id;
    entry.button.remove();
    entry.content.remove();
    tabs.delete(id);
    if (!wasActive) return;
    activeId = null;
    const [fixedId] = [...tabs.entries()].find(([, tab]) => tab.fixed) ?? [];
    const fallbackId = fixedId ?? [...tabs.keys()][0];
    if (fallbackId) activateTab(fallbackId);
  };

  const addTab = (tab: DynamicPanelTab): void => {
    if (tabs.has(tab.id)) removeTab(tab.id);

    const button = document.createElement("button");
    button.type = "button";
    button.className = "vtabs-tab";
    button.title = tab.label;
    const icon = document.createElement("bim-icon") as HTMLElement & { icon: string };
    icon.icon = tab.icon;
    button.append(icon);
    button.addEventListener("click", () => activateTab(tab.id));

    tab.content.style.display = "none";
    content.append(tab.content);

    if (tab.fixed) {
      const firstDynamic = rail.querySelector(".vtabs-tab:not(.is-fixed)");
      rail.insertBefore(button, firstDynamic);
      button.classList.add("is-fixed");
    } else {
      rail.append(button);
    }

    tabs.set(tab.id, { button, content: tab.content, fixed: !!tab.fixed });
    activateTab(tab.id);
  };

  return { element, addTab, removeTab, activateTab };
}
