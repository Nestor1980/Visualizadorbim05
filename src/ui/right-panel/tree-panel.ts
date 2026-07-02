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
  btn.style.cssText = [
    "flex:1","display:flex","align-items:center","justify-content:center",
    "gap:4px","padding:4px 8px","border:none","cursor:pointer",
    "border-radius:4px","font-size:11px","font-weight:600",
    "background:var(--bim-ui_bg-contrast-10)",
    "color:var(--bim-ui_bg-contrast-60)",
    "transition:background 0.15s,color 0.15s","font-family:inherit",
  ].join(";");
  const ico = document.createElement("bim-icon") as any;
  ico.icon = iconName;
  ico.style.fontSize = "13px";
  const lbl = document.createElement("span");
  lbl.textContent = label;
  btn.append(ico, lbl);
  return btn;
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
      selectedTypesRow.style.background  = "";
      selectedTypesRow.style.outline     = "";
      selectedTypesRow.style.borderLeft  = "";
      selectedTypesRow.style.paddingLeft = "";
      delete (selectedTypesRow as any)._typSel;
    }
    selectedTypesRow = row;
    if (row) {
      row.style.background  = "rgba(101,40,215,0.18)";
      row.style.outline     = "none";
      row.style.borderLeft  = "3px solid rgba(101,40,215,0.85)";
      row.style.paddingLeft = "5px";
      (row as any)._typSel  = true;
    }
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
      typesContainer.innerHTML = `<div style="color:var(--bim-ui_bg-contrast-40);
        font-size:11px;text-align:center;padding:20px 8px;">
        Cargue un modelo IFC para ver los tipos.</div>`;
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
      catRow.style.cssText = [
        "display:flex","align-items:center","gap:5px",
        "padding:5px 8px","cursor:pointer","user-select:none",
        "border-bottom:1px solid var(--bim-ui_bg-contrast-10)",
        "color:var(--bim-ui_bg-contrast-80)",
      ].join(";");
      catRow.addEventListener("mouseenter", () => {
        if (!(catRow as any)._typSel) catRow.style.background = "var(--bim-ui_bg-contrast-10)";
      });
      catRow.addEventListener("mouseleave", () => {
        catRow.style.background = (catRow as any)._typSel ? "rgba(101,40,215,0.18)" : "";
      });

      const arrow = document.createElement("span");
      arrow.textContent = "▶";
      arrow.style.cssText = "font-size:8px;flex-shrink:0;opacity:0.55;transition:transform 0.15s;width:10px;";

      const catIcon = document.createElement("bim-icon") as any;
      catIcon.icon = iconStr;
      catIcon.style.cssText = "font-size:14px;flex-shrink:0;opacity:0.75;";

      const catLabel = document.createElement("span");
      catLabel.style.cssText = "flex:1;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;";
      catLabel.textContent = label;

      const catCount = document.createElement("span");
      catCount.style.cssText = "font-size:10px;opacity:0.45;flex-shrink:0;";
      catCount.textContent = String(instances.length);

      catRow.append(arrow, catIcon, catLabel, catCount);

      const instsContainer = document.createElement("div");
      instsContainer.style.display = "none";
      let expanded = false;

      arrow.addEventListener("click", (e: Event) => {
        e.stopPropagation();
        expanded = !expanded;
        arrow.style.transform = expanded ? "rotate(90deg)" : "";
        instsContainer.style.display = expanded ? "" : "none";
      });

      catRow.addEventListener("click", (e: MouseEvent) => {
        if ((e.target as HTMLElement) === arrow) return;
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
        instRow.style.cssText = [
          "display:flex","align-items:center","gap:5px",
          "padding:3px 8px 3px 30px","cursor:pointer",
          "color:var(--bim-ui_bg-contrast-70)",
          "border-bottom:1px solid var(--bim-ui_bg-contrast-05)",
        ].join(";");
        instRow.addEventListener("mouseenter", () => {
          if (!(instRow as any)._typSel) instRow.style.background = "var(--bim-ui_bg-contrast-10)";
        });
        instRow.addEventListener("mouseleave", () => {
          instRow.style.background = (instRow as any)._typSel ? "rgba(101,40,215,0.18)" : "";
        });

        const instLbl = document.createElement("span");
        instLbl.style.cssText = "overflow:hidden;text-overflow:ellipsis;white-space:nowrap;";
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
  switcherBar.style.cssText = "display:flex;gap:4px;margin-bottom:6px;";

  const btnSpatial = makeTreeViewBtn("material-symbols:account-tree", "Spatial");
  const btnTypes   = makeTreeViewBtn("material-symbols:category", "Types");
  switcherBar.append(btnSpatial, btnTypes);

  let currentView: "spatial" | "types" = "spatial";

  const switchView = (view: "spatial" | "types") => {
    currentView = view;
    (spatialTree as HTMLElement).style.display = view === "spatial" ? "" : "none";
    typesContainer.style.display = view === "types" ? "" : "none";
    [btnSpatial, btnTypes].forEach(btn => {
      const isActive = (view === "spatial" ? btnSpatial : btnTypes) === btn;
      btn.style.background = isActive ? "var(--bim-ui_bg-contrast-20)" : "var(--bim-ui_bg-contrast-10)";
      btn.style.color      = isActive ? "var(--bim-ui_bg-contrast-100)" : "var(--bim-ui_bg-contrast-60)";
    });
  };

  btnSpatial.addEventListener("click", () => switchView("spatial"));
  btnTypes.addEventListener("click",   () => switchView("types"));
  switchView("spatial");

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
