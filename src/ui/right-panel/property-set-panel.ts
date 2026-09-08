import * as OBC from "@thatopen/components";
import * as BUI from "@thatopen/ui";
import { getPropertySets } from "../../ifc/properties";
import { injectCollapsibleStyles, createCollapsible } from "./collapsible";

/**
 * Solapa "Property Set" del panel dinámico: lista en crudo TODAS las
 * quantities (área, longitud, volumen, perímetro, espesor…) que viven en los
 * quantity sets IFC (`Qto_*` / `*BaseQuantities`) de los elementos
 * seleccionados. No suma ni computa nada — para eso está la herramienta
 * Cómputo; acá se ve el metadato tal cual lo trae el modelo. Cuando la
 * selección tiene varios elementos, cada propiedad muestra el valor común, el
 * rango `mín – máx` si son numéricos y difieren, o `(varía)` si no.
 */
export interface PropertySetPanel {
  section: BUI.PanelSection;
  renderForSelection: (modelIdMap: OBC.ModelIdMap) => Promise<void>;
  renderForTypeGroup: (modelIdMap: OBC.ModelIdMap, typeLabel: string, count: number) => Promise<void>;
  resetScrollTop: () => void;
}

const isQuantitySet = (name: string): boolean =>
  /^qto_/i.test(name) || /basequantities/i.test(name);

// Tope de elementos que se inspeccionan en una selección grande (un tipo
// entero puede traer cientos de instancias y getPropertySets es async por
// elemento). Mismo criterio de muestreo que getSharedPropertySets.
const SAMPLE_LIMIT = 32;

/** Unidad probable de una quantity a partir de su nombre — las clases
 *  IfcQuantityArea/Volume/Length/Weight del schema son inequívocas y en IFC
 *  van siempre en unidades SI base (m, m², m³, kg). */
function unitFor(name: string): string {
  const n = name.toLowerCase();
  if (n.includes("volume") || n.includes("volumen")) return "m³";
  if (n.includes("area") || n.includes("área") || n.includes("superfic")) return "m²";
  if (n.includes("weight") || n.includes("mass") || n.includes("peso")) return "kg";
  if (
    n.includes("length") || n.includes("perimeter") || n.includes("width") ||
    n.includes("height") || n.includes("depth") || n.includes("thickness") ||
    n.includes("longitud") || n.includes("perimetro") || n.includes("perímetro") ||
    n.includes("ancho") || n.includes("alto") || n.includes("altura") || n.includes("espesor")
  ) return "m";
  return "";
}

const fmtNumber = (value: number): string =>
  Number.isInteger(value) ? String(value) : value.toFixed(3).replace(/\.?0+$/, "");

/** Colapsa la lista de valores crudos (uno por elemento) de una misma
 *  quantity en una sola celda: valor común, rango numérico o `(varía)`. */
function aggregateValues(raws: string[]): string {
  const uniq = [...new Set(raws.map((r) => r.trim()).filter((r) => r !== "" && r !== "—"))];
  if (uniq.length === 0) return "—";
  if (uniq.length === 1) return uniq[0];

  const nums = raws.map((r) => parseFloat(r)).filter((n) => Number.isFinite(n));
  if (nums.length === raws.length) {
    const lo = fmtNumber(Math.min(...nums));
    const hi = fmtNumber(Math.max(...nums));
    return lo === hi ? lo : `${lo} – ${hi}`;
  }
  return "(varía)";
}

function renderTable(rows: { name: string; value: string }[]): string {
  const body = rows.map(({ name, value }) => {
    const unit = unitFor(name);
    const isEmpty = value === "—" || value === "";
    return `
      <tr>
        <td style="
          padding:6px 10px; font-size:10.5px; font-weight:600;
          color:var(--bim-ui_bg-contrast-60); width:52%;
          border-bottom:1px solid var(--bim-ui_bg-contrast-20);
          vertical-align:top; word-break:break-word;
        ">${name}</td>
        <td style="
          padding:6px 10px; font-size:11px; text-align:right; white-space:nowrap;
          color:${isEmpty ? "var(--bim-ui_bg-contrast-40)" : "var(--bim-ui_bg-contrast-100)"};
          border-bottom:1px solid var(--bim-ui_bg-contrast-20);
        ">${value}${unit && !isEmpty ? ` <span style="color:var(--bim-ui_bg-contrast-50);font-size:10px;">${unit}</span>` : ""}</td>
      </tr>`;
  }).join("");
  return `<table style="width:100%;border-collapse:collapse;"><tbody>${body}</tbody></table>`;
}

export function createPropertySetPanel(
  _components: OBC.Components,
  fragments: OBC.FragmentsManager,
): PropertySetPanel {
  injectCollapsibleStyles();

  const section = document.createElement("bim-panel-section") as BUI.PanelSection;
  section.label     = "Property Set";
  section.icon      = "material-symbols:square-foot";
  section.collapsed = false;
  section.fixed     = true;

  const summary = document.createElement("div");
  summary.style.cssText =
    "padding:8px 10px;font-size:10.5px;color:var(--bim-ui_bg-contrast-60);" +
    "border-bottom:1px solid var(--bim-ui_bg-contrast-20);line-height:1.5;";

  const container = document.createElement("div");
  container.style.cssText = "overflow-y:auto;max-height:60vh;";

  section.append(summary, container);

  // Los quantity sets arrancan abiertos; acá se recuerda cuáles cerró el
  // usuario a mano para no volver a abrirlos en la siguiente selección.
  const collapsedSets = new Set<string>();
  let renderGen = 0;

  const showPlaceholder = (message: string): void => {
    container.innerHTML = `
      <div style="color:var(--bim-ui_bg-contrast-40);font-size:11px;
        text-align:center;padding:20px 8px;line-height:1.5;">${message}</div>`;
  };

  const collectPairs = (modelIdMap: OBC.ModelIdMap): { modelId: string; localId: number }[] => {
    const pairs: { modelId: string; localId: number }[] = [];
    for (const [modelId, ids] of Object.entries(modelIdMap)) {
      for (const localId of ids) pairs.push({ modelId, localId });
    }
    return pairs;
  };

  const render = async (modelIdMap: OBC.ModelIdMap, headline: string): Promise<void> => {
    const myGen = ++renderGen;
    const pairs = collectPairs(modelIdMap);

    if (pairs.length === 0) {
      summary.textContent = "";
      showPlaceholder("Seleccioná uno o más elementos para ver sus quantities.");
      return;
    }

    const sample = pairs.slice(0, SAMPLE_LIMIT);
    const psetsPerElement = await Promise.all(
      sample.map((p) => getPropertySets(p.modelId, p.localId, fragments).catch(() => [])),
    );
    if (myGen !== renderGen) return;

    // qsetName → (propName → valores crudos, uno por elemento que la trae)
    const grouped = new Map<string, Map<string, string[]>>();
    for (const psets of psetsPerElement) {
      for (const pset of psets) {
        if (!isQuantitySet(pset.name)) continue;
        let propMap = grouped.get(pset.name);
        if (!propMap) { propMap = new Map(); grouped.set(pset.name, propMap); }
        for (const [prop, value] of Object.entries(pset.properties)) {
          const list = propMap.get(prop) ?? [];
          list.push(value);
          propMap.set(prop, list);
        }
      }
    }

    const sampledNote = pairs.length > sample.length
      ? ` · muestra de ${sample.length} de ${pairs.length}`
      : "";
    summary.textContent = `${headline}${sampledNote}`;

    if (grouped.size === 0) {
      showPlaceholder("La selección no tiene quantity sets IFC (Qto_* / BaseQuantities).");
      return;
    }

    container.innerHTML = "";
    for (const qsetName of [...grouped.keys()].sort((a, b) => a.localeCompare(b, "es"))) {
      const propMap = grouped.get(qsetName)!;
      const rows = [...propMap.entries()]
        .sort((a, b) => a[0].localeCompare(b[0], "es"))
        .map(([name, raws]) => ({ name, value: aggregateValues(raws) }));

      const { wrapper, body } = createCollapsible(
        qsetName,
        !collapsedSets.has(qsetName),
        (open) => { if (open) collapsedSets.delete(qsetName); else collapsedSets.add(qsetName); },
      );
      body.innerHTML = renderTable(rows);
      container.append(wrapper);
    }
  };

  const renderForSelection = (modelIdMap: OBC.ModelIdMap): Promise<void> => {
    const count = collectPairs(modelIdMap).length;
    return render(modelIdMap, `${count} elemento${count === 1 ? "" : "s"} seleccionado${count === 1 ? "" : "s"}`);
  };

  const renderForTypeGroup = (
    modelIdMap: OBC.ModelIdMap,
    typeLabel: string,
    count: number,
  ): Promise<void> => render(modelIdMap, `${count} ${typeLabel}`);

  const resetScrollTop = (): void => { container.scrollTop = 0; };

  return { section, renderForSelection, renderForTypeGroup, resetScrollTop };
}
