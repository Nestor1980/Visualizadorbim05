import * as OBC from "@thatopen/components";
import * as CUI from "@thatopen/ui-obc";
import * as BUI from "@thatopen/ui";
import { getPropertySets, getSharedPropertySets } from "../../ifc/properties";

export interface PropertiesPanel {
  section: BUI.PanelSection;
  updateItemsData: (opts: { modelIdMap: OBC.ModelIdMap; emptySelectionWarning: boolean }) => void;
  renderForSelection: (modelIdMap: OBC.ModelIdMap) => Promise<void>;
  renderForTypeGroup: (modelIdMap: OBC.ModelIdMap, typeLabel: string, count: number) => Promise<void>;
  resetScrollTop: () => void;
}

const TAB_SCROLL_STEP = 120;

function injectTabBarStyles(): void {
  const s = document.createElement("style");
  s.textContent = `
    .sel-tab-bar::-webkit-scrollbar { display:none }
    .sel-tab-nav-btn {
      flex-shrink:0; width:24px; border:none; cursor:pointer;
      background:var(--bim-ui_bg-contrast-20);
      color:var(--bim-ui_bg-contrast-80);
      font-size:13px; line-height:1; display:flex;
      align-items:center; justify-content:center;
      transition:background 0.15s, opacity 0.15s;
      border-radius:3px; margin-bottom:2px;
    }
    .sel-tab-nav-btn:hover { background:var(--bim-ui_bg-contrast-30); }
    .sel-tab-nav-btn:disabled { opacity:0.25; cursor:default; }
  `;
  document.head.append(s);
}

function renderPropertiesTable(properties: Record<string, string>): string {
  const rows = Object.entries(properties).map(([label, value]) => {
    const isEmpty = value === "" || value === "—";
    return `
      <tr>
        <td style="
          padding:6px 10px; font-size:10.5px; font-weight:600;
          color:var(--bim-ui_bg-contrast-60); width:38%;
          border-bottom:1px solid var(--bim-ui_bg-contrast-20);
          vertical-align:top; word-break:break-word;
        ">${label}</td>
        <td style="
          padding:6px 10px; font-size:11px;
          color:${isEmpty ? "var(--bim-ui_bg-contrast-40)" : "var(--bim-ui_bg-contrast-100)"};
          border-bottom:1px solid var(--bim-ui_bg-contrast-20);
          word-break:break-word; line-height:1.45;
        ">${value}</td>
      </tr>`;
  }).join("");
  return `<table style="width:100%;border-collapse:collapse;"><tbody>${rows}</tbody></table>`;
}

export function createPropertiesPanel(
  components: OBC.Components,
  fragments: OBC.FragmentsManager,
): PropertiesPanel {
  injectTabBarStyles();

  const [itemsDataTable, updateItemsData] = CUI.tables.itemsData({
    components, modelIdMap: {}, emptySelectionWarning: true,
  });
  (itemsDataTable as HTMLElement).style.maxHeight = "40vh";
  (itemsDataTable as HTMLElement).style.overflowY = "auto";
  (itemsDataTable as HTMLElement).style.fontSize  = "11px";

  let activeKey     = "general";
  let renderGen     = 0;
  const tabButtons  = new Map<string, HTMLButtonElement>();
  const tabPanels   = new Map<string, HTMLElement>();

  // — Section —
  const section = document.createElement("bim-panel-section") as BUI.PanelSection;
  section.label     = "Selection Information";
  section.icon      = "material-symbols:info";
  section.collapsed = true;

  // — Tab bar wrapper —
  const tabBarWrapper = document.createElement("div");
  tabBarWrapper.style.cssText = [
    "display:flex", "align-items:stretch", "gap:2px",
    "border-bottom:2px solid var(--bim-ui_bg-contrast-20)",
    "margin-bottom:4px", "padding-top:4px",
  ].join(";");

  const btnPrev = document.createElement("button");
  btnPrev.className = "sel-tab-nav-btn";
  btnPrev.innerHTML = "&#8249;";
  btnPrev.title = "Anterior";

  const btnNext = document.createElement("button");
  btnNext.className = "sel-tab-nav-btn";
  btnNext.innerHTML = "&#8250;";
  btnNext.title = "Siguiente";

  const tabBar = document.createElement("div");
  tabBar.classList.add("sel-tab-bar");
  tabBar.style.cssText = [
    "display:flex", "gap:2px", "flex:1",
    "overflow-x:auto", "scroll-behavior:smooth", "scrollbar-width:none",
  ].join(";");

  const updateNavBtns = () => {
    btnPrev.disabled = tabBar.scrollLeft <= 0;
    btnNext.disabled = tabBar.scrollLeft + tabBar.clientWidth >= tabBar.scrollWidth - 1;
    const hasOverflow = tabBar.scrollWidth > tabBar.clientWidth + 2;
    btnPrev.style.display = hasOverflow ? "" : "none";
    btnNext.style.display = hasOverflow ? "" : "none";
  };

  btnPrev.addEventListener("click", () => tabBar.scrollBy({ left: -TAB_SCROLL_STEP, behavior: "smooth" }));
  btnNext.addEventListener("click", () => tabBar.scrollBy({ left:  TAB_SCROLL_STEP, behavior: "smooth" }));
  tabBar.addEventListener("scroll", updateNavBtns);
  tabBarWrapper.append(btnPrev, tabBar, btnNext);

  const tabContent = document.createElement("div");
  tabContent.style.cssText = "overflow-y:auto;max-height:45vh;";

  // — Helpers —
  const createPanel = () => {
    const p = document.createElement("div");
    p.style.cssText = "padding:4px 2px;font-family:inherit;display:none;";
    return p;
  };

  const makeTabBtn = (label: string, key: string): HTMLButtonElement => {
    const btn = document.createElement("button");
    btn.textContent = label;
    btn.dataset.tab = key;
    Object.assign(btn.style, {
      flexShrink: "0",
      padding: "5px 12px", border: "none", cursor: "pointer",
      borderRadius: "4px 4px 0 0", fontSize: "11px", fontWeight: "600",
      letterSpacing: "0.3px", transition: "background 0.15s, color 0.15s, border-color 0.15s",
      background: "var(--bim-ui_bg-contrast-10)",
      color: "var(--bim-ui_bg-contrast-80)",
      borderBottom: "2px solid transparent",
      marginBottom: "-2px",
      fontFamily: "inherit", whiteSpace: "nowrap",
    });
    btn.addEventListener("click", () => activateTab(key));
    return btn;
  };

  const activateTab = (key: string) => {
    activeKey = key;
    tabButtons.forEach((btn, k) => {
      const isActive = k === key;
      Object.assign(btn.style, {
        background:   isActive ? "var(--bim-ui_bg-contrast-20)" : "var(--bim-ui_bg-contrast-10)",
        color:        isActive ? "var(--bim-ui_bg-contrast-100)" : "var(--bim-ui_bg-contrast-80)",
        borderBottom: isActive ? "2px solid var(--bim-ui_accent-base, #6528d7)" : "2px solid transparent",
        fontWeight:   isActive ? "700" : "600",
      });
      if (isActive) btn.scrollIntoView({ behavior: "smooth", inline: "nearest", block: "nearest" });
    });
    tabPanels.forEach((panel, k) => {
      panel.style.display = k === key ? "" : "none";
      if (k === key) panel.scrollTop = 0;
    });
  };

  const clearTabs = () => {
    tabBar.innerHTML = "";
    tabButtons.clear();
    tabPanels.forEach(p => p.remove());
    tabPanels.clear();
    tabContent.innerHTML = "";
  };

  const renderPlaceholder = (panel: HTMLElement, message: string) => {
    panel.innerHTML = `
      <div style="color:var(--bim-ui_bg-contrast-40);font-size:11px;
        text-align:center;padding:20px 8px;line-height:1.5;">${message}</div>`;
  };

  // — General panel (persistent, owns itemsDataTable) —
  const generalPanel = createPanel();
  generalPanel.append(itemsDataTable);
  tabPanels.set("general", generalPanel);

  // Initialize with General tab
  tabBar.append(makeTabBtn("General", "general"));
  tabButtons.set("general", tabBar.lastElementChild as HTMLButtonElement);
  tabContent.append(generalPanel);
  section.append(tabBarWrapper, tabContent);

  const collapseIntoSection = () => {
    section.collapsed = false;
    requestAnimationFrame(() =>
      section.scrollIntoView({ behavior: "smooth", block: "nearest" }),
    );
  };

  // — Public methods —
  const renderForSelection = async (modelIdMap: OBC.ModelIdMap): Promise<void> => {
    const myGen = ++renderGen;
    activeKey = "general";

    clearTabs();

    const genBtn = makeTabBtn("General", "general");
    tabBar.append(genBtn);
    tabButtons.set("general", genBtn);
    generalPanel.style.display = "";
    generalPanel.scrollTop = 0;
    tabContent.append(generalPanel);
    tabPanels.set("general", generalPanel);
    activateTab("general");

    const entries = Object.entries(modelIdMap);
    const [modelId, ids] = entries[0] ?? [];
    const localId = ids ? [...ids][0] : undefined;

    if (!modelId || localId === undefined) return;

    const propertySets = await getPropertySets(modelId, localId, fragments);
    if (myGen !== renderGen) return;

    if (propertySets.length > 0) {
      propertySets.forEach((set, index) => {
        const key   = `pset-${index}-${set.name.replace(/\s+/g, "-")}`;
        const panel = createPanel();
        panel.innerHTML = renderPropertiesTable(set.properties);
        tabContent.append(panel);
        tabPanels.set(key, panel);
        const btn = makeTabBtn(set.name, key);
        tabBar.append(btn);
        tabButtons.set(key, btn);
      });
    } else {
      const placeholder = createPanel();
      renderPlaceholder(placeholder, "Este elemento no tiene Property Sets definidos.");
      tabContent.append(placeholder);
      tabPanels.set("no-psets", placeholder);
      const btn = makeTabBtn("Sin Psets", "no-psets");
      tabBar.append(btn);
      tabButtons.set("no-psets", btn);
    }

    tabPanels.forEach((panel, k) => { panel.style.display = k === "general" ? "" : "none"; });
    requestAnimationFrame(updateNavBtns);
  };

  const renderForTypeGroup = async (
    modelIdMap: OBC.ModelIdMap,
    typeLabel: string,
    count: number,
  ): Promise<void> => {
    const myGen = ++renderGen;
    activeKey = "general";

    clearTabs();

    const summaryPanel = createPanel();
    summaryPanel.innerHTML = `
      <div style="color:var(--bim-ui_bg-contrast-60);font-size:11px;
        padding:10px 8px;line-height:1.6;">
        <strong style="color:var(--bim-ui_bg-contrast-100);">${count} ${typeLabel}</strong>
        elements selected.<br>
        <span style="opacity:0.7;">Shared property sets are shown in the tabs below.</span>
      </div>`;
    tabContent.append(summaryPanel);
    tabPanels.set("general", summaryPanel);
    const genBtn = makeTabBtn("General", "general");
    tabBar.append(genBtn);
    tabButtons.set("general", genBtn);
    activateTab("general");

    collapseIntoSection();

    const entries = Object.entries(modelIdMap);
    if (!entries.length || myGen !== renderGen) return;
    const [modelId, ids] = entries[0];
    const localIds = [...ids];

    const sharedPsets = await getSharedPropertySets(modelId, localIds, fragments);
    if (myGen !== renderGen) return;

    sharedPsets.forEach((set, index) => {
      const key   = `pset-${index}-${set.name.replace(/\s+/g, "-")}`;
      const panel = createPanel();
      panel.innerHTML = renderPropertiesTable(set.properties);
      tabContent.append(panel);
      tabPanels.set(key, panel);
      tabBar.append(makeTabBtn(set.name, key));
      tabButtons.set(key, tabBar.lastElementChild as HTMLButtonElement);
    });

    tabPanels.forEach((panel, k) => { panel.style.display = k === "general" ? "" : "none"; });
    requestAnimationFrame(updateNavBtns);
  };

  const resetScrollTop = () => {
    (itemsDataTable as HTMLElement).scrollTop = 0;
    tabContent.scrollTop = 0;
    generalPanel.scrollTop = 0;
  };

  return {
    section,
    updateItemsData,
    renderForSelection,
    renderForTypeGroup,
    resetScrollTop,
  };
}
