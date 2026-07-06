import * as OBC from "@thatopen/components";
import * as CUI from "@thatopen/ui-obc";
import * as OBF from "@thatopen/components-front";
import * as BUI from "@thatopen/ui";
import { IFC_LABEL, IFC_ICON } from "../../config/constants";

export interface TreePanel {
  section: BUI.PanelSection;
  update: (models: IterableIterator<any>) => void;
  onElementClick: (handler: (modelId: string, localId: number) => void) => void;
  onTypeGroupClick: (handler: (modelIdMap: OBC.ModelIdMap, typeLabel: string, count: number) => void) => void;
  clearTypesSelection: () => void;
}

const SKIP_FULL  = new Set(["IFCPROJECT"]);
const SKIP_CLASS = new Set(["IFCSITE", "IFCBUILDING", "IFCBUILDINGSTOREY"]);

function nameCell(label: string, icon?: string): any {
  if (!icon) return label;
  const wrap = document.createElement("span");
  wrap.style.cssText = "display:inline-flex;align-items:center;gap:5px;overflow:hidden;width:100%";
  const ico = document.createElement("bim-icon") as any;
  ico.icon = icon;
  ico.style.cssText = "font-size:14px;flex-shrink:0;opacity:0.75";
  const txt = document.createElement("span");
  txt.textContent = label;
  txt.style.cssText = "overflow:hidden;text-overflow:ellipsis;white-space:nowrap";
  wrap.append(ico, txt);
  return wrap;
}

function toCompactTree(nodes: any[]): any[] {
  return nodes.flatMap((node: any) => {
    const name: string    = node.data?.Name ?? "";
    const upperName       = name.toUpperCase();
    const isIfcClass      = /^IFC[A-Z]+$/.test(upperName);
    const hasLocalId      = node.data?.localId !== undefined;

    if (!isIfcClass) {
      const cellName = !hasLocalId ? nameCell(name, IFC_ICON.model) : node.data.Name;
      return [{ data: { ...node.data, Name: cellName }, children: toCompactTree(node.children ?? []) }];
    }

    if (SKIP_FULL.has(upperName)) {
      return (node.children ?? []).flatMap((inst: any) => toCompactTree(inst.children ?? []));
    }

    if (SKIP_CLASS.has(upperName)) {
      const icon = IFC_ICON[upperName];
      return (node.children ?? []).map((child: any) => ({
        data: { ...child.data, Name: nameCell(child.data?.Name ?? "", icon) },
        children: toCompactTree(child.children ?? []),
      }));
    }

    const cleanLabel = IFC_LABEL[upperName] ?? upperName.replace(/^IFC/, "");
    return [{
      data: { ...node.data, Name: nameCell(cleanLabel, IFC_ICON[upperName]) },
      children: node.children ?? [],
    }];
  });
}

function makeTreeViewBtn(iconName: string, label: string): HTMLButtonElement {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "tree-view-btn";
  const ico = document.createElement("bim-icon") as any;
  ico.icon = iconName;
  ico.style.fontSize = "13px";
  const lbl = document.createElement("span");
  lbl.textContent = label;
  btn.append(ico, lbl);
  return btn;
}

/** Activa un handler de click también con Enter/Espacio cuando la fila tiene el foco. */
function makeRowAccessible(row: HTMLElement): void {
  row.tabIndex = 0;
  row.setAttribute("role", "button");
  row.addEventListener("keydown", (e: KeyboardEvent) => {
    if (e.target !== row) return;
    if (e.key !== "Enter" && e.key !== " ") return;
    e.preventDefault();
    row.click();
  });
}

export function createTreePanel(
  components: OBC.Components,
  fragments: OBC.FragmentsManager,
  highlighter: OBF.Highlighter,
): TreePanel {
  const [spatialTree, updateSpatialTree] = CUI.tables.spatialTree({
    components, models: fragments.list.values(), selectHighlighterName: "select",
  });

  spatialTree.style.maxHeight = "40vh";
  spatialTree.style.overflowY = "auto";
  spatialTree.style.fontSize  = "11px";

  // — Types tree state —
  const typesData  = new Map<string, { localId: number; modelId: string; name: string }[]>();
  let selectedTypesRow: HTMLElement | null = null;

  const selectTypesRow = (row: HTMLElement | null) => {
    if (selectedTypesRow && selectedTypesRow !== row) {
      selectedTypesRow.classList.remove("is-selected");
    }
    selectedTypesRow = row;
    row?.classList.add("is-selected");
  };

  // — Callbacks set by consumers —
  let onElementClickCb: ((modelId: string, localId: number) => void) | null = null;
  let onTypeGroupClickCb: ((map: OBC.ModelIdMap, typeLabel: string, count: number) => void) | null = null;

  // — Types container —
  const typesContainer = document.createElement("div");
  typesContainer.style.cssText = "max-height:40vh;overflow-y:auto;display:none;";

  const renderTypesTree = (): void => {
    typesContainer.innerHTML = "";

    if (typesData.size === 0) {
      typesContainer.innerHTML =
        `<div class="types-empty">Cargue un modelo IFC para ver los tipos.</div>`;
      return;
    }

    const entries = [...typesData.entries()]
      .filter(([, insts]) => insts.length > 0)
      .sort(([a], [b]) => {
        const la = IFC_LABEL[a] ?? a.replace(/^IFC/, "");
        const lb = IFC_LABEL[b] ?? b.replace(/^IFC/, "");
        return la.localeCompare(lb);
      });

    for (const [category, instances] of entries) {
      const label   = IFC_LABEL[category] ?? category.replace(/^IFC/, "");
      const iconStr = IFC_ICON[category]  ?? "material-symbols:category";

      const catRow = document.createElement("div");
      catRow.className = "types-row types-row--cat";
      makeRowAccessible(catRow);

      const arrow = document.createElement("button");
      arrow.type = "button";
      arrow.className = "types-arrow";
      arrow.setAttribute("aria-label", `Expandir ${label}`);
      arrow.setAttribute("aria-expanded", "false");
      const arrowIcon = document.createElement("bim-icon") as any;
      arrowIcon.icon = "material-symbols:chevron-right";
      arrowIcon.style.fontSize = "12px";
      arrow.append(arrowIcon);

      const catIcon = document.createElement("bim-icon") as any;
      catIcon.icon = iconStr;
      catIcon.className = "types-cat-icon";

      const catLabel = document.createElement("span");
      catLabel.className = "types-cat-label";
      catLabel.textContent = label;

      const catCount = document.createElement("span");
      catCount.className = "types-cat-count";
      catCount.textContent = String(instances.length);

      catRow.append(arrow, catIcon, catLabel, catCount);

      const instsContainer = document.createElement("div");
      instsContainer.style.display = "none";
      let expanded = false;

      arrow.addEventListener("click", (e: Event) => {
        e.stopPropagation();
        expanded = !expanded;
        arrow.classList.toggle("expanded", expanded);
        arrow.setAttribute("aria-expanded", String(expanded));
        instsContainer.style.display = expanded ? "" : "none";
      });

      catRow.addEventListener("click", (e: MouseEvent) => {
        if (arrow.contains(e.target as Node)) return;
        const modelIdMap: OBC.ModelIdMap = {};
        for (const inst of instances) {
          if (!modelIdMap[inst.modelId]) modelIdMap[inst.modelId] = new Set();
          modelIdMap[inst.modelId].add(inst.localId);
        }
        selectTypesRow(catRow);
        highlighter.highlightByID("select", modelIdMap, true, false).catch(console.error);
        onTypeGroupClickCb?.(modelIdMap, label, instances.length);
      });

      for (const inst of instances) {
        const instRow = document.createElement("div");
        instRow.className = "types-row types-row--inst";
        makeRowAccessible(instRow);

        const instLbl = document.createElement("span");
        instLbl.className = "types-inst-label";
        instLbl.textContent = inst.name;
        instRow.append(instLbl);

        instRow.addEventListener("click", () => {
          const map: OBC.ModelIdMap = { [inst.modelId]: new Set([inst.localId]) };
          selectTypesRow(instRow);
          highlighter.highlightByID("select", map, true, false).catch(console.error);
          onElementClickCb?.(inst.modelId, inst.localId);
        });

        instsContainer.append(instRow);
      }

      typesContainer.append(catRow, instsContainer);
    }
  };

  const buildTypesTree = (rawNodes: any[]): void => {
    typesData.clear();
    const walkTree = (nodes: any[]) => {
      for (const node of nodes) {
        const nodeName: string = node.data?.Name ?? "";
        const upper = nodeName.toUpperCase();
        const isIfcClass = /^IFC[A-Z]+$/i.test(upper);
        if (isIfcClass) {
          if (!typesData.has(upper)) typesData.set(upper, []);
          const bucket = typesData.get(upper)!;
          for (const child of node.children ?? []) {
            const localId = child.data?.localId;
            const modelId = child.data?.modelId;
            if (localId === undefined || !modelId) continue;
            const childName =
              typeof child.data.Name === "string"
                ? child.data.Name
                : (child.data.Name as HTMLElement)?.textContent ?? `#${localId}`;
            bucket.push({ localId, modelId, name: childName });
          }
        }
        walkTree(node.children ?? []);
      }
    };
    walkTree(rawNodes);
    renderTypesTree();
  };

  // Intercept CUI's data setter to apply toCompactTree transform
  const tbl = spatialTree as any;
  const tblProto = Object.getPrototypeOf(tbl);
  const originalDescriptor = Object.getOwnPropertyDescriptor(tblProto, "data")
    ?? Object.getOwnPropertyDescriptor(Object.getPrototypeOf(tblProto), "data");

  if (originalDescriptor?.set) {
    Object.defineProperty(tbl, "data", {
      get() { return originalDescriptor.get!.call(this); },
      set(rawData: any[]) {
        const needsTransform = Array.isArray(rawData) && rawData.length > 0
          && rawData.some((n: any) => {
            const name: string = n?.data?.Name ?? "";
            return /^IFC[A-Z]+$/i.test(name) || name.endsWith(".ifc");
          });
        const finalData = needsTransform ? toCompactTree(rawData) : rawData;
        originalDescriptor.set!.call(this, finalData);
        if (needsTransform) {
          requestAnimationFrame(() => { spatialTree.expanded = true; });
          buildTypesTree(rawData);
        }
      },
      configurable: true,
    });
  }

  // — Spatial tree click —
  spatialTree.selectableRows = true;
  spatialTree.addEventListener("click", (event: Event) => {
    const path = event.composedPath();
    const row  = path.find((el: any) => el.tagName === "BIM-TABLE-ROW") as any;
    if (!row?.data) return;
    const modelId = row.data.modelId as string;
    const localId = row.data.localId as number;
    if (!modelId || localId === undefined) return;
    selectTypesRow(null);
    onElementClickCb?.(modelId, localId);
  });

  // — View switcher —
  const section = document.createElement("bim-panel-section") as BUI.PanelSection;
  section.label     = "Estructuras";
  section.icon      = "material-symbols:account-tree";
  section.collapsed = false;

  const switcherBar = document.createElement("div");
  switcherBar.className = "tree-switcher";

  const btnSpatial = makeTreeViewBtn("material-symbols:account-tree", "Espacial");
  const btnTypes   = makeTreeViewBtn("material-symbols:category", "Tipos");
  switcherBar.append(btnSpatial, btnTypes);

  let currentView: "spatial" | "types" = "spatial";

  const switchView = (view: "spatial" | "types") => {
    currentView = view;
    (spatialTree as HTMLElement).style.display = view === "spatial" ? "" : "none";
    typesContainer.style.display = view === "types" ? "" : "none";
    btnSpatial.classList.toggle("active", view === "spatial");
    btnTypes.classList.toggle("active", view === "types");
  };

  btnSpatial.addEventListener("click", () => switchView("spatial"));
  btnTypes.addEventListener("click",   () => switchView("types"));
  switchView("spatial");
  renderTypesTree();

  section.append(switcherBar, spatialTree, typesContainer);

  fragments.list.onItemSet.add(() => {
    updateSpatialTree({ models: fragments.list.values() });
    section.collapsed = false;
  });

  return {
    section,
    update: (models) => updateSpatialTree({ models }),
    onElementClick: (cb) => { onElementClickCb = cb; },
    onTypeGroupClick: (cb) => { onTypeGroupClickCb = cb; },
    clearTypesSelection: () => selectTypesRow(null),
  };
}
