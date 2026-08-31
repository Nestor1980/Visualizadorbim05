import { utils, writeFile } from "xlsx";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import type { ComputoTool, ComputoItem } from "../tools/computo-tool";
import { formatMoney } from "./computo-manager";
import { compareItemDesignacion } from "./iapv-order";

const HEADERS = ["Item", "SubItem", "Rubro", "Descripción", "Unidad", "Cantidad", "Precio Unit.", "Importe"];

interface ComputoGroup {
  nombre: string;
  items: ComputoItem[];
}

/** Ordena por la numeración del Pliego (Item, luego SubItem) — mismo criterio
 *  que `sortByIapvOrder` en computo-manager.ts, reimplementado acá para no
 *  acoplar el módulo de exportación al de la tabla. */
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

/** Mismo agrupado que `renderTable` en computo-manager.ts: por numeración de
 *  Item del Pliego si algún ítem trae PSet `IAPV_Item` (con prioridad por
 *  sobre el agrupado por categorías, igual que en computo-manager.ts — ver
 *  comentario ahí), si no por Rubro (sin categorías creadas), o por
 *  Categoría/"Sin categoría" en caso contrario — reimplementado acá en vez de
 *  compartido porque la version de la tabla también carga ids/handlers de
 *  drag & drop que un archivo de exportación no necesita. */
function groupItems(computoTool: ComputoTool): ComputoGroup[] {
  const items = [...computoTool.list.values()];
  const categorias = [...computoTool.categorias.values()];
  const hasIapv = items.some((i) => i.iapvItem);

  if (hasIapv || categorias.length === 0) {
    const byGroup = new Map<string, ComputoItem[]>();
    for (const item of items) {
      const key = hasIapv ? (item.iapvItem || "Sin clasificar") : (item.rubro || "Sin rubro");
      const list = byGroup.get(key) ?? [];
      list.push(item);
      byGroup.set(key, list);
    }
    const groupKeys = hasIapv ? [...byGroup.keys()].sort(compareItemDesignacion) : [...byGroup.keys()];
    return groupKeys.map((nombre) => ({
      nombre,
      items: hasIapv ? sortByIapvOrder(byGroup.get(nombre)!) : byGroup.get(nombre)!,
    }));
  }

  const groups: ComputoGroup[] = categorias.map((cat) => ({
    nombre: cat.nombre,
    items: items.filter((i) => i.categoriaId === cat.id),
  }));
  const sinCategoria = items.filter((i) => !i.categoriaId || !computoTool.categorias.has(i.categoriaId));
  if (sinCategoria.length > 0) groups.push({ nombre: "Sin categoría", items: sinCategoria });
  if (hasIapv) for (const group of groups) group.items = sortByIapvOrder(group.items);
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
    rows.push([group.nombre, "", "", "", "", "", "", ""]);
    for (const item of group.items) {
      rows.push([
        item.iapvItem, item.iapvSubItem, item.rubro, item.descripcion, item.unidad,
        item.cantidad, item.precioUnitario, item.cantidad * item.precioUnitario,
      ]);
    }
  }
  rows.push([]);
  rows.push(["TOTAL", "", "", "", "", "", "", total]);

  const worksheet = utils.aoa_to_sheet(rows);
  worksheet["!cols"] = [
    { wch: 26 }, { wch: 30 }, { wch: 18 }, { wch: 36 }, { wch: 10 }, { wch: 12 }, { wch: 14 }, { wch: 14 },
  ];

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
    body.push([{ content: group.nombre, colSpan: 8, styles: { fontStyle: "bold", fillColor: [235, 235, 235] } }]);
    for (const item of group.items) {
      body.push([
        item.iapvItem,
        item.iapvSubItem,
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
    foot: [["TOTAL", "", "", "", "", "", "", formatMoney(total)]],
    styles: { fontSize: 8 },
    headStyles: { fillColor: [60, 60, 60] },
    footStyles: { fillColor: [235, 235, 235], textColor: [0, 0, 0], fontStyle: "bold" },
  });

  doc.save(`computo-${fileStamp()}.pdf`);
}
