import * as OBC from "@thatopen/components";
import * as OBF from "@thatopen/components-front";

interface DataLayer {
  id: string;
  name: string;
  /** Colección que contiene esta capa; null = suelta (nivel raíz), igual que un modelo sin colección. */
  collectionId: string | null;
  expanded: boolean;
  measurementsExpanded: boolean;
  sectionsExpanded: boolean;
  topicsExpanded: boolean;
  /** Estado del último toggle de visibilidad grupal (no se recalcula desde los miembros). */
  hidden: boolean;
}

type DraggedItem = { kind: "measurement" | "section" | "topic"; id: string } | null;

/**
 * Renderiza filas para el árbol de `models-tree.ts` (Colecciones), que es el
 * único dueño del DOM/árbol combinado. Este módulo solo posee el estado y
 * los ítems que se anidan dentro (o fuera, si está suelta) de cada colección.
 */
export interface DataLayersController {
  renderForCollection: (collectionId: string | null) => HTMLElement[];
  createDataLayer: () => void;
  moveDataLayerTo: (layerId: string, collectionId: string | null) => void;
  onCollectionRemoved: (collectionId: string) => void;
  isDraggingDataLayer: () => string | null;
}

export function createDataLayersTree(
  measurer: OBF.LengthMeasurement,
  clipper: OBC.Clipper,
  topics: OBC.BCFTopics,
  world: OBC.World,
  requestRender: () => void,
  getDefaultCollectionId: () => string,
  onTopicSelect: (topicGuid: string) => void,
  onOpenTopicsTable: () => void,
): DataLayersController {
  const dataLayers: DataLayer[] = [];
  let dataLayerCounter = 0;
  let defaultDataLayerId: string | null = null;

  const measurementName = new Map<string, string>();      // lineId -> nombre editable
  const measurementDataLayer = new Map<string, string>(); // lineId -> dataLayerId
  const planeDataLayer = new Map<string, string>();       // planeId -> dataLayerId
  const topicDataLayer = new Map<string, string>();       // topicGuid -> dataLayerId
  let measurementCounter = 0;
  let sectionCounter = 0;

  let draggedItem: DraggedItem = null;
  let draggedDataLayerId: string | null = null;

  function findLineById(id: string): OBF.Line | undefined {
    for (const line of measurer.list) if (line.id === id) return line;
    return undefined;
  }

  function findDimensionLineById(id: string): OBF.DimensionLine | undefined {
    for (const dimLine of measurer.lines) if (dimLine.line.id === id) return dimLine;
    return undefined;
  }

  function pruneStaleEntries(): void {
    const liveLineIds = new Set([...measurer.list].map((l) => l.id));
    for (const id of [...measurementDataLayer.keys()]) if (!liveLineIds.has(id)) measurementDataLayer.delete(id);
    for (const id of [...measurementName.keys()]) if (!liveLineIds.has(id)) measurementName.delete(id);

    const livePlaneIds = new Set(clipper.list.keys());
    for (const id of [...planeDataLayer.keys()]) if (!livePlaneIds.has(id)) planeDataLayer.delete(id);
  }

  function makeIconButton(icon: string, title: string, onClick: () => void | Promise<void>): HTMLButtonElement {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "models-row-action";
    btn.setAttribute("aria-label", title);
    const ic = document.createElement("bim-icon") as any;
    ic.icon = icon;
    const tooltip = document.createElement("bim-tooltip") as any;
    tooltip.textContent = title;
    btn.append(ic, tooltip);
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      onClick();
    });
    return btn;
  }

  function startRename(initialValue: string, nameEl: HTMLElement, onCommit: (value: string) => void): void {
    const input = document.createElement("input");
    input.type = "text";
    input.className = "collection-rename-input";
    input.value = initialValue;
    nameEl.replaceWith(input);
    input.focus();
    input.select();

    const commit = () => {
      const value = input.value.trim();
      onCommit(value.length > 0 ? value : initialValue);
      requestRender();
    };
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") { e.preventDefault(); commit(); }
      else if (e.key === "Escape") { e.preventDefault(); requestRender(); }
    });
    input.addEventListener("blur", commit);
  }

  function renderMeasurementRow(lineId: string): HTMLElement {
    const line = findLineById(lineId);
    const dimLine = findDimensionLineById(lineId);
    const name = measurementName.get(lineId) ?? lineId;
    const hidden = dimLine ? !dimLine.visible : false;

    const row = document.createElement("div");
    row.className = "models-row models-row--nested data-layer-item-row";
    row.draggable = true;
    row.addEventListener("dragstart", (e: DragEvent) => {
      draggedItem = { kind: "measurement", id: lineId };
      e.dataTransfer?.setData("text/plain", lineId);
      if (e.dataTransfer) e.dataTransfer.effectAllowed = "move";
      row.classList.add("is-dragging");
    });
    row.addEventListener("dragend", () => {
      draggedItem = null;
      row.classList.remove("is-dragging");
    });

    const icon = document.createElement("bim-icon") as any;
    icon.icon = "solar:ruler-bold";
    icon.className = "models-row-icon";

    const label = document.createElement("span");
    label.className = "models-row-name";
    label.textContent = line ? `${name} — ${line.value.toFixed(2)} ${line.units}` : name;
    label.addEventListener("dblclick", (e) => {
      e.stopPropagation();
      startRename(name, label, (value) => measurementName.set(lineId, value));
    });

    const actions = document.createElement("div");
    actions.className = "models-row-actions";

    const eyeBtn = makeIconButton(hidden ? "mdi:eye-off" : "mdi:eye", hidden ? "Mostrar" : "Ocultar", () => {
      if (dimLine) dimLine.visible = !dimLine.visible;
      requestRender();
    });
    const deleteBtn = makeIconButton("mdi:delete", "Eliminar medición", () => {
      if (line) measurer.list.delete(line);
      requestRender();
    });

    actions.append(eyeBtn, deleteBtn);
    row.append(icon, label, actions);
    return row;
  }

  function renderSectionRow(planeId: string): HTMLElement {
    const plane = clipper.list.get(planeId);
    if (!plane) return document.createElement("div");
    const hidden = !plane.visible;

    const row = document.createElement("div");
    row.className = "models-row models-row--nested data-layer-item-row";
    row.draggable = true;
    row.addEventListener("dragstart", (e: DragEvent) => {
      draggedItem = { kind: "section", id: planeId };
      e.dataTransfer?.setData("text/plain", planeId);
      if (e.dataTransfer) e.dataTransfer.effectAllowed = "move";
      row.classList.add("is-dragging");
    });
    row.addEventListener("dragend", () => {
      draggedItem = null;
      row.classList.remove("is-dragging");
    });

    const icon = document.createElement("bim-icon") as any;
    icon.icon = "material-symbols:cut";
    icon.className = "models-row-icon";

    const label = document.createElement("span");
    label.className = "models-row-name";
    label.textContent = plane.title;
    label.addEventListener("dblclick", (e) => {
      e.stopPropagation();
      startRename(plane.title, label, (value) => { plane.title = value; });
    });

    const actions = document.createElement("div");
    actions.className = "models-row-actions";

    const eyeBtn = makeIconButton(hidden ? "mdi:eye-off" : "mdi:eye", hidden ? "Mostrar" : "Ocultar", () => {
      plane.visible = !plane.visible;
      requestRender();
    });
    const deleteBtn = makeIconButton("mdi:delete", "Eliminar corte", () => {
      clipper.delete(world, planeId);
      requestRender();
    });

    actions.append(eyeBtn, deleteBtn);
    row.append(icon, label, actions);
    return row;
  }

  function renderTopicRow(topicGuid: string): HTMLElement {
    const topic = topics.list.get(topicGuid);
    if (!topic) return document.createElement("div");

    const row = document.createElement("div");
    row.className = "models-row models-row--nested data-layer-item-row";
    row.draggable = true;
    row.addEventListener("dragstart", (e: DragEvent) => {
      draggedItem = { kind: "topic", id: topicGuid };
      e.dataTransfer?.setData("text/plain", topicGuid);
      if (e.dataTransfer) e.dataTransfer.effectAllowed = "move";
      row.classList.add("is-dragging");
    });
    row.addEventListener("dragend", () => {
      draggedItem = null;
      row.classList.remove("is-dragging");
    });

    const icon = document.createElement("bim-icon") as any;
    icon.icon = "mdi:file-document-outline";
    icon.className = "models-row-icon";

    const label = document.createElement("span");
    label.className = "models-row-name";
    label.textContent = topic.title;

    row.style.cursor = "pointer";
    row.addEventListener("click", (e) => {
      if ((e.target as HTMLElement).closest(".models-row-actions")) return;
      onTopicSelect(topicGuid);
    });

    const actions = document.createElement("div");
    actions.className = "models-row-actions";

    const deleteBtn = makeIconButton("mdi:delete", "Eliminar topic BCF", () => {
      if (!confirm(`¿Eliminar topic "${topic.title}"?`)) return;
      topics.list.delete(topic.guid);
      requestRender();
    });

    actions.append(deleteBtn);
    row.append(icon, label, actions);
    return row;
  }

  function renderCategoryRow(
    layer: DataLayer,
    kind: "measurement" | "section" | "topic",
    label: string,
    icon: string,
    itemIds: string[],
    expanded: boolean,
    onToggle: () => void,
  ): HTMLElement {
    const wrapper = document.createElement("div");
    wrapper.className = "data-layer-category-group";

    wrapper.addEventListener("dragover", (e: DragEvent) => {
      if (!draggedItem || draggedItem.kind !== kind) return;
      e.preventDefault();
      e.stopPropagation();
      if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
      wrapper.classList.add("drag-over");
    });
    wrapper.addEventListener("dragleave", (e: DragEvent) => {
      if (!wrapper.contains(e.relatedTarget as Node)) wrapper.classList.remove("drag-over");
    });
    wrapper.addEventListener("drop", (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      wrapper.classList.remove("drag-over");
      if (!draggedItem || draggedItem.kind !== kind) return;
      if (kind === "measurement") measurementDataLayer.set(draggedItem.id, layer.id);
      else if (kind === "section") planeDataLayer.set(draggedItem.id, layer.id);
      else topicDataLayer.set(draggedItem.id, layer.id);
      draggedItem = null;
      requestRender();
    });

    const row = document.createElement("div");
    row.className = "types-row data-layer-category-row";

    const arrow = document.createElement("button");
    arrow.type = "button";
    arrow.className = "types-arrow" + (expanded ? " expanded" : "");
    arrow.setAttribute("aria-label", expanded ? "Colapsar" : "Expandir");
    const arrowIcon = document.createElement("bim-icon") as any;
    arrowIcon.icon = "material-symbols:chevron-right";
    arrow.append(arrowIcon);
    arrow.addEventListener("click", (e) => {
      e.stopPropagation();
      onToggle();
      requestRender();
    });

    const catIcon = document.createElement("bim-icon") as any;
    catIcon.icon = icon;
    catIcon.className = "types-cat-icon";

    const catLabel = document.createElement("span");
    catLabel.className = "types-cat-label";
    catLabel.textContent = label;

    const count = document.createElement("span");
    count.className = "types-cat-count";
    count.textContent = String(itemIds.length);

    row.append(arrow, catIcon, catLabel, count);

    if (kind === "topic") {
      row.append(makeIconButton("mdi:table", "Ver tabla de BCF Topics", onOpenTopicsTable));
    }

    wrapper.append(row);

    if (expanded) {
      if (itemIds.length === 0) {
        const empty = document.createElement("div");
        empty.className = "collection-empty";
        empty.textContent =
          kind === "measurement" ? "Sin mediciones" :
          kind === "section"     ? "Sin cortes" :
          "Sin BCF Topics";
        wrapper.append(empty);
      } else {
        for (const id of itemIds) {
          wrapper.append(
            kind === "measurement" ? renderMeasurementRow(id) :
            kind === "section"     ? renderSectionRow(id) :
            renderTopicRow(id),
          );
        }
      }
    }

    return wrapper;
  }

  function renderDataLayerRow(layer: DataLayer): HTMLElement {
    const measurementIds = [...measurementDataLayer.entries()]
      .filter(([id, layerId]) => layerId === layer.id && findLineById(id))
      .map(([id]) => id);
    const sectionIds = [...planeDataLayer.entries()]
      .filter(([id, layerId]) => layerId === layer.id && clipper.list.has(id))
      .map(([id]) => id);
    const topicIds = [...topicDataLayer.entries()]
      .filter(([id, layerId]) => layerId === layer.id && topics.list.has(id))
      .map(([id]) => id);

    const wrapper = document.createElement("div");
    wrapper.className = "collection-group data-layer-group";

    const row = document.createElement("div");
    row.className = "collection-row";
    row.dataset.layerId = layer.id;

    row.draggable = true;
    row.addEventListener("dragstart", (e: DragEvent) => {
      draggedDataLayerId = layer.id;
      e.dataTransfer?.setData("text/plain", layer.id);
      if (e.dataTransfer) e.dataTransfer.effectAllowed = "move";
      row.classList.add("is-dragging");
    });
    row.addEventListener("dragend", () => {
      draggedDataLayerId = null;
      row.classList.remove("is-dragging");
    });

    const arrow = document.createElement("button");
    arrow.type = "button";
    arrow.className = "types-arrow" + (layer.expanded ? " expanded" : "");
    arrow.setAttribute("aria-label", layer.expanded ? "Colapsar" : "Expandir");
    const arrowIcon = document.createElement("bim-icon") as any;
    arrowIcon.icon = "material-symbols:chevron-right";
    arrow.append(arrowIcon);
    arrow.addEventListener("click", (e) => {
      e.stopPropagation();
      layer.expanded = !layer.expanded;
      requestRender();
    });

    const layerIcon = document.createElement("bim-icon") as any;
    layerIcon.icon = "material-symbols:layers-outline";
    layerIcon.className = "collection-row-icon";

    const nameEl = document.createElement("span");
    nameEl.className = "collection-row-name";
    nameEl.textContent = layer.name;
    const nameTooltip = document.createElement("bim-tooltip") as any;
    nameTooltip.textContent = "Doble click para renombrar";
    nameEl.append(nameTooltip);
    nameEl.addEventListener("dblclick", (e) => {
      e.stopPropagation();
      startRename(layer.name, nameEl, (value) => { layer.name = value; });
    });

    const actions = document.createElement("div");
    actions.className = "models-row-actions";

    const eyeBtn = makeIconButton(
      layer.hidden ? "mdi:eye-off" : "mdi:eye",
      layer.hidden ? "Mostrar capa" : "Ocultar capa",
      () => {
        layer.hidden = !layer.hidden;
        for (const id of measurementIds) {
          const dimLine = findDimensionLineById(id);
          if (dimLine) dimLine.visible = !layer.hidden;
        }
        for (const id of sectionIds) {
          const plane = clipper.list.get(id);
          if (plane) plane.visible = !layer.hidden;
        }
        requestRender();
      },
    );

    const deleteBtn = makeIconButton("mdi:delete", "Eliminar capa de datos (borra sus mediciones y cortes)", () => {
      if (!confirm(`¿Eliminar "${layer.name}" y todas sus mediciones/cortes?`)) return;
      for (const id of measurementIds) {
        const line = findLineById(id);
        if (line) measurer.list.delete(line);
      }
      for (const id of sectionIds) clipper.delete(world, id);
      const idx = dataLayers.indexOf(layer);
      if (idx >= 0) dataLayers.splice(idx, 1);
      requestRender();
    });

    actions.append(eyeBtn, deleteBtn);
    row.append(arrow, layerIcon, nameEl, actions);
    wrapper.append(row);

    if (layer.expanded) {
      wrapper.append(renderCategoryRow(
        layer, "measurement", "Mediciones", "solar:ruler-bold", measurementIds,
        layer.measurementsExpanded, () => { layer.measurementsExpanded = !layer.measurementsExpanded; },
      ));
      wrapper.append(renderCategoryRow(
        layer, "section", "Vista de cortes", "material-symbols:cut", sectionIds,
        layer.sectionsExpanded, () => { layer.sectionsExpanded = !layer.sectionsExpanded; },
      ));
      wrapper.append(renderCategoryRow(
        layer, "topic", "BCF Topics", "mdi:file-document-multiple-outline", topicIds,
        layer.topicsExpanded, () => { layer.topicsExpanded = !layer.topicsExpanded; },
      ));
    }

    return wrapper;
  }

  function renderForCollection(collectionId: string | null): HTMLElement[] {
    return dataLayers.filter((l) => l.collectionId === collectionId).map(renderDataLayerRow);
  }

  function addDataLayer(collectionId: string | null): DataLayer {
    dataLayerCounter += 1;
    const layer: DataLayer = {
      id: `layer-${Date.now()}-${dataLayerCounter}`,
      name: `Capa de datos ${dataLayerCounter}`,
      collectionId,
      expanded: true,
      measurementsExpanded: true,
      sectionsExpanded: true,
      topicsExpanded: true,
      hidden: false,
    };
    dataLayers.push(layer);
    return layer;
  }

  /**
   * Devuelve la capa de datos por defecto (nace dentro de la colección por
   * defecto). Si el usuario ya había creado una capa a mano antes de la
   * primera medición/corte, esa se reusa en vez de crear una redundante; si
   * no hay ninguna (o se eliminó), se crea una nueva.
   */
  function ensureDefaultDataLayer(): DataLayer {
    const existing = dataLayers.find((l) => l.id === defaultDataLayerId);
    if (existing) return existing;
    const layer = dataLayers[0] ?? addDataLayer(getDefaultCollectionId());
    defaultDataLayerId = layer.id;
    return layer;
  }

  const createDataLayer = (): void => {
    const layer = addDataLayer(getDefaultCollectionId());
    requestRender();
    requestAnimationFrame(() => {
      const nameEl = document.querySelector(
        `[data-layer-id="${layer.id}"] .collection-row-name`,
      ) as HTMLElement | null;
      if (nameEl) startRename(layer.name, nameEl, (value) => { layer.name = value; });
    });
  };

  const moveDataLayerTo = (layerId: string, collectionId: string | null): void => {
    const layer = dataLayers.find((l) => l.id === layerId);
    if (layer) layer.collectionId = collectionId;
    draggedDataLayerId = null;
    requestRender();
  };

  const onCollectionRemoved = (collectionId: string): void => {
    for (const layer of dataLayers) if (layer.collectionId === collectionId) layer.collectionId = null;
    requestRender();
  };

  const isDraggingDataLayer = (): string | null => draggedDataLayerId;

  measurer.list.onItemAdded.add((line) => {
    const layer = ensureDefaultDataLayer();
    if (!measurementDataLayer.has(line.id)) measurementDataLayer.set(line.id, layer.id);
    if (!measurementName.has(line.id)) {
      measurementCounter += 1;
      measurementName.set(line.id, `Medición ${measurementCounter}`);
    }
    requestRender();
  });
  measurer.list.onItemDeleted.add(() => { pruneStaleEntries(); requestRender(); });
  measurer.list.onCleared.add(() => { pruneStaleEntries(); requestRender(); });

  clipper.onAfterCreate.add((plane) => {
    const layer = ensureDefaultDataLayer();
    const id = clipper.list.getKey(plane);
    if (!id) return;
    if (!planeDataLayer.has(id)) planeDataLayer.set(id, layer.id);
    if (!plane.title) {
      sectionCounter += 1;
      plane.title = `Corte ${sectionCounter}`;
    }
    requestRender();
  });
  clipper.list.onItemDeleted.add((id) => { planeDataLayer.delete(id); requestRender(); });
  clipper.list.onCleared.add(() => { pruneStaleEntries(); requestRender(); });

  topics.list.onItemSet.add(({ key }) => {
    const layer = ensureDefaultDataLayer();
    if (!topicDataLayer.has(key)) topicDataLayer.set(key, layer.id);
    requestRender();
  });
  topics.list.onItemDeleted.add((key) => { topicDataLayer.delete(key); requestRender(); });

  return { renderForCollection, createDataLayer, moveDataLayerTo, onCollectionRemoved, isDraggingDataLayer };
}
