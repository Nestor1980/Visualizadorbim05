import * as BUI from "@thatopen/ui";
import type { ComputoTool, ComputoItem } from "../tools/computo-tool";

function formatMoney(n: number): string {
  return n.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/**
 * Solapa "Cómputo": tabla agrupada por Rubro con subtotal/% de incidencia
 * por grupo y TOTAL general, alimentada por `ComputoTool` (ver
 * src/tools/computo-tool.ts) — los ítems se crean/editan clickeando
 * elementos en el viewport con esa herramienta activa; acá solo se muestran
 * y se pueden editar inline (Rubro, Descripción, Unidad, Cantidad, Precio
 * Unitario) o eliminar.
 */
export function setupComputoSection(computoTool: ComputoTool): { pane: HTMLElement } {
  const tableContainer = document.createElement("div");
  tableContainer.className = "computo-table-container";

  const renderTable = (): void => {
    const items = [...computoTool.list.values()];

    if (items.length === 0) {
      tableContainer.innerHTML = `
        <div class="computo-empty">
          Activá la herramienta "Cómputo" en la barra de herramientas y
          seleccioná elementos en el modelo (modo Agregar) para agregar
          ítems acá.
        </div>`;
      return;
    }

    const total = items.reduce((sum, e) => sum + e.cantidad * e.precioUnitario, 0);

    const byRubro = new Map<string, ComputoItem[]>();
    for (const item of items) {
      const key = item.rubro || "Sin rubro";
      const list = byRubro.get(key) ?? [];
      list.push(item);
      byRubro.set(key, list);
    }

    let rowsHtml = "";
    for (const [rubro, group] of byRubro) {
      const subtotal = group.reduce((sum, e) => sum + e.cantidad * e.precioUnitario, 0);
      const incidencia = total > 0 ? (subtotal / total) * 100 : 0;
      rowsHtml += `
        <tr class="computo-rubro-row">
          <td colspan="4">${rubro}</td>
          <td class="computo-num">${formatMoney(subtotal)}</td>
          <td class="computo-num">${incidencia.toFixed(2)}%</td>
        </tr>`;
      for (const item of group) {
        const importe = item.cantidad * item.precioUnitario;
        rowsHtml += `
          <tr data-item-id="${item.id}">
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
    }

    // Detalle de cantidades físicas por unidad (m², m³, ml, un...), aparte
    // del TOTAL monetario — ej. "m2: 245,30" + "un: 42" cuando el cómputo
    // mezcla superficies (paredes con área) y elementos contados por pieza.
    const byUnidad = new Map<string, number>();
    for (const item of items) {
      const key = item.unidad || "—";
      byUnidad.set(key, (byUnidad.get(key) ?? 0) + item.cantidad);
    }
    const summaryHtml = [...byUnidad.entries()]
      .map(([unidad, cantidad]) => `
        <div class="computo-summary-item">
          <span class="computo-summary-value">${formatMoney(cantidad)}</span>
          <span class="computo-summary-unit">${unidad}</span>
        </div>`)
      .join("");

    tableContainer.innerHTML = `
      <table class="computo-table">
        <thead>
          <tr><th>Rubro</th><th>Descripción</th><th>Unidad</th><th>Cantidad</th><th>Precio Unit.</th><th>Importe</th><th></th></tr>
        </thead>
        <tbody>${rowsHtml}</tbody>
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
        ${summaryHtml}
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
  };

  renderTable();
  computoTool.onItemAdded.add(renderTable);
  computoTool.onItemChanged.add(renderTable);
  computoTool.onItemDeleted.add(renderTable);

  const pane = BUI.Component.create<HTMLElement>(() => BUI.html`
    <div class="computo-frame">
      <div class="panel-frame-header">
        <bim-icon icon="material-symbols:calculate-outline"></bim-icon>
        <span>Cómputo y Presupuesto</span>
      </div>
      <div class="computo-body">${tableContainer}</div>
    </div>
  `);

  return { pane };
}
