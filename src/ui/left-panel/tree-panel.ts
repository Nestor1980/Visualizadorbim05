import * as OBC from "@thatopen/components";
import * as CUI from "@thatopen/ui-obc";
import * as OBF from "@thatopen/components-front";
import * as FRAGS from "@thatopen/fragments";
import { IFC_LABEL, IFC_ICON } from "../../config/constants";

export type TreeViewMode = "spatial" | "types";

export interface ModelTreeView {
  /** Contiene la tabla espacial y el árbol de tipos; alterna cuál se ve vía setView. */
  element: HTMLElement;
  setView: (view: TreeViewMode) => void;
  getView: () => TreeViewMode;
  onElementClick: (handler: (modelId: string, localId: number) => void) => void;
  onTypeGroupClick: (handler: (modelIdMap: OBC.ModelIdMap, typeLabel: string, count: number) => void) => void;
  clearSelection: () => void;
  dispose: () => void;
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

/** Recorre el árbol crudo (sin compactar) generando, para cada nodo, el
 *  contenido de "Name" y el botón de ojo que va en la columna "Actions"
 *  (ver `tbl.columns` en `createModelTreeView`). Se usa una columna propia
 *  en vez de meter el botón dentro de la celda "Name" porque esa celda se
 *  autoajusta a su contenido: el botón terminaba pegado al texto, en una
 *  posición distinta por fila según el largo del nombre y la indentación,
 *  en vez de quedar alineado en una misma columna a la derecha. `makeToggle`
 *  viene de `createModelTreeView` para poder cerrar sobre el `FragmentsModel`
 *  y el estado de visibilidad compartido. */
function toCompactTree(nodes: any[], makeToggle: (node: any) => HTMLElement | undefined): any[] {
  return nodes.flatMap((node: any) => {
    const name: string    = node.data?.Name ?? "";
    const upperName       = name.toUpperCase();
    const isIfcClass      = /^IFC[A-Z]+$/.test(upperName);
    const hasLocalId      = node.data?.localId !== undefined;

    if (!isIfcClass) {
      if (!hasLocalId) {
        return [{
          data: { ...node.data, Name: nameCell(name, IFC_ICON.model), Actions: "" },
          children: toCompactTree(node.children ?? [], makeToggle),
        }];
      }
      return [{
        data: { ...node.data, Name: node.data.Name, Actions: makeToggle(node) },
        children: toCompactTree(node.children ?? [], makeToggle),
      }];
    }

    if (SKIP_FULL.has(upperName)) {
      return (node.children ?? []).flatMap((inst: any) => toCompactTree(inst.children ?? [], makeToggle));
    }

    if (SKIP_CLASS.has(upperName)) {
      const icon = IFC_ICON[upperName];
      return (node.children ?? []).map((child: any) => ({
        data: { ...child.data, Name: nameCell(child.data?.Name ?? "", icon), Actions: makeToggle(child) },
        children: toCompactTree(child.children ?? [], makeToggle),
      }));
    }

    const cleanLabel = IFC_LABEL[upperName] ?? upperName.replace(/^IFC/, "");
    return [{
      data: { ...node.data, Name: nameCell(cleanLabel, IFC_ICON[upperName]), Actions: makeToggle(node) },
      children: toCompactTree(node.children ?? [], makeToggle),
    }];
  });
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

export function createModelTreeView(
  components: OBC.Components,
  model: FRAGS.FragmentsModel,
  highlighter: OBF.Highlighter,
): ModelTreeView {
  // autoUpdate=false es obligatorio: con el default (true), @thatopen/ui-obc
  // engancha listeners no removibles sobre fragments.list que reconstruyen
  // esta tabla con TODOS los modelos cargados, no solo con el nuestro.
  const [spatialTree, , spatialUtils] = CUI.tables.spatialTree({
    components, models: [model], selectHighlighterName: "select",
  }, false);

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

  /** localIds propios (no de hijos) marcados como ocultos a mano desde el árbol. */
  const hiddenIds = new Set<number>();

  /** Botón de ojo para un nodo del árbol espacial crudo (sin compactar): oculta
   *  o muestra ese elemento y todo lo que cuelga de él (hijos espaciales, o los
   *  miembros de un grupo de tipo) en la escena 3D.
   *
   *  Va en su propia columna "Actions" (ver más abajo), no dentro de la celda
   *  "Name": esa celda vive dentro del shadow DOM de `bim-table`, así que las
   *  clases de global.css (.models-row-action, etc.) no la alcanzan y el botón
   *  quedaba con el estilo por defecto del navegador (cuadrado blanco). Por
   *  eso acá se estilea 100% inline — igual que `nameCell` ya hacía con el
   *  ícono/texto — en vez de depender de una clase externa. */
  function makeVisibilityToggle(node: any): HTMLElement {
    const localId = node.data?.localId as number | undefined;
    const childrenField = node.data?.children as string | undefined;

    const resolveIds = async (): Promise<number[]> => {
      if (typeof localId === "number") {
        const kids = await model.getItemsChildren([localId]);
        return kids.length !== 0 ? kids : [localId];
      }
      if (childrenField) {
        const seeds = JSON.parse(childrenField) as number[];
        const kids = await model.getItemsChildren(seeds);
        return kids.length !== 0 ? kids : seeds;
      }
      return [];
    };

    const btn = document.createElement("button");
    btn.type = "button";
    btn.style.cssText = [
      "display:flex", "align-items:center", "justify-content:center",
      "width:20px", "height:20px", "padding:0", "border:none",
      "background:transparent", "color:inherit", "cursor:pointer",
      "border-radius:4px", "opacity:0.6", "flex-shrink:0",
    ].join(";");
    btn.addEventListener("mouseenter", () => { btn.style.background = "var(--bim-ui_bg-contrast-10)"; btn.style.opacity = "1"; });
    btn.addEventListener("mouseleave", () => { btn.style.background = "transparent"; btn.style.opacity = "0.6"; });
    const icon = document.createElement("bim-icon") as any;
    icon.style.cssText = "font-size:13px";
    const tooltip = document.createElement("bim-tooltip") as any;
    const refresh = () => {
      const hidden = typeof localId === "number" && hiddenIds.has(localId);
      const title = hidden ? "Mostrar" : "Ocultar";
      icon.icon = hidden ? "mdi:eye-off" : "mdi:eye";
      btn.setAttribute("aria-label", title);
      tooltip.textContent = title;
    };
    refresh();
    btn.append(icon, tooltip);
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      const hidden = typeof localId === "number" && hiddenIds.has(localId);
      const ids = await resolveIds();
      if (ids.length === 0) return;
      await model.setVisible(ids, hidden);
      if (typeof localId === "number") {
        if (hidden) hiddenIds.delete(localId); else hiddenIds.add(localId);
      }
      refresh();
    });

    return btn;
  }

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

  // bim-table define "data" como un accesor plano en su propio prototipo (no
  // vía @property() de Lit), pero Lit igual valida en cada performUpdate() que
  // ningún campo reactivo quede "sombreado" por una propiedad own-instance. Si
  // se define "data" con Object.defineProperty directamente sobre la instancia
  // (como hacía la versión anterior de este hook) esa validación lo detecta
  // como class-field-shadowing y lanza un error que aborta el render entero,
  // dejando el shadow DOM vacío para siempre (ver lit.dev/msg/class-field-shadowing).
  // En cambio, loadFunction es un campo plano sin ningún tracking reactivo:
  // envolverlo para aplicar toCompactTree/buildTypesTree sobre el resultado, y
  // dejar que loadData() siga asignando "data" a través de su setter real, es
  // seguro y no dispara esa validación.
  const tbl = spatialTree as any;
  // Columna propia para el botón de ojo (ver makeVisibilityToggle): la celda
  // "Name" se autoajusta a su contenido, así que un botón metido ahí adentro
  // termina en una posición distinta por fila según el largo del texto y la
  // indentación, en vez de alinearse en una misma columna a la derecha. Cada
  // fila arma su grid a partir de este mismo `columns`, así que "Actions" con
  // ancho fijo queda en la misma posición en todas las filas.
  tbl.columns = ["Name", { name: "Actions", width: "1.75rem" }];
  const originalLoadFunction = tbl.loadFunction as (() => Promise<any[]>) | undefined;
  if (originalLoadFunction) {
    tbl.loadFunction = async () => {
      const rawData = await originalLoadFunction();
      const needsTransform = Array.isArray(rawData) && rawData.length > 0
        && rawData.some((n: any) => {
          const name: string = n?.data?.Name ?? "";
          return /^IFC[A-Z]+$/i.test(name) || name.endsWith(".ifc");
        });
      if (needsTransform) buildTypesTree(rawData);
      return needsTransform ? toCompactTree(rawData, makeVisibilityToggle) : rawData;
    };
    // El primer loadData(true), disparado por CUI.tables.spatialTree() al
    // montar la tabla, ya arrancó con la loadFunction original (sin
    // transformar): se relanza acá para que la versión envuelta reemplace ese
    // resultado con el árbol ya compactado.
    tbl.loadData(true);
  }

  // — Spatial tree click —
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

  let currentView: TreeViewMode = "spatial";

  const element = document.createElement("div");
  element.className = "model-tree-container";
  element.append(spatialTree, typesContainer);

  const setView = (view: TreeViewMode) => {
    currentView = view;
    (spatialTree as HTMLElement).style.display = view === "spatial" ? "" : "none";
    typesContainer.style.display = view === "types" ? "" : "none";
  };
  setView("spatial");
  renderTypesTree();

  return {
    element,
    setView,
    getView: () => currentView,
    onElementClick: (cb) => { onElementClickCb = cb; },
    onTypeGroupClick: (cb) => { onTypeGroupClickCb = cb; },
    clearSelection: () => selectTypesRow(null),
    dispose: () => {
      spatialUtils.dispose();
      typesData.clear();
      selectedTypesRow = null;
      onElementClickCb = null;
      onTypeGroupClickCb = null;
    },
  };
}
