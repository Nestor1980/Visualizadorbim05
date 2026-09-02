import * as OBC from "@thatopen/components";
import * as CUI from "@thatopen/ui-obc";
import * as BUI from "@thatopen/ui";
import { getPropertySets, getSharedPropertySets } from "../../ifc/properties";
import { isPsetVisible, isPropertyVisible, registerSeen } from "../../ifc/pset-visibility";

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

// Propiedades como 'URL del Pliego' (ver public/model_ifc/*.ifc, PSets IAPV)
// traen la especificación técnica del elemento como link — cualquier valor
// con pinta de URL se muestra clickeable en vez de como texto plano, sin
// necesidad de conocer el nombre exacto de la propiedad (además de
// funcionar para 'URL del Pliego', sirve para cualquier otra propiedad URL
// que traiga el modelo).
const URL_PATTERN = /^https?:\/\//i;

function renderPropertiesTable(properties: Record<string, string>): string {
  const rows = Object.entries(properties).map(([label, value]) => {
    const isEmpty = value === "" || value === "—";
    const trimmed = value.trim();
    const isUrl = !isEmpty && URL_PATTERN.test(trimmed);
    const valueHtml = isUrl
      ? `<a href="${trimmed}" target="_blank" rel="noopener noreferrer"
           style="color:var(--bim-ui_main-base);word-break:break-all;">${value}
           <iconify-icon icon="material-symbols:open-in-new" style="font-size:10px;vertical-align:middle;"></iconify-icon>
         </a>`
      : value;
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
        ">${valueHtml}</td>
      </tr>`;
  }).join("");
  return `<table style="width:100%;border-collapse:collapse;"><tbody>${rows}</tbody></table>`;
}

function createCollapsible(
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
  // El nodo raíz de esta tabla trae el ID de la instancia en su label
  // (`Basic Wall:MUR-LHC-200-EXT:1663929`), así que cambia con cada elemento
  // y no hay clave estable para recordar qué expandió el usuario. En lugar de
  // eso la abrimos siempre hasta el primer nivel: el nodo raíz muestra sus
  // hijos (Attributes, cada Pset…) pero esos arrancan colapsados. `expandedLevels`
  // es una prop del propio <bim-table> y sobrevive a los reloads de updateItemsData.
  itemsDataTable.expandedLevels = 1;

  let renderGen = 0;

  // Nombres de Property Sets que el usuario dejó expandidos: se conserva entre
  // selecciones para no tener que volver a abrir las mismas categorías cada vez
  // que se pasa de un elemento a otro.
  const expandedPsets = new Set<string>();

  // — Section —
  const section = document.createElement("bim-panel-section") as BUI.PanelSection;
  section.label     = "Información";
  section.icon      = "material-symbols:info";
  section.collapsed = true;
  // La solapa "Información" del panel dinámico (right-panel/index.ts) sobreescribe
  // collapsed/fixed para dejar la sección siempre abierta y sin colapsable propio.
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

  /** Registra el PSet en el catálogo del Property Set Inspector (ver
   *  pset-visibility.ts) y lo agrega a `sectionsContainer` salvo que el
   *  usuario lo haya ocultado por completo, o que ocultó todas sus
   *  propiedades individuales (una colapsable sin filas no aporta nada). */
  const appendPsetSection = (set: { name: string; properties: Record<string, string> }): boolean => {
    registerSeen(set.name, Object.keys(set.properties));
    if (!isPsetVisible(set.name)) return false;

    const visibleProperties = Object.fromEntries(
      Object.entries(set.properties).filter(([key]) => isPropertyVisible(set.name, key)),
    );
    if (Object.keys(visibleProperties).length === 0) return false;

    const { wrapper, body } = createCollapsible(set.name, expandedPsets.has(set.name), (open) => {
      if (open) expandedPsets.add(set.name);
      else expandedPsets.delete(set.name);
    });
    body.innerHTML = renderPropertiesTable(visibleProperties);
    sectionsContainer.append(wrapper);
    return true;
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

    const appendedAny = propertySets.map(appendPsetSection).some(Boolean);
    if (!appendedAny) {
      const { wrapper, body } = createCollapsible("Sin Psets", false);
      renderPlaceholder(
        body,
        propertySets.length > 0
          ? "Los Property Sets de este elemento están ocultos (ver Configuración > Propiedades)."
          : "Este elemento no tiene Property Sets definidos.",
      );
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

    const appendedAny = sharedPsets.map(appendPsetSection).some(Boolean);
    if (!appendedAny && sharedPsets.length > 0) {
      const { wrapper, body } = createCollapsible("Sin Psets", false);
      renderPlaceholder(body, "Los Property Sets compartidos están ocultos (ver Configuración > Propiedades).");
      sectionsContainer.append(wrapper);
    }
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
