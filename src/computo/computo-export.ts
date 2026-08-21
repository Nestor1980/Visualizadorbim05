import { utils, writeFile } from "xlsx";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import type { ComputoTool, ComputoItem } from "../tools/computo-tool";
import { formatMoney } from "./computo-manager";

const HEADERS = ["Rubro", "Descripción", "Unidad", "Cantidad", "Precio Unit.", "Importe"];

interface ComputoGroup {
  nombre: string;
  items: ComputoItem[];
}

/** Mismo agrupado que `renderTable` en computo-manager.ts (por Rubro sin
 *  categorías creadas, por Categoría/"Sin categoría" en caso contrario) —
 *  reimplementado acá en vez de compartido porque la version de la tabla
 *  también carga ids/handlers de drag & drop que un archivo de exportación
 *  no necesita. */
function groupItems(computoTool: ComputoTool): ComputoGroup[] {
  const items = [...computoTool.list.values()];
  const categorias = [...computoTool.categorias.values()];

  if (categorias.length === 0) {
    const byRubro = new Map<string, ComputoItem[]>();
    for (const item of items) {
      const key = item.rubro || "Sin rubro";
      const list = byRubro.get(key) ?? [];
      list.push(item);
      byRubro.set(key, list);
    }
    return [...byRubro.entries()].map(([nombre, groupItems]) => ({ nombre, items: groupItems }));
  }

  const groups: ComputoGroup[] = categorias.map((cat) => ({
    nombre: cat.nombre,
    items: items.filter((i) => i.categoriaId === cat.id),
  }));
  const sinCategoria = items.filter((i) => !i.categoriaId || !computoTool.categorias.has(i.categoriaId));
  if (sinCategoria.length > 0) groups.push({ nombre: "Sin categoría", items: sinCategoria });
  return groups;
}

function fileStamp(): string {
  return new Date().toISOString().slice(0, 10);
}

export function exportComputoToExcel(computoTool: ComputoTool): void {
  const groups = groupItems(computoTool);
  const total = [...computoTool.list.values()].reduce((sum, i) => sum + i.cantidad * i.precioUnitario, 0);

  const rows: (string | number)[][] = [HEADERS];
  for (const group of groups) {
    if (group.items.length === 0) continue;
    rows.push([group.nombre, "", "", "", "", ""]);
    for (const item of group.items) {
      rows.push([item.rubro, item.descripcion, item.unidad, item.cantidad, item.precioUnitario, item.cantidad * item.precioUnitario]);
    }
  }
  rows.push([]);
  rows.push(["TOTAL", "", "", "", "", total]);

  const worksheet = utils.aoa_to_sheet(rows);
  worksheet["!cols"] = [{ wch: 22 }, { wch: 42 }, { wch: 10 }, { wch: 12 }, { wch: 14 }, { wch: 14 }];

  const workbook = utils.book_new();
  utils.book_append_sheet(workbook, worksheet, "Cómputo");
  writeFile(workbook, `computo-${fileStamp()}.xlsx`);
}

export function exportComputoToPdf(computoTool: ComputoTool): void {
  const groups = groupItems(computoTool);
  const total = [...computoTool.list.values()].reduce((sum, i) => sum + i.cantidad * i.precioUnitario, 0);

  const doc = new jsPDF({ orientation: "landscape" });
  doc.setFontSize(14);
  doc.text("Cómputo y Presupuesto", 14, 14);

  const body: Array<Array<string | number | { content: string; colSpan: number; styles: Record<string, unknown> }>> = [];
  for (const group of groups) {
    if (group.items.length === 0) continue;
    body.push([{ content: group.nombre, colSpan: 6, styles: { fontStyle: "bold", fillColor: [235, 235, 235] } }]);
    for (const item of group.items) {
      body.push([
        item.rubro,
        item.descripcion,
        item.unidad,
        formatMoney(item.cantidad),
        formatMoney(item.precioUnitario),
        formatMoney(item.cantidad * item.precioUnitario),
      ]);
    }
  }

  autoTable(doc, {
    startY: 20,
    head: [HEADERS],
    body: body as unknown as (string | number)[][],
    foot: [["TOTAL", "", "", "", "", formatMoney(total)]],
    styles: { fontSize: 8 },
    headStyles: { fillColor: [60, 60, 60] },
    footStyles: { fillColor: [235, 235, 235], textColor: [0, 0, 0], fontStyle: "bold" },
  });

  doc.save(`computo-${fileStamp()}.pdf`);
}
