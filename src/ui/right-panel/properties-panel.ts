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

function injectCollapsibleStyles(): void {
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

function createCollapsible(label: string, expanded: boolean): { wrapper: HTMLElement; body: HTMLElement } {
  const wrapper = document.createElement("div");
  wrapper.className = `sel-collapsible${expanded ? " is-open" : ""}`;

  const header = document.createElement("button");
  header.className = "sel-collapsible-header";
  header.innerHTML = `<span class="sel-collapsible-chevron">&#9656;</span><span>${label}</span>`;
  header.addEventListener("click", () => wrapper.classList.toggle("is-open"));

  const body = document.createElement("div");
  body.className = "sel-collapsible-body";

  wrapper.append(header, body);
  return { wrapper, body };
}

export function createPropertiesPanel(
  components: OBC.Components,
  fragments: OBC.FragmentsManager,
): PropertiesPanel {
  injectCollapsibleStyles();

  const [itemsDataTable, updateItemsData] = CUI.tables.itemsData({
    components, modelIdMap: {}, emptySelectionWarning: true,
  });
  (itemsDataTable as HTMLElement).style.maxHeight = "none";
  (itemsDataTable as HTMLElement).style.overflowY = "visible";
  (itemsDataTable as HTMLElement).style.fontSize  = "11px";

  let renderGen = 0;

  // — Section —
  const section = document.createElement("bim-panel-section") as BUI.PanelSection;
  section.label     = "Selection Information";
  section.icon      = "material-symbols:info";
  section.collapsed = true;
  // Fuera de un <bim-panel>, bim-panel-section se autodetecta como "fixed"
  // (sin botón de colapso); lo forzamos a false para que el header siga
  // siendo clickeable cuando este panel flota en el viewport.
  section.fixed     = false;

  // — Contenedor vertical de secciones colapsables —
  const sectionsContainer = document.createElement("div");
  sectionsContainer.style.cssText = "overflow-y:auto;max-height:60vh;";

  // — Sección General (persistente, contiene itemsDataTable) —
  const generalCollapsible = createCollapsible("General", true);
  generalCollapsible.body.append(itemsDataTable);

  sectionsContainer.append(generalCollapsible.wrapper);
  section.append(sectionsContainer);

  const collapseIntoSection = () => {
    section.collapsed = false;
    requestAnimationFrame(() =>
      section.scrollIntoView({ behavior: "smooth", block: "nearest" }),
    );
  };

  const clearPsetSections = () => {
    [...sectionsContainer.children].forEach(child => {
      if (child !== generalCollapsible.wrapper) child.remove();
    });
  };

  const renderPlaceholder = (body: HTMLElement, message: string) => {
    body.innerHTML = `
      <div style="color:var(--bim-ui_bg-contrast-40);font-size:11px;
        text-align:center;padding:20px 8px;line-height:1.5;">${message}</div>`;
  };

  // — Public methods —
  const renderForSelection = async (modelIdMap: OBC.ModelIdMap): Promise<void> => {
    const myGen = ++renderGen;

    clearPsetSections();
    generalCollapsible.wrapper.style.display = "";
    generalCollapsible.wrapper.classList.add("is-open");

    const entries = Object.entries(modelIdMap);
    const [modelId, ids] = entries[0] ?? [];
    const localId = ids ? [...ids][0] : undefined;

    if (!modelId || localId === undefined) return;

    const propertySets = await getPropertySets(modelId, localId, fragments);
    if (myGen !== renderGen) return;

    if (propertySets.length > 0) {
      propertySets.forEach(set => {
        const { wrapper, body } = createCollapsible(set.name, false);
        body.innerHTML = renderPropertiesTable(set.properties);
        sectionsContainer.append(wrapper);
      });
    } else {
      const { wrapper, body } = createCollapsible("Sin Psets", false);
      renderPlaceholder(body, "Este elemento no tiene Property Sets definidos.");
      sectionsContainer.append(wrapper);
    }
  };

  const renderForTypeGroup = async (
    modelIdMap: OBC.ModelIdMap,
    typeLabel: string,
    count: number,
  ): Promise<void> => {
    const myGen = ++renderGen;

    clearPsetSections();
    generalCollapsible.wrapper.style.display = "none";

    const { wrapper: summaryWrapper, body: summaryBody } = createCollapsible("General", true);
    summaryBody.innerHTML = `
      <div style="color:var(--bim-ui_bg-contrast-60);font-size:11px;
        padding:10px 8px;line-height:1.6;">
        <strong style="color:var(--bim-ui_bg-contrast-100);">${count} ${typeLabel}</strong>
        elements selected.<br>
        <span style="opacity:0.7;">Shared property sets are shown below.</span>
      </div>`;
    sectionsContainer.append(summaryWrapper);

    collapseIntoSection();

    const entries = Object.entries(modelIdMap);
    if (!entries.length || myGen !== renderGen) return;
    const [modelId, ids] = entries[0];
    const localIds = [...ids];

    const sharedPsets = await getSharedPropertySets(modelId, localIds, fragments);
    if (myGen !== renderGen) return;

    sharedPsets.forEach(set => {
      const { wrapper, body } = createCollapsible(set.name, false);
      body.innerHTML = renderPropertiesTable(set.properties);
      sectionsContainer.append(wrapper);
    });
  };

  const resetScrollTop = () => {
    sectionsContainer.scrollTop = 0;
  };

  return {
    section,
    updateItemsData,
    renderForSelection,
    renderForTypeGroup,
    resetScrollTop,
  };
}
