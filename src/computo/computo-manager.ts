import * as BUI from "@thatopen/ui";
import * as OBC from "@thatopen/components";
import type { ComputoTool, ComputoItem, ComputoInstancia } from "../tools/computo-tool";
import { exportComputoToExcel, exportComputoToPdf } from "./computo-export";
import { compareItemDesignacion } from "./iapv-order";
import {
  visibleComputoColumns, subscribeColumns, psetValueKey, type ComputoColumnView,
} from "./computo-columns";
import { createComputoColumnsModal } from "../ui/computo-columns-modal";

export function formatMoney(n: number): string {
  return n.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function escapeHtml(value: string): string {
  const div = document.createElement("div");
  div.textContent = value;
  return div.innerHTML;
}

/** Sección sin nombre asignado por el usuario — bucket por defecto donde caen
 *  los ítems que todavía no se arrastraron a ninguna categoría creada. Se usa
 *  `""` (no null) como su id en el DOM porque los ids reales de categoría
 *  (`categoria-<ts>-<n>`) nunca son vacíos. */
const SIN_CATEGORIA_ID = "";

interface ComputoSection {
  id: string | null;
  nombre: string;
  items: ComputoItem[];
  removable: boolean;
}

/** Suma de cantidades de un grupo de ítems, agrupada por unidad — fallback
 *  para cuando el grupo mezcla magnitudes distintas (ej. "m2" y "un"): en vez
 *  de sumarlas a lo bruto (lo que daría un número sin sentido), se muestran
 *  por separado. Cuando el grupo entero comparte una sola unidad, da un solo
 *  total (ej. "Ventanas: 15 un"). */
function sumByUnidad(items: ComputoItem[]): { unidad: string; cantidad: number }[] {
  const byUnidad = new Map<string, number>();
  for (const item of items) {
    const key = item.unidad || "—";
    byUnidad.set(key, (byUnidad.get(key) ?? 0) + item.cantidad);
  }
  return [...byUnidad.entries()].map(([unidad, cantidad]) => ({ unidad, cantidad }));
}

/** Ordena por la numeración del Pliego (Item, luego SubItem) — los ítems sin
 *  esos PSets (designación vacía) quedan al final, en el orden en que ya
 *  estaban (ver `compareItemDesignacion`, que cae a alfabético si falta el
 *  número). */
function sortByIapvOrder(items: ComputoItem[]): ComputoItem[] {
  return [...items].sort((a, b) => {
    if (!a.iapvItem && !b.iapvItem) return 0;
    if (!a.iapvItem) return 1;
    if (!b.iapvItem) return -1;
    const byItem = compareItemDesignacion(a.iapvItem, b.iapvItem);
    if (byItem !== 0) return byItem;
    return compareItemDesignacion(a.iapvSubItem, b.iapvSubItem);
  });
}

/** Celda (`<td>`) de una fila de ítem para una columna dada — el conjunto y
 *  el orden de columnas visibles los define `computo-columns.ts` (editable
 *  desde el modal "Columnas del Cómputo"). Las columnas fijas son inputs
 *  editables inline; las traídas de un PSet son texto de solo lectura. */
/** Botón que despliega/oculta las instancias de un ítem, con su cantidad al
 *  lado (ej. "4"). Vive en la celda del SubItem — la designación que las
 *  agrupa; si esa columna está oculta, en la de acciones (ver `itemRowHtml`). */
function instanciasToggleHtml(item: ComputoItem, expandida: boolean): string {
  const cantidad = item.elementos.length;
  if (cantidad === 0) return "";
  return `
    <button type="button" class="computo-instancias-toggle${expandida ? " is-expanded" : ""}"
            data-item-id="${item.id}"
            title="${expandida ? "Ocultar" : "Ver"} las ${cantidad} instancias">
      <iconify-icon icon="material-symbols:chevron-right"></iconify-icon>
      <span class="computo-instancias-count">${cantidad}</span>
    </button>`;
}

function itemCellHtml(item: ComputoItem, col: ComputoColumnView, expandida: boolean): string {
  if (col.kind === "pset") {
    const value = item.psetValues[psetValueKey(col.pset ?? "", col.prop ?? "")] ?? "";
    return `<td class="computo-pset-cell" title="${escapeHtml(value)}">${escapeHtml(value)}</td>`;
  }
  switch (col.id) {
    case "iapvItem": {
      // Link a la especificación del Pliego (PSet 'URL del Pliego', ver
      // urlPliego en computo-tool.ts) — mismo dato que ya se muestra como link
      // en el panel de propiedades (properties-panel.ts), acá al lado del Item.
      const pliegoLinkHtml = item.urlPliego
        ? `<a href="${item.urlPliego}" target="_blank" rel="noopener noreferrer" class="computo-pliego-link" title="Ver Pliego">
             <iconify-icon icon="material-symbols:open-in-new"></iconify-icon>
           </a>`
        : "";
      // El contenido con layout propio va en un `<div>` adentro de la celda,
      // NUNCA con `display:flex` sobre el `<td>`: un `<td>` así deja de ser
      // celda de tabla y el navegador envuelve a TODOS los hermanos no-celda
      // contiguos en UNA sola celda anónima — dos columnas de estas seguidas
      // (Item y SubItem) fusionaban sus celdas y corrían toda la fila un lugar
      // respecto de la cabecera.
      return `<td>
        <div class="computo-item-cell">
          <input type="text" class="computo-input" data-field="iapvItem" value="${item.iapvItem}" placeholder="—">
          ${pliegoLinkHtml}
        </div>
      </td>`;
    }
    case "iapvSubItem":
      // El SubItem es la designación del ítem — con el PSet de IAPV, la del
      // Pliego; si no, el nombre del tipo de elemento (ej. "Basic Wall:4.4 De
      // ladrillos"), que es lo que el ítem agrupa. Las instancias de ese tipo
      // se despliegan como filas hijas acá abajo (ver `instanciaRowHtml`), así
      // que el botón que las muestra/oculta vive en esta celda.
      return `<td>
        <div class="computo-subitem-cell">
          ${instanciasToggleHtml(item, expandida)}
          <input type="text" class="computo-input" data-field="iapvSubItem" value="${escapeHtml(item.iapvSubItem)}" placeholder="—">
        </div>
      </td>`;
    case "rubro":
      return `<td><input type="text" class="computo-input" data-field="rubro" value="${item.rubro}" placeholder="Rubro"></td>`;
    case "descripcion":
      return `<td><input type="text" class="computo-input" data-field="descripcion" value="${item.descripcion}" placeholder="Descripción"></td>`;
    case "unidad":
      return `<td><input type="text" class="computo-input" data-field="unidad" value="${item.unidad}"></td>`;
    case "cantidad":
      return `<td><input type="number" class="computo-input" data-field="cantidad" value="${item.cantidad.toFixed(2)}" step="0.01" min="0"></td>`;
    case "precioUnitario":
      return `<td><input type="number" class="computo-input" data-field="precioUnitario" value="${item.precioUnitario}" step="any" min="0"></td>`;
    case "importe":
      return `<td class="computo-num">${formatMoney(item.cantidad * item.precioUnitario)}</td>`;
    default:
      return `<td></td>`;
  }
}

function itemRowHtml(item: ComputoItem, expandida: boolean): string {
  const cols = visibleComputoColumns();
  const cells = cols.map((c) => itemCellHtml(item, c, expandida)).join("");
  // Con la columna SubItem oculta el toggle no tendría dónde ir: se agrega a la
  // celda de acciones para que el detalle por instancia siga siendo accesible.
  const toggleHtml = cols.some((c) => c.id === "iapvSubItem")
    ? ""
    : instanciasToggleHtml(item, expandida);
  return `
    <tr data-item-id="${item.id}" draggable="true">
      ${cells}
      <td class="computo-actions">
        ${toggleHtml}
        <button type="button" class="computo-delete" data-item-id="${item.id}" title="Eliminar">
          <iconify-icon icon="material-symbols:delete-outline"></iconify-icon>
        </button>
      </td>
    </tr>`;
}

/** Columna donde se lista el nombre de cada instancia: la del SubItem, que es
 *  la designación del ítem que las agrupa. Si esa columna está oculta (ver el
 *  modal de Columnas) se usa la primera visible, para que el detalle no quede
 *  sin etiqueta. */
function instanciaLabelColumnId(cols: ComputoColumnView[]): string | undefined {
  return cols.find((c) => c.id === "iapvSubItem")?.id ?? cols[0]?.id;
}

/** Fila hija de un ítem: una instancia concreta (un elemento IFC del modelo)
 *  con su nombre y su magnitud individual. Solo se llenan el nombre y la
 *  cantidad: la unidad es la misma para todas y ya está en la cabeza del grupo
 *  (la fila del ítem), y precio e importe son del ítem — repetirlos acá haría
 *  parecer que el cómputo suma dos veces. No lleva `data-item-id` a propósito:
 *  esas filas son las de ítem (drag & drop entre secciones, borrado). */
function instanciaRowHtml(item: ComputoItem, instancia: ComputoInstancia, indice: number): string {
  const cols = visibleComputoColumns();
  const labelId = instanciaLabelColumnId(cols);
  const cells = cols
    .map((col) => {
      if (col.id === labelId) {
        return `<td class="computo-instancia-name">
          <span title="${escapeHtml(instancia.nombre)}">${escapeHtml(instancia.nombre)}</span>
        </td>`;
      }
      switch (col.id) {
        case "cantidad": return `<td class="computo-num">${formatMoney(instancia.cantidad)}</td>`;
        default:         return `<td></td>`;
      }
    })
    .join("");

  return `
    <tr class="computo-instancia-row">
      ${cells}
      <td class="computo-actions">
        <button type="button" class="computo-instancia-delete"
                data-parent-item="${item.id}"
                data-instancia="${indice}"
                title="Quitar esta instancia del ítem">
          <iconify-icon icon="material-symbols:close"></iconify-icon>
        </button>
      </td>
    </tr>`;
}

/** Fila de espera mientras se leen las instancias del modelo (una vuelta al
 *  worker por elemento, ver `getInstancias` en computo-tool.ts). */
function instanciasLoadingRowHtml(): string {
  return `
    <tr class="computo-instancia-row">
      <td class="computo-instancias-loading" colspan="${visibleComputoColumns().length + 1}">
        Calculando instancias…
      </td>
    </tr>`;
}

/** Si las columnas "Designación de la Obra" (Item/SubItem) visibles forman un
 *  único bloque contiguo, devuelve su posición y largo; si no hay ninguna, o
 *  quedaron separadas por un reordenamiento, devuelve `null` (cabecera plana). */
function designacionRun(cols: ComputoColumnView[]): { start: number; len: number } | null {
  const idxs = cols.map((c, i) => (c.designacion ? i : -1)).filter((i) => i >= 0);
  if (idxs.length === 0) return null;
  const start = idxs[0];
  return idxs.every((v, k) => v === start + k) ? { start, len: idxs.length } : null;
}

/** Cabecera de la tabla. Con un bloque contiguo de Item/SubItem visible usa la
 *  cabecera de dos filas que los agrupa bajo "Designación de la Obra"; si no,
 *  cae a una cabecera de una sola fila. La última `<th>` vacía es la columna
 *  de acciones (botón eliminar). */
function tableHeadHtml(): string {
  const cols = visibleComputoColumns();
  const run = designacionRun(cols);

  if (!run) {
    return `
      <thead>
        <tr>
          ${cols.map((c) => `<th>${escapeHtml(c.label)}</th>`).join("")}
          <th></th>
        </tr>
      </thead>`;
  }

  const row1 = cols
    .map((c, i) => {
      if (i === run.start) return `<th colspan="${run.len}">Designación de la Obra</th>`;
      if (i > run.start && i < run.start + run.len) return "";
      return `<th rowspan="2">${escapeHtml(c.label)}</th>`;
    })
    .join("");
  const row2 = cols
    .slice(run.start, run.start + run.len)
    .map((c) => `<th>${escapeHtml(c.label)}</th>`)
    .join("");

  return `
    <thead>
      <tr>${row1}<th rowspan="2"></th></tr>
      <tr>${row2}</tr>
    </thead>`;
}

/** Colspan para la celda "etiqueta" de las filas de grupo (categoría / rubro):
 *  cubre todas las columnas de datos visibles salvo las dos últimas, que
 *  quedan para subtotal e incidencia. */
function groupLabelColspan(): number {
  return Math.max(1, visibleComputoColumns().length - 2);
}

/** Ancho relativo de la columna de acciones (toggle de instancias / eliminar),
 *  en las mismas unidades "wch" que `excelWidth` — se mezcla con esas para el
 *  reparto proporcional del `<colgroup>` de abajo. */
const ACTIONS_COL_WIDTH = 7;

/** `<colgroup>` con un ancho explícito (%) por columna, proporcional a
 *  `excelWidth` (ya calibrado para las mismas columnas en el export a Excel).
 *  Fija el ancho de cada columna UNA sola vez para toda la tabla — con
 *  `table-layout: fixed` (ver global.css) la cabecera y cada tipo de fila
 *  (ítem, instancia, categoría, "Calculando instancias…") quedan clavadas a
 *  la misma grilla sin importar su contenido ni su colspan.
 *
 *  Sin esto, el ancho de cada columna lo decide el layout automático del
 *  navegador a partir del contenido de TODAS las filas — y esta tabla mezcla
 *  formas de fila muy distintas (categoría con colspan agrupado, fila de
 *  carga con colspan=N+1, nombres de instancia arbitrariamente largos): con
 *  layout automático terminaban resolviendo anchos de columna distintos según
 *  qué filas hubiera en pantalla en ese momento, y la cabecera (que no varía)
 *  quedaba desalineada respecto del cuerpo. */
function colgroupHtml(): string {
  const cols = visibleComputoColumns();
  const total = cols.reduce((sum, c) => sum + c.excelWidth, 0) + ACTIONS_COL_WIDTH;
  const dataColsHtml = cols
    .map((c) => `<col style="width:${((c.excelWidth / total) * 100).toFixed(3)}%">`)
    .join("");
  const actionsColHtml = `<col style="width:${((ACTIONS_COL_WIDTH / total) * 100).toFixed(3)}%">`;
  return `<colgroup>${dataColsHtml}${actionsColHtml}</colgroup>`;
}

function categoriaHeaderHtml(section: ComputoSection, total: number): string {
  const subtotal = section.items.reduce((sum, e) => sum + e.cantidad * e.precioUnitario, 0);
  const incidencia = total > 0 ? (subtotal / total) * 100 : 0;
  const qtysHtml = sumByUnidad(section.items)
    .map(({ unidad, cantidad }) => `<span class="computo-categoria-qty">${formatMoney(cantidad)} ${unidad}</span>`)
    .join("");
  const deleteBtnHtml = section.removable
    ? `<button type="button" class="computo-categoria-delete" data-categoria-id="${section.id}" title="Eliminar sección">
         <iconify-icon icon="material-symbols:delete-outline"></iconify-icon>
       </button>`
    : "";
  const nameHtml = section.removable
    ? `<span class="computo-categoria-name" data-categoria-id="${section.id}" title="Doble click para renombrar">${section.nombre}</span>`
    : `<span class="computo-categoria-name computo-categoria-name--fixed">${section.nombre}</span>`;

  return `
    <tr class="computo-categoria-row">
      <td colspan="${groupLabelColspan()}">
        <div class="computo-categoria-header">
          ${nameHtml}
          <span class="computo-categoria-qtys">${qtysHtml}</span>
        </div>
      </td>
      <td class="computo-num">${formatMoney(subtotal)}</td>
      <td class="computo-num">${incidencia.toFixed(2)}%</td>
      <td class="computo-actions">${deleteBtnHtml}</td>
    </tr>`;
}

/**
 * Solapa "Cómputo": tabla agrupada por Rubro (o, si algún ítem trae PSet
 * `IAPV_Item`, por la numeración del Presupuesto Oficial de IAPV — ver
 * `iapv-order.ts`) con subtotal/% de incidencia por grupo (sin fila de TOTAL
 * general — la exportación sí lo incluye, ver computo-export.ts),
 * alimentada por `ComputoTool` (ver src/tools/computo-tool.ts) — los ítems se
 * crean/editan clickeando elementos en el viewport con esa herramienta
 * activa; acá solo se muestran y se pueden editar inline (Item/SubItem del
 * Pliego, Rubro, Descripción, Unidad, Cantidad, Precio Unitario) o eliminar.
 *
 * Además de la tabla, el botón "Agregar categoría" permite crear secciones
 * manuales (ver `ComputoCategoria` en computo-tool.ts) entre las que se
 * arrastran los renglones — un agrupador ortogonal al Rubro, pensado para que
 * el usuario organice el cómputo como quiera. Mientras no exista ninguna
 * categoría, la tabla se ve exactamente igual que antes (agrupada por
 * Rubro); apenas se crea la primera, la vista pasa a agrupar por categoría
 * (con un bucket "Sin categoría" para lo que no se arrastró todavía) y cada
 * sección muestra la suma de sus cantidades — separada por unidad cuando el
 * grupo mezcla magnitudes distintas, ej. área y cantidad de piezas.
 *
 * Cada sección creada a mano trae un botón de borrar (a la derecha, en la
 * columna de acciones): al eliminarla sus ítems caen a "Sin categoría". Una
 * sección que queda sin ítems (porque se arrastró/borró el último) se elimina
 * sola. El botón "Ordenar categorías" del header las reordena por nombre en
 * orden natural.
 */
export function setupComputoSection(
  computoTool: ComputoTool,
  fragments: OBC.FragmentsManager,
): { pane: HTMLElement } {
  const tableContainer = document.createElement("div");
  tableContainer.className = "computo-table-container";

  /** Id del ítem que se está arrastrando — estado efímero del drag & drop
   *  entre secciones, vive solo mientras dura el gesto. */
  let draggedItemId: string | null = null;

  /** Ítems con el detalle de instancias desplegado (estado de la vista, no del
   *  cómputo: no se guarda con el proyecto). */
  const instanciasExpandidas = new Set<string>();
  /** Instancias ya resueltas por ítem — `renderTable` es sincrónico, así que
   *  el detalle se pide una vez, se guarda acá y se vuelve a renderizar
   *  cuando llega. */
  const instanciasByItem = new Map<string, ComputoInstancia[]>();
  const instanciasPendientes = new Set<string>();

  /** Instancias de un ítem si ya están resueltas; si no, arranca el pedido (y
   *  el render que lo muestre) y devuelve `null` para que la tabla dibuje la
   *  fila de espera. */
  const ensureInstancias = (itemId: string): ComputoInstancia[] | null => {
    const cached = instanciasByItem.get(itemId);
    if (cached) return cached;
    if (!instanciasPendientes.has(itemId)) {
      instanciasPendientes.add(itemId);
      computoTool.getInstancias(itemId)
        .catch((error) => { console.error(error); return [] as ComputoInstancia[]; })
        // Se guarda también el resultado vacío o fallido: si no, el render que
        // dispara este `then` volvería a pedirlas y quedaría en bucle.
        .then((instancias) => {
          instanciasByItem.set(itemId, instancias);
          instanciasPendientes.delete(itemId);
          renderTable();
        });
    }
    return null;
  };

  /** Fila del ítem y, si está desplegado, las de sus instancias. */
  const itemRowsHtml = (item: ComputoItem): string => {
    const expandida = instanciasExpandidas.has(item.id);
    let html = itemRowHtml(item, expandida);
    if (!expandida) return html;
    const instancias = ensureInstancias(item.id);
    if (!instancias) return html + instanciasLoadingRowHtml();
    instancias.forEach((instancia, indice) => { html += instanciaRowHtml(item, instancia, indice); });
    return html;
  };

  const addCategoriaBtn = document.createElement("button");
  addCategoriaBtn.type = "button";
  addCategoriaBtn.className = "computo-add-categoria-btn";
  addCategoriaBtn.innerHTML = `
    <iconify-icon icon="material-symbols:add"></iconify-icon>
    <span>Agregar categoría</span>`;

  // Reordena las categorías por su nombre en orden natural (ver
  // `sortCategorias` en computo-tool.ts) — útil cuando se nombran con un
  // prefijo numérico ("1 Movimiento de suelos", "2 Estructura", …).
  const sortCategoriasBtn = document.createElement("button");
  sortCategoriasBtn.type = "button";
  sortCategoriasBtn.className = "computo-add-categoria-btn";
  sortCategoriasBtn.innerHTML = `
    <iconify-icon icon="material-symbols:sort"></iconify-icon>
    <span>Ordenar categorías</span>`;
  sortCategoriasBtn.addEventListener("click", () => computoTool.sortCategorias());

  // Botón "Columnas" (header de la solapa): abre el modal donde se elige qué
  // columnas ver, en qué orden, y se agregan columnas traídas de un Property
  // Set (ver computo-columns-modal.ts / computo-columns.ts). La tabla se
  // re-renderiza sola vía `subscribeColumns` más abajo.
  const columnsModal = createComputoColumnsModal(fragments);
  const columnsBtn = document.createElement("button");
  columnsBtn.type = "button";
  columnsBtn.className = "computo-add-categoria-btn";
  columnsBtn.innerHTML = `
    <iconify-icon icon="material-symbols:view-column-outline"></iconify-icon>
    <span>Columnas</span>`;
  columnsBtn.addEventListener("click", () => columnsModal.openModal());

  const exportWrap = document.createElement("div");
  exportWrap.className = "computo-export-wrap";
  exportWrap.innerHTML = `
    <button type="button" class="computo-add-categoria-btn computo-export-btn">
      <iconify-icon icon="material-symbols:download"></iconify-icon>
      <span>Exportar cómputo</span>
    </button>
    <div class="computo-export-menu">
      <button type="button" class="computo-export-option" data-format="excel">
        <iconify-icon icon="mdi:file-excel-outline"></iconify-icon>
        <span>Excel (.xlsx)</span>
      </button>
      <button type="button" class="computo-export-option" data-format="pdf">
        <iconify-icon icon="mdi:file-pdf-box"></iconify-icon>
        <span>PDF</span>
      </button>
    </div>`;
  const exportBtn  = exportWrap.querySelector<HTMLButtonElement>(".computo-export-btn")!;
  const exportMenu = exportWrap.querySelector<HTMLElement>(".computo-export-menu")!;

  const closeExportMenu = (): void => exportMenu.classList.remove("is-open");

  exportBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    exportMenu.classList.toggle("is-open");
  });
  document.addEventListener("click", closeExportMenu);
  exportWrap.querySelectorAll<HTMLButtonElement>(".computo-export-option").forEach((btn) => {
    btn.addEventListener("click", () => {
      closeExportMenu();
      if (computoTool.list.size === 0) return;
      // Asincrónicas: leen el detalle por instancia de cada ítem (ver
      // `getInstancias`) para desglosarlo en la planilla / el PDF.
      if (btn.dataset.format === "excel") void exportComputoToExcel(computoTool);
      else void exportComputoToPdf(computoTool);
    });
  });

  const renderTable = (): void => {
    const items = [...computoTool.list.values()];

    if (items.length === 0 && computoTool.categorias.size === 0) {
      tableContainer.innerHTML = `
        <div class="computo-empty">
          Activá la herramienta "Cómputo" en la barra de herramientas y
          seleccioná elementos en el modelo (modo Agregar) para agregar
          ítems acá.
        </div>`;
      return;
    }

    const total = items.reduce((sum, e) => sum + e.cantidad * e.precioUnitario, 0);
    const categorias = [...computoTool.categorias.values()];

    // Si algún ítem trae PSet IAPV_Item, se agrupa/ordena por la numeración
    // del Pliego en vez de por Rubro/Categoría — así el Cómputo generado
    // reproduce el mismo orden y nomenclatura que el Presupuesto Oficial de
    // IAPV. Tiene prioridad por sobre el agrupado por categorías aunque ya
    // existan (la mayoría de los tipos IFC tienen una regla de categoría
    // automática — ver ifc-categoria-rules.ts — así que casi siempre hay
    // categorías creadas de entrada; sin esta prioridad, el agrupado IAPV
    // nunca llegaría a mostrarse en la práctica). Los ítems sin ese PSet
    // (modelos sin la convención IAPV) caen en un bucket "Sin clasificar" al
    // final, para no perder compatibilidad.
    const hasIapv = items.some((i) => i.iapvItem);

    let bodyHtml = "";
    if (hasIapv || categorias.length === 0) {
      const byGroup = new Map<string, ComputoItem[]>();
      for (const item of items) {
        const key = hasIapv ? (item.iapvItem || "Sin clasificar") : (item.rubro || "Sin rubro");
        const list = byGroup.get(key) ?? [];
        list.push(item);
        byGroup.set(key, list);
      }
      const groupKeys = hasIapv
        ? [...byGroup.keys()].sort(compareItemDesignacion)
        : [...byGroup.keys()];
      for (const key of groupKeys) {
        const group = byGroup.get(key)!;
        const subtotal = group.reduce((sum, e) => sum + e.cantidad * e.precioUnitario, 0);
        const incidencia = total > 0 ? (subtotal / total) * 100 : 0;
        bodyHtml += `
          <tr class="computo-rubro-row">
            <td colspan="${groupLabelColspan()}">${key}</td>
            <td class="computo-num">${formatMoney(subtotal)}</td>
            <td class="computo-num">${incidencia.toFixed(2)}%</td>
            <td></td>
          </tr>`;
        const groupItems = hasIapv ? sortByIapvOrder(group) : group;
        for (const item of groupItems) bodyHtml += itemRowsHtml(item);
      }
      bodyHtml = `<tbody class="computo-categoria-section" data-categoria-id="${SIN_CATEGORIA_ID}">${bodyHtml}</tbody>`;
    } else {
      const sections: ComputoSection[] = categorias.map((cat) => ({
        id: cat.id, nombre: cat.nombre, removable: true,
        items: items.filter((i) => i.categoriaId === cat.id),
      }));
      const sinCategoria = items.filter(
        (i) => !i.categoriaId || !computoTool.categorias.has(i.categoriaId),
      );
      sections.push({ id: null, nombre: "Sin categoría", items: sinCategoria, removable: false });

      for (const section of sections) {
        const dropId = section.id ?? SIN_CATEGORIA_ID;
        bodyHtml += `<tbody class="computo-categoria-section" data-categoria-id="${dropId}">`;
        bodyHtml += categoriaHeaderHtml(section, total);
        const sectionItems = hasIapv ? sortByIapvOrder(section.items) : section.items;
        for (const item of sectionItems) bodyHtml += itemRowsHtml(item);
        bodyHtml += `</tbody>`;
      }
    }

    // Detalle de cantidades físicas por unidad (m², m³, ml, un...) — ej.
    // "m2: 245,30" + "un: 42" cuando el cómputo mezcla superficies (paredes
    // con área) y elementos contados por pieza. No se muestra un TOTAL
    // monetario general de la tabla (sí los subtotales por grupo / sección).
    tableContainer.innerHTML = `
      <table class="computo-table">
        ${colgroupHtml()}
        ${tableHeadHtml()}
        ${bodyHtml}
      </table>
      <div class="computo-summary">
        <span class="computo-summary-label">Detalle de cantidades</span>
        ${sumByUnidad(items)
          .map(
            ({ unidad, cantidad }) => `
          <div class="computo-summary-item">
            <span class="computo-summary-value">${formatMoney(cantidad)}</span>
            <span class="computo-summary-unit">${unidad}</span>
          </div>`,
          )
          .join("")}
      </div>`;

    tableContainer.querySelectorAll<HTMLInputElement>(".computo-input").forEach((input) => {
      input.addEventListener("change", () => {
        const id = input.closest("tr")?.getAttribute("data-item-id");
        const field = input.getAttribute("data-field") as
          "rubro" | "descripcion" | "unidad" | "cantidad" | "precioUnitario" | "iapvItem" | "iapvSubItem" | null;
        if (!id || !field) return;
        if (field === "cantidad") {
          const value = parseFloat(input.value);
          const rounded = Number.isFinite(value) ? Math.round(value * 100) / 100 : 0;
          computoTool.updateItem(id, { cantidad: rounded });
        } else if (field === "precioUnitario") {
          const value = parseFloat(input.value);
          computoTool.updateItem(id, { precioUnitario: Number.isFinite(value) ? value : 0 });
        } else if (field === "rubro") {
          computoTool.updateItem(id, { rubro: input.value });
        } else if (field === "descripcion") {
          computoTool.updateItem(id, { descripcion: input.value });
        } else if (field === "unidad") {
          computoTool.updateItem(id, { unidad: input.value });
        } else if (field === "iapvItem") {
          computoTool.updateItem(id, { iapvItem: input.value });
        } else if (field === "iapvSubItem") {
          computoTool.updateItem(id, { iapvSubItem: input.value });
        }
      });
    });

    tableContainer.querySelectorAll<HTMLButtonElement>(".computo-delete").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.getAttribute("data-item-id");
        if (id) computoTool.deleteItem(id);
      });
    });

    tableContainer.querySelectorAll<HTMLButtonElement>(".computo-instancias-toggle").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const id = btn.getAttribute("data-item-id");
        if (!id) return;
        if (instanciasExpandidas.has(id)) instanciasExpandidas.delete(id);
        else instanciasExpandidas.add(id);
        renderTable();
      });
    });

    tableContainer.querySelectorAll<HTMLButtonElement>(".computo-instancia-delete").forEach((btn) => {
      btn.addEventListener("click", () => {
        const itemId = btn.getAttribute("data-parent-item");
        const indice = Number(btn.getAttribute("data-instancia"));
        if (!itemId || !Number.isInteger(indice)) return;
        const instancia = instanciasByItem.get(itemId)?.[indice];
        if (!instancia) return;
        // Quita el elemento del ítem (recalcula su cantidad y, si era el
        // último, borra el ítem) — la tabla se redibuja por `onItemChanged` /
        // `onItemDeleted`.
        computoTool.removeElementFromItem(itemId, instancia.modelId, instancia.localId);
      });
    });

    tableContainer.querySelectorAll<HTMLButtonElement>(".computo-categoria-delete").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.getAttribute("data-categoria-id");
        if (id) computoTool.deleteCategoria(id);
      });
    });

    tableContainer.querySelectorAll<HTMLElement>(".computo-categoria-name[data-categoria-id]").forEach((nameEl) => {
      nameEl.addEventListener("dblclick", (e) => {
        e.stopPropagation();
        const id = nameEl.getAttribute("data-categoria-id");
        if (id) startCategoriaRename(id, nameEl.textContent ?? "", nameEl);
      });
    });

    tableContainer.querySelectorAll<HTMLElement>("tr[data-item-id]").forEach((row) => {
      row.addEventListener("dragstart", (e: DragEvent) => {
        const id = row.getAttribute("data-item-id");
        if (!id) return;
        draggedItemId = id;
        e.dataTransfer?.setData("text/plain", id);
        if (e.dataTransfer) e.dataTransfer.effectAllowed = "move";
        row.classList.add("is-dragging");
      });
      row.addEventListener("dragend", () => {
        draggedItemId = null;
        row.classList.remove("is-dragging");
      });
    });

    tableContainer.querySelectorAll<HTMLElement>(".computo-categoria-section").forEach((tbody) => {
      tbody.addEventListener("dragover", (e: DragEvent) => {
        if (!draggedItemId) return;
        e.preventDefault();
        if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
        tbody.classList.add("is-drop-target");
      });
      tbody.addEventListener("dragleave", () => {
        tbody.classList.remove("is-drop-target");
      });
      tbody.addEventListener("drop", (e: DragEvent) => {
        e.preventDefault();
        tbody.classList.remove("is-drop-target");
        if (!draggedItemId) return;
        const dropId = tbody.getAttribute("data-categoria-id") || "";
        computoTool.moveItemToCategoria(draggedItemId, dropId === SIN_CATEGORIA_ID ? null : dropId);
        draggedItemId = null;
      });
    });
  };

  function startCategoriaRename(id: string, initialValue: string, nameEl: HTMLElement): void {
    const input = document.createElement("input");
    input.type = "text";
    input.className = "computo-categoria-rename-input";
    input.value = initialValue;
    nameEl.replaceWith(input);
    input.focus();
    input.select();

    const commit = () => {
      const value = input.value.trim();
      computoTool.renameCategoria(id, value.length > 0 ? value : initialValue);
    };
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") { e.preventDefault(); commit(); }
      else if (e.key === "Escape") { e.preventDefault(); renderTable(); }
    });
    input.addEventListener("blur", commit);
  }

  addCategoriaBtn.addEventListener("click", () => {
    const categoria = computoTool.addCategoria(`Categoría ${computoTool.categorias.size + 1}`);
    renderTable();
    requestAnimationFrame(() => {
      const nameEl = tableContainer.querySelector<HTMLElement>(
        `.computo-categoria-name[data-categoria-id="${categoria.id}"]`,
      );
      if (nameEl) startCategoriaRename(categoria.id, categoria.nombre, nameEl);
    });
  });

  renderTable();
  computoTool.onItemAdded.add(renderTable);
  // Un cambio de ítem puede mover sus cantidades por instancia (y un cambio de
  // reglas de cuantificación dispara un solo `onItemChanged` por todo el
  // cómputo — ver `scheduleRecomputeAll` en computo-tool.ts), así que se
  // descarta el detalle ya resuelto. Volver a pedirlo es barato: el tool lo
  // tiene cacheado por firma de elementos y no re-lee el modelo si no cambió.
  computoTool.onItemChanged.add(() => {
    instanciasByItem.clear();
    renderTable();
  });
  computoTool.onItemDeleted.add((id) => {
    instanciasExpandidas.delete(id);
    instanciasByItem.delete(id);
    renderTable();
  });
  computoTool.onCategoriaAdded.add(renderTable);
  computoTool.onCategoriaChanged.add(renderTable);
  computoTool.onCategoriaDeleted.add(renderTable);
  // Cambios de columnas (visibilidad, orden, columnas de PSet) desde el modal.
  subscribeColumns(renderTable);

  const pane = BUI.Component.create<HTMLElement>(() => BUI.html`
    <div class="computo-frame">
      <div class="panel-frame-header">
        <bim-icon icon="material-symbols:calculate-outline"></bim-icon>
        <span>Cómputo y Presupuesto</span>
        <div class="computo-header-actions">
          ${addCategoriaBtn}
          ${sortCategoriasBtn}
          ${columnsBtn}
          ${exportWrap}
        </div>
      </div>
      <div class="computo-body">${tableContainer}</div>
    </div>
  `);

  return { pane };
}
