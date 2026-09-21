import * as OBC from "@thatopen/components";
import * as CUI from "@thatopen/ui-obc";
import * as BUI from "@thatopen/ui";
import { getPropertySets, getSharedPropertySets } from "../../ifc/properties";
import { isPsetVisible, isPropertyVisible, registerSeen } from "../../ifc/pset-visibility";
import { getIapvPliegoInfo, type PsetLike } from "../../ifc/iapv-pliego";
import { injectCollapsibleStyles, createCollapsible } from "./collapsible";

export interface PropertiesPanel {
  section: BUI.PanelSection;
  updateItemsData: (opts: { modelIdMap: OBC.ModelIdMap; emptySelectionWarning: boolean }) => void;
  renderForSelection: (modelIdMap: OBC.ModelIdMap) => Promise<void>;
  renderForTypeGroup: (modelIdMap: OBC.ModelIdMap, typeLabel: string, count: number) => Promise<void>;
  resetScrollTop: () => void;
}

/** Título/ícono de la solapa. Por defecto es "Información"; la solapa
 *  "Propiedades" reusa este mismo panel con otra etiqueta (ver right-panel/index.ts). */
export interface PropertiesPanelOptions {
  label?: string;
  icon?: string;
}

let filterStylesInjected = false;
function injectFilterStyles(): void {
  if (filterStylesInjected) return;
  filterStylesInjected = true;
  const s = document.createElement("style");
  s.textContent = `
    .info-quick-filter {
      display:flex; align-items:center; gap:6px;
      margin:6px 6px 4px; padding:5px 8px;
      border:1px solid var(--bim-ui_bg-contrast-20); border-radius:6px;
      background:var(--bim-ui_bg-contrast-10); color:var(--bim-ui_bg-contrast-60);
    }
    .info-quick-filter iconify-icon { font-size:13px; flex-shrink:0; }
    .info-quick-filter input {
      flex:1 1 auto; min-width:0; border:none; outline:none;
      background:transparent; color:var(--bim-ui_bg-contrast-100);
      font-family:inherit; font-size:11px;
    }
    .info-quick-filter input::placeholder { color:var(--bim-ui_bg-contrast-40); }
    .info-quick-filter-clear {
      border:none; background:transparent; cursor:pointer; padding:0;
      display:none; align-items:center; color:var(--bim-ui_bg-contrast-60);
    }
    .info-quick-filter.has-value .info-quick-filter-clear { display:inline-flex; }
    .info-pliego-block {
      margin:6px 6px 4px; padding:8px 10px;
      border:1px solid var(--bim-ui_main-base); border-radius:6px;
      background:var(--bim-ui_bg-contrast-10);
    }
    .info-pliego-block .info-pliego-label {
      font-size:10.5px; font-weight:600; text-transform:uppercase;
      letter-spacing:0.02em; color:var(--bim-ui_bg-contrast-60);
    }
    .info-pliego-block .info-pliego-designacion {
      margin-top:4px; font-size:11px; color:var(--bim-ui_bg-contrast-100);
      line-height:1.4;
    }
    .info-pliego-block a {
      display:inline-flex; align-items:center; gap:4px; margin-top:6px;
      font-size:11px; font-weight:600; color:var(--bim-ui_main-base);
      text-decoration:none;
    }
    .info-pliego-block a:hover { text-decoration:underline; }
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

export function createPropertiesPanel(
  components: OBC.Components,
  fragments: OBC.FragmentsManager,
  options: PropertiesPanelOptions = {},
): PropertiesPanel {
  injectCollapsibleStyles();
  injectFilterStyles();

  const [itemsDataTable, updateItemsData] = CUI.tables.itemsData({
    components, modelIdMap: {}, emptySelectionWarning: true,
  });
  // ui-obc 3.4 genera un bim-label vacío para atributos con dataType
  // sin unidad (p. ej. PredefinedType, que Fragments guarda como IFCLABEL).
  // Los textos deben mostrarse directamente; conservar el formato de medidas.
  const formatValue = itemsDataTable.dataTransform.Value;
  itemsDataTable.dataTransform = {
    ...itemsDataTable.dataTransform,
    Value: (value, row) => {
      if (typeof value !== "number") return value == null ? "—" : String(value);
      return formatValue ? formatValue(value, row) : value;
    },
  };
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
  // Al filtrar, mantené visibles los nodos padre (Attributes, cada Pset…) de
  // las filas que matchean, no sólo las filas sueltas.
  itemsDataTable.preserveStructureOnFilter = true;

  let renderGen = 0;

  // Término del filtro rápido del panel. Es una variable de la clausura (no se
  // reinicia en cada render) así que se conserva al pasar de un elemento a
  // otro e incluso al cambiar de modelo — el panel se crea una sola vez.
  let filterTerm = "";
  const matchesFilter = (text: string): boolean =>
    !filterTerm || text.toLowerCase().includes(filterTerm.toLowerCase());

  // Vuelve a dibujar la selección actual con el filtro aplicado (lo setea
  // renderForSelection / renderForTypeGroup al final de cada corrida).
  let reRenderCurrent: (() => void) | null = null;

  // Nombres de Property Sets que el usuario dejó expandidos: se conserva entre
  // selecciones para no tener que volver a abrir las mismas categorías cada vez
  // que se pasa de un elemento a otro.
  const expandedPsets = new Set<string>();

  // — Section —
  const section = document.createElement("bim-panel-section") as BUI.PanelSection;
  section.label     = options.label ?? "Información";
  section.icon      = options.icon ?? "material-symbols:info";
  section.collapsed = true;
  // La solapa "Información" del panel dinámico (right-panel/index.ts) sobreescribe
  // collapsed/fixed para dejar la sección siempre abierta y sin colapsable propio.
  section.fixed     = false;

  // — Filtro rápido: filtra las propiedades (y los Property Sets) por nombre
  //   o valor. Vive fuera de sectionsContainer para no perder el foco cuando
  //   se re-renderiza el contenido, y su valor se conserva entre selecciones. —
  const filterBar = document.createElement("div");
  filterBar.className = "info-quick-filter";
  filterBar.innerHTML = `
    <iconify-icon icon="material-symbols:search"></iconify-icon>
    <input type="text" class="info-quick-filter-input" placeholder="Filtrar propiedades…" spellcheck="false">
    <button type="button" class="info-quick-filter-clear" aria-label="Limpiar filtro">
      <iconify-icon icon="material-symbols:close" style="font-size:13px;"></iconify-icon>
    </button>`;
  const filterInput = filterBar.querySelector<HTMLInputElement>(".info-quick-filter-input")!;
  const filterClear = filterBar.querySelector<HTMLButtonElement>(".info-quick-filter-clear")!;

  // — Bloque destacado del Pliego IAPV: designación de Item/SubItem + link a
  //   la especificación técnica, cuando el elemento los trae (ver
  //   ifc/iapv-pliego.ts). Vive arriba de las secciones de Psets porque es la
  //   info que el inspector en obra necesita primero, no enterrada dentro de
  //   un Pset que puede estar colapsado. —
  const pliegoBlock = document.createElement("div");
  pliegoBlock.className = "info-pliego-block";
  pliegoBlock.style.display = "none";

  /** Actualiza el bloque destacado con los PSets ya obtenidos de un único
   *  elemento; se oculta si no hay designación ni URL de Pliego. No se
   *  muestra en selección múltiple/de tipo (`renderForTypeGroup`): con
   *  elementos de distinto ítem del Pliego no hay un solo valor que mostrar. */
  const updatePliegoBlock = (psets: PsetLike[]): void => {
    const { iapvItem, iapvSubItem, urlPliego } = getIapvPliegoInfo(psets);
    const designacion = iapvSubItem || iapvItem;
    if (!designacion && !urlPliego) {
      pliegoBlock.style.display = "none";
      return;
    }
    pliegoBlock.innerHTML = `
      <div class="info-pliego-label">Especificación técnica — Pliego IAPV</div>
      ${designacion ? `<div class="info-pliego-designacion">${designacion}</div>` : ""}
      ${urlPliego ? `
        <a href="${urlPliego}" target="_blank" rel="noopener noreferrer">
          Ver Pliego <iconify-icon icon="material-symbols:open-in-new" style="font-size:11px;"></iconify-icon>
        </a>` : ""}
    `;
    pliegoBlock.style.display = "";
  };

  const applyFilter = (): void => {
    filterTerm = filterInput.value.trim();
    filterBar.classList.toggle("has-value", filterTerm !== "");
    itemsDataTable.queryString = filterTerm || null;
    reRenderCurrent?.();
  };
  filterInput.addEventListener("input", applyFilter);
  filterClear.addEventListener("click", () => {
    filterInput.value = "";
    applyFilter();
    filterInput.focus();
  });

  // — Contenedor vertical de secciones colapsables —
  const sectionsContainer = document.createElement("div");
  sectionsContainer.style.cssText = "overflow-y:auto;max-height:60vh;";

  // — Sección General (persistente, contiene itemsDataTable) —
  const generalCollapsible = createCollapsible("General", true);
  generalCollapsible.body.append(itemsDataTable);

  sectionsContainer.append(generalCollapsible.wrapper);
  section.append(filterBar, pliegoBlock, sectionsContainer);

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

    let visibleProperties = Object.fromEntries(
      Object.entries(set.properties).filter(([key]) => isPropertyVisible(set.name, key)),
    );
    if (Object.keys(visibleProperties).length === 0) return false;

    // Filtro rápido: si el nombre del Pset matchea se muestra entero; si no,
    // sólo las propiedades cuyo nombre o valor contengan el término.
    if (filterTerm && !matchesFilter(set.name)) {
      visibleProperties = Object.fromEntries(
        Object.entries(visibleProperties).filter(
          ([key, value]) => matchesFilter(key) || matchesFilter(String(value)),
        ),
      );
      if (Object.keys(visibleProperties).length === 0) return false;
    }

    const expanded = filterTerm ? true : expandedPsets.has(set.name);
    const { wrapper, body } = createCollapsible(set.name, expanded, (open) => {
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
    reRenderCurrent = () => { void renderForSelection(modelIdMap); };

    clearPsetSections();
    generalCollapsible.wrapper.style.display = "";
    generalCollapsible.wrapper.classList.add("is-open");

    const entries = Object.entries(modelIdMap);
    const [modelId, ids] = entries[0] ?? [];
    const localId = ids ? [...ids][0] : undefined;

    if (!modelId || localId === undefined) {
      pliegoBlock.style.display = "none";
      return;
    }

    const propertySets = await getPropertySets(modelId, localId, fragments);
    if (myGen !== renderGen) return;

    updatePliegoBlock(propertySets);
    const appendedAny = propertySets.map(appendPsetSection).some(Boolean);
    if (!appendedAny) {
      const { wrapper, body } = createCollapsible("Sin Psets", false);
      renderPlaceholder(
        body,
        filterTerm
          ? `Ninguna propiedad coincide con «${filterTerm}».`
          : propertySets.length > 0
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
    reRenderCurrent = () => { void renderForTypeGroup(modelIdMap, typeLabel, count); };

    clearPsetSections();
    generalCollapsible.wrapper.style.display = "none";
    // Con varios elementos seleccionados no hay un solo IAPV_Item/URL que
    // mostrar (ver nota en updatePliegoBlock) — se oculta hasta volver a una
    // selección de un único elemento.
    pliegoBlock.style.display = "none";

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
      renderPlaceholder(
        body,
        filterTerm
          ? `Ninguna propiedad compartida coincide con «${filterTerm}».`
          : "Los Property Sets compartidos están ocultos (ver Configuración > Propiedades).",
      );
      sectionsContainer.append(wrapper);
    }
  };

  const resetScrollTop = () => {
    sectionsContainer.scrollTop = 0;
  };

  // Recarga la tabla "General" y vuelve a aplicar el filtro rápido — CUI
  // reconstruye la data en cada selección y hay que re-setear queryString.
  const updateItemsDataWithFilter: typeof updateItemsData = (opts) => {
    updateItemsData(opts);
    itemsDataTable.queryString = filterTerm || null;
  };

  return {
    section,
    updateItemsData: updateItemsDataWithFilter,
    renderForSelection,
    renderForTypeGroup,
    resetScrollTop,
  };
}
