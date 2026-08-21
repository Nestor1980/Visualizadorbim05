import * as BUI from "@thatopen/ui";
import type { ComputoTool, ComputoItem } from "../tools/computo-tool";
import { exportComputoToExcel, exportComputoToPdf } from "./computo-export";

export function formatMoney(n: number): string {
  return n.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
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

function itemRowHtml(item: ComputoItem): string {
  const importe = item.cantidad * item.precioUnitario;
  return `
    <tr data-item-id="${item.id}" draggable="true">
      <td><input type="text" class="computo-input" data-field="rubro" value="${item.rubro}" placeholder="Rubro"></td>
      <td><input type="text" class="computo-input" data-field="descripcion" value="${item.descripcion}" placeholder="Descripción"></td>
      <td><input type="text" class="computo-input" data-field="unidad" value="${item.unidad}"></td>
      <td><input type="number" class="computo-input" data-field="cantidad" value="${item.cantidad}" step="any" min="0"></td>
      <td><input type="number" class="computo-input" data-field="precioUnitario" value="${item.precioUnitario}" step="any" min="0"></td>
      <td class="computo-num">${formatMoney(importe)}</td>
      <td class="computo-actions">
        <button type="button" class="computo-delete" data-item-id="${item.id}" title="Eliminar">
          <iconify-icon icon="material-symbols:delete-outline"></iconify-icon>
        </button>
      </td>
    </tr>`;
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
      <td colspan="4">
        <div class="computo-categoria-header">
          ${nameHtml}
          <span class="computo-categoria-qtys">${qtysHtml}</span>
          ${deleteBtnHtml}
        </div>
      </td>
      <td class="computo-num">${formatMoney(subtotal)}</td>
      <td class="computo-num">${incidencia.toFixed(2)}%</td>
    </tr>`;
}

/**
 * Solapa "Cómputo": tabla agrupada por Rubro con subtotal/% de incidencia
 * por grupo y TOTAL general, alimentada por `ComputoTool` (ver
 * src/tools/computo-tool.ts) — los ítems se crean/editan clickeando
 * elementos en el viewport con esa herramienta activa; acá solo se muestran
 * y se pueden editar inline (Rubro, Descripción, Unidad, Cantidad, Precio
 * Unitario) o eliminar.
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
 */
export function setupComputoSection(computoTool: ComputoTool): { pane: HTMLElement } {
  const tableContainer = document.createElement("div");
  tableContainer.className = "computo-table-container";

  /** Id del ítem que se está arrastrando — estado efímero del drag & drop
   *  entre secciones, vive solo mientras dura el gesto. */
  let draggedItemId: string | null = null;

  const addCategoriaBtn = document.createElement("button");
  addCategoriaBtn.type = "button";
  addCategoriaBtn.className = "computo-add-categoria-btn";
  addCategoriaBtn.innerHTML = `
    <iconify-icon icon="material-symbols:add"></iconify-icon>
    <span>Agregar categoría</span>`;

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
      if (btn.dataset.format === "excel") exportComputoToExcel(computoTool);
      else exportComputoToPdf(computoTool);
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

    let bodyHtml = "";
    if (categorias.length === 0) {
      // Sin categorías creadas: comportamiento original, agrupado por Rubro.
      const byRubro = new Map<string, ComputoItem[]>();
      for (const item of items) {
        const key = item.rubro || "Sin rubro";
        const list = byRubro.get(key) ?? [];
        list.push(item);
        byRubro.set(key, list);
      }
      for (const [rubro, group] of byRubro) {
        const subtotal = group.reduce((sum, e) => sum + e.cantidad * e.precioUnitario, 0);
        const incidencia = total > 0 ? (subtotal / total) * 100 : 0;
        bodyHtml += `
          <tr class="computo-rubro-row">
            <td colspan="4">${rubro}</td>
            <td class="computo-num">${formatMoney(subtotal)}</td>
            <td class="computo-num">${incidencia.toFixed(2)}%</td>
          </tr>`;
        for (const item of group) bodyHtml += itemRowHtml(item);
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
        for (const item of section.items) bodyHtml += itemRowHtml(item);
        bodyHtml += `</tbody>`;
      }
    }

    // Detalle de cantidades físicas por unidad (m², m³, ml, un...), aparte
    // del TOTAL monetario — ej. "m2: 245,30" + "un: 42" cuando el cómputo
    // mezcla superficies (paredes con área) y elementos contados por pieza.
    tableContainer.innerHTML = `
      <table class="computo-table">
        <thead>
          <tr><th>Rubro</th><th>Descripción</th><th>Unidad</th><th>Cantidad</th><th>Precio Unit.</th><th>Importe</th><th></th></tr>
        </thead>
        ${bodyHtml}
        <tfoot>
          <tr class="computo-total-row">
            <td colspan="5">TOTAL</td>
            <td class="computo-num">${formatMoney(total)}</td>
            <td></td>
          </tr>
        </tfoot>
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
          "rubro" | "descripcion" | "unidad" | "cantidad" | "precioUnitario" | null;
        if (!id || !field) return;
        if (field === "cantidad") {
          const value = parseFloat(input.value);
          computoTool.updateItem(id, { cantidad: Number.isFinite(value) ? value : 0 });
        } else if (field === "precioUnitario") {
          const value = parseFloat(input.value);
          computoTool.updateItem(id, { precioUnitario: Number.isFinite(value) ? value : 0 });
        } else if (field === "rubro") {
          computoTool.updateItem(id, { rubro: input.value });
        } else if (field === "descripcion") {
          computoTool.updateItem(id, { descripcion: input.value });
        } else if (field === "unidad") {
          computoTool.updateItem(id, { unidad: input.value });
        }
      });
    });

    tableContainer.querySelectorAll<HTMLButtonElement>(".computo-delete").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.getAttribute("data-item-id");
        if (id) computoTool.deleteItem(id);
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
  computoTool.onItemChanged.add(renderTable);
  computoTool.onItemDeleted.add(renderTable);
  computoTool.onCategoriaAdded.add(renderTable);
  computoTool.onCategoriaChanged.add(renderTable);
  computoTool.onCategoriaDeleted.add(renderTable);

  const pane = BUI.Component.create<HTMLElement>(() => BUI.html`
    <div class="computo-frame">
      <div class="panel-frame-header">
        <bim-icon icon="material-symbols:calculate-outline"></bim-icon>
        <span>Cómputo y Presupuesto</span>
        ${addCategoriaBtn}
        ${exportWrap}
      </div>
      <div class="computo-body">${tableContainer}</div>
    </div>
  `);

  return { pane };
}
