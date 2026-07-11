import * as THREE from "three";
import * as OBC from "@thatopen/components";
import * as OBF from "@thatopen/components-front";
import type { WorldLabelTool } from "../../tools/world-label-tool";
import type { DrawTool } from "../../tools/draw-tool";

export interface DataLayer {
  id: string;
  name: string;
  /** Colección que contiene esta capa; null = suelta (nivel raíz), igual que un modelo sin colección. */
  collectionId: string | null;
  expanded: boolean;
  measurementsExpanded: boolean;
  sectionsExpanded: boolean;
  topicsExpanded: boolean;
  labelsExpanded: boolean;
  drawingsExpanded: boolean;
  /** Estado del último toggle de visibilidad grupal (no se recalcula desde los miembros). */
  hidden: boolean;
}

type Vec3Tuple = [number, number, number];

/** Estado serializable de las capas de datos y todo lo que anidan, para
 *  guardar/restaurar un proyecto. Los ítems no guardan su id interno: al
 *  recrearlos reciben uno nuevo y se reasignan a `layerId` justo después. */
export interface SerializedDataLayers {
  layers: DataLayer[];
  measurements: {
    layerId: string; name: string; start: Vec3Tuple; end: Vec3Tuple;
    units: string; rounding: number; visible: boolean;
  }[];
  sections: {
    layerId: string; title: string; origin: Vec3Tuple; normal: Vec3Tuple; enabled: boolean;
  }[];
  /** El guid de un BCF Topic sobrevive al export/import BCF, así que acá no
   *  hace falta reasignar nada: se guarda el guid original tal cual. */
  topics: { layerId: string; topicGuid: string }[];
  labels: {
    layerId: string; title: string; comment: string; color: string;
    position: Vec3Tuple; visible: boolean;
  }[];
  drawings: {
    layerId: string; name: string; color: string; width: number; points: Vec3Tuple[];
    visible: boolean; cameraPosition: Vec3Tuple; cameraTarget: Vec3Tuple;
  }[];
}

type DraggedItem = { kind: "measurement" | "section" | "topic" | "label" | "draw"; id: string } | null;

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
  serialize: () => SerializedDataLayers;
  /** Reemplaza capas de datos, mediciones, cortes, etiquetas y trazos actuales
   *  por los guardados. Los BCF topics deben estar cargados (`topics.load`)
   *  ANTES de llamar a esto, para que la reasignación por guid encuentre el topic. */
  restore: (data: SerializedDataLayers) => void;
}

export function createDataLayersTree(
  measurer: OBF.LengthMeasurement,
  clipper: OBC.Clipper,
  topics: OBC.BCFTopics,
  labels: WorldLabelTool,
  drawings: DrawTool,
  world: OBC.World,
  requestRender: () => void,
  getDefaultCollectionId: () => string,
  onTopicSelect: (topicGuid: string) => void,
  onOpenTopicsTable: () => void,
): DataLayersController {
  const dataLayers: DataLayer[] = [];
  let dataLayerCounter = 0;
  /** Id de la capa de datos activa: las mediciones/cortes/topics/etiquetas/
   *  trazos nuevos se anidan ahí. Siempre hay una sola (mientras exista al
   *  menos una capa) y no se puede desactivar directamente, solo activar otra. */
  let activeDataLayerId: string | null = null;

  const measurementName = new Map<string, string>();      // lineId -> nombre editable
  const measurementDataLayer = new Map<string, string>(); // lineId -> dataLayerId
  const planeDataLayer = new Map<string, string>();       // planeId -> dataLayerId
  const topicDataLayer = new Map<string, string>();       // topicGuid -> dataLayerId
  const labelDataLayer = new Map<string, string>();       // labelId -> dataLayerId
  const drawDataLayer = new Map<string, string>();        // strokeId -> dataLayerId
  const drawName = new Map<string, string>();             // strokeId -> nombre editable
  let measurementCounter = 0;
  let sectionCounter = 0;
  let drawCounter = 0;

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

    for (const id of [...drawDataLayer.keys()]) if (!drawings.list.has(id)) drawDataLayer.delete(id);
    for (const id of [...drawName.keys()]) if (!drawings.list.has(id)) drawName.delete(id);
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

  /** Checkbox "Capa de datos activa": las mediciones/cortes/topics/etiquetas/
   *  trazos nuevos se anidan en la capa activa. Solo una puede estarlo, y no
   *  se puede desmarcar la actual directamente (solo activando otra). */
  function makeActiveCheckbox(layer: DataLayer): HTMLInputElement {
    const isActive = layer.id === activeDataLayerId;
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.className = "layer-active-checkbox";
    checkbox.checked = isActive;
    checkbox.setAttribute("aria-label", "Capa de datos activa");
    checkbox.title = isActive
      ? "Capa activa (las mediciones nuevas caen acá)"
      : "Marcar como capa de datos activa";
    checkbox.addEventListener("click", (e) => {
      e.stopPropagation();
      if (layer.id === activeDataLayerId) {
        e.preventDefault();
        return;
      }
      activeDataLayerId = layer.id;
      requestRender();
    });
    return checkbox;
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
    const hidden = !plane.enabled;

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
      plane.enabled = !plane.enabled;
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

  function renderLabelRow(labelId: string): HTMLElement {
    const label = labels.list.get(labelId);
    if (!label) return document.createElement("div");
    const hidden = !label.mark.visible;

    const row = document.createElement("div");
    row.className = "models-row models-row--nested data-layer-item-row";
    row.draggable = true;
    row.addEventListener("dragstart", (e: DragEvent) => {
      draggedItem = { kind: "label", id: labelId };
      e.dataTransfer?.setData("text/plain", labelId);
      if (e.dataTransfer) e.dataTransfer.effectAllowed = "move";
      row.classList.add("is-dragging");
    });
    row.addEventListener("dragend", () => {
      draggedItem = null;
      row.classList.remove("is-dragging");
    });

    const icon = document.createElement("bim-icon") as any;
    icon.icon = "mdi:note-text-outline";
    icon.className = "models-row-icon";

    const labelEl = document.createElement("span");
    labelEl.className = "models-row-name";
    labelEl.textContent = label.title;
    labelEl.addEventListener("dblclick", (e) => {
      e.stopPropagation();
      startRename(label.title, labelEl, (value) => labels.rename(labelId, value));
    });

    row.style.cursor = "pointer";
    row.addEventListener("click", (e) => {
      if ((e.target as HTMLElement).closest(".models-row-actions")) return;
      labels.select(labelId);
    });

    const actions = document.createElement("div");
    actions.className = "models-row-actions";

    const eyeBtn = makeIconButton(hidden ? "mdi:eye-off" : "mdi:eye", hidden ? "Mostrar" : "Ocultar", () => {
      label.mark.visible = !label.mark.visible;
      requestRender();
    });
    const editBtn = makeIconButton("mdi:pencil-outline", "Editar etiqueta", () => {
      labels.edit(labelId);
    });
    const deleteBtn = makeIconButton("mdi:delete", "Eliminar etiqueta", () => {
      if (!confirm(`¿Eliminar la etiqueta "${label.title}"?`)) return;
      labels.deleteLabel(labelId);
      requestRender();
    });

    actions.append(eyeBtn, editBtn, deleteBtn);
    row.append(icon, labelEl, actions);
    return row;
  }

  function renderDrawRow(strokeId: string): HTMLElement {
    const stroke = drawings.list.get(strokeId);
    if (!stroke) return document.createElement("div");
    const name = drawName.get(strokeId) ?? strokeId;
    const hidden = !stroke.line.visible;

    const row = document.createElement("div");
    row.className = "models-row models-row--nested data-layer-item-row";
    row.draggable = true;
    row.addEventListener("dragstart", (e: DragEvent) => {
      draggedItem = { kind: "draw", id: strokeId };
      e.dataTransfer?.setData("text/plain", strokeId);
      if (e.dataTransfer) e.dataTransfer.effectAllowed = "move";
      row.classList.add("is-dragging");
    });
    row.addEventListener("dragend", () => {
      draggedItem = null;
      row.classList.remove("is-dragging");
    });

    const icon = document.createElement("bim-icon") as any;
    icon.icon = "mdi:draw";
    icon.className = "models-row-icon";

    const labelEl = document.createElement("span");
    labelEl.className = "models-row-name";
    labelEl.textContent = name;

    row.style.cursor = "pointer";
    row.addEventListener("click", (e) => {
      if ((e.target as HTMLElement).closest(".models-row-actions")) return;
      drawings.select(strokeId);
    });
    // Doble click: llevar la cámara de vuelta a como estaba parada cuando se
    // dibujó este trazo (cada trazo guarda su propia posición/target de cámara).
    row.addEventListener("dblclick", (e) => {
      if ((e.target as HTMLElement).closest(".models-row-actions")) return;
      drawings.focus(strokeId);
    });

    const actions = document.createElement("div");
    actions.className = "models-row-actions";

    const eyeBtn = makeIconButton(hidden ? "mdi:eye-off" : "mdi:eye", hidden ? "Mostrar" : "Ocultar", () => {
      stroke.line.visible = !stroke.line.visible;
      requestRender();
    });
    const deleteBtn = makeIconButton("mdi:delete", "Eliminar trazo", () => {
      drawings.deleteStroke(strokeId);
      requestRender();
    });

    actions.append(eyeBtn, deleteBtn);
    row.append(icon, labelEl, actions);
    return row;
  }

  function renderCategoryRow(
    layer: DataLayer,
    kind: "measurement" | "section" | "topic" | "label" | "draw",
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
      else if (kind === "topic") topicDataLayer.set(draggedItem.id, layer.id);
      else if (kind === "draw") drawDataLayer.set(draggedItem.id, layer.id);
      else labelDataLayer.set(draggedItem.id, layer.id);
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
      for (const id of itemIds) {
        wrapper.append(
          kind === "measurement" ? renderMeasurementRow(id) :
          kind === "section"     ? renderSectionRow(id) :
          kind === "topic"       ? renderTopicRow(id) :
          kind === "draw"        ? renderDrawRow(id) :
          renderLabelRow(id),
        );
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
    const labelIds = [...labelDataLayer.entries()]
      .filter(([id, layerId]) => layerId === layer.id && labels.list.has(id))
      .map(([id]) => id);
    const drawIds = [...drawDataLayer.entries()]
      .filter(([id, layerId]) => layerId === layer.id && drawings.list.has(id))
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

    // Permite soltar un ítem directo sobre la fila de la capa (no solo sobre
    // su categoría) para poder reasignarlo aunque esa categoría esté vacía
    // y por lo tanto oculta.
    row.addEventListener("dragover", (e: DragEvent) => {
      if (!draggedItem) return;
      e.preventDefault();
      e.stopPropagation();
      if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
      row.classList.add("drag-over");
    });
    row.addEventListener("dragleave", (e: DragEvent) => {
      if (!row.contains(e.relatedTarget as Node)) row.classList.remove("drag-over");
    });
    row.addEventListener("drop", (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      row.classList.remove("drag-over");
      if (!draggedItem) return;
      if (draggedItem.kind === "measurement") measurementDataLayer.set(draggedItem.id, layer.id);
      else if (draggedItem.kind === "section") planeDataLayer.set(draggedItem.id, layer.id);
      else if (draggedItem.kind === "topic") topicDataLayer.set(draggedItem.id, layer.id);
      else if (draggedItem.kind === "draw") drawDataLayer.set(draggedItem.id, layer.id);
      else labelDataLayer.set(draggedItem.id, layer.id);
      draggedItem = null;
      requestRender();
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
          if (plane) plane.enabled = !layer.hidden;
        }
        for (const id of labelIds) {
          const worldLabel = labels.list.get(id);
          if (worldLabel) worldLabel.mark.visible = !layer.hidden;
        }
        for (const id of drawIds) {
          const stroke = drawings.list.get(id);
          if (stroke) stroke.line.visible = !layer.hidden;
        }
        requestRender();
      },
    );

    const deleteBtn = makeIconButton("mdi:delete", "Eliminar capa de datos (borra sus mediciones, cortes, etiquetas y dibujos)", () => {
      if (!confirm(`¿Eliminar "${layer.name}" y todas sus mediciones/cortes/etiquetas/dibujos?`)) return;
      for (const id of measurementIds) {
        const line = findLineById(id);
        if (line) measurer.list.delete(line);
      }
      for (const id of sectionIds) clipper.delete(world, id);
      for (const id of labelIds) labels.deleteLabel(id);
      for (const id of drawIds) drawings.deleteStroke(id);
      const idx = dataLayers.indexOf(layer);
      if (idx >= 0) dataLayers.splice(idx, 1);
      if (activeDataLayerId === layer.id) activeDataLayerId = dataLayers[0]?.id ?? null;
      requestRender();
    });

    const activeCheckbox = makeActiveCheckbox(layer);

    actions.append(activeCheckbox, eyeBtn, deleteBtn);
    row.append(arrow, layerIcon, nameEl, actions);
    wrapper.append(row);

    if (layer.expanded) {
      if (measurementIds.length > 0) {
        wrapper.append(renderCategoryRow(
          layer, "measurement", "Mediciones", "solar:ruler-bold", measurementIds,
          layer.measurementsExpanded, () => { layer.measurementsExpanded = !layer.measurementsExpanded; },
        ));
      }
      if (sectionIds.length > 0) {
        wrapper.append(renderCategoryRow(
          layer, "section", "Vista de cortes", "material-symbols:cut", sectionIds,
          layer.sectionsExpanded, () => { layer.sectionsExpanded = !layer.sectionsExpanded; },
        ));
      }
      if (topicIds.length > 0) {
        wrapper.append(renderCategoryRow(
          layer, "topic", "BCF Topics", "mdi:file-document-multiple-outline", topicIds,
          layer.topicsExpanded, () => { layer.topicsExpanded = !layer.topicsExpanded; },
        ));
      }
      if (labelIds.length > 0) {
        wrapper.append(renderCategoryRow(
          layer, "label", "Etiquetas", "material-symbols:sticky-note-2-outline", labelIds,
          layer.labelsExpanded, () => { layer.labelsExpanded = !layer.labelsExpanded; },
        ));
      }
      if (drawIds.length > 0) {
        wrapper.append(renderCategoryRow(
          layer, "draw", "Dibujo", "mdi:draw", drawIds,
          layer.drawingsExpanded, () => { layer.drawingsExpanded = !layer.drawingsExpanded; },
        ));
      }
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
      labelsExpanded: true,
      drawingsExpanded: true,
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
    const existing = dataLayers.find((l) => l.id === activeDataLayerId);
    if (existing) return existing;
    const layer = dataLayers[0] ?? addDataLayer(getDefaultCollectionId());
    activeDataLayerId = layer.id;
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

  labels.onItemAdded.add((label) => {
    const layer = ensureDefaultDataLayer();
    if (!labelDataLayer.has(label.id)) labelDataLayer.set(label.id, layer.id);
    requestRender();
  });
  labels.onItemDeleted.add((id) => { labelDataLayer.delete(id); requestRender(); });

  drawings.onItemAdded.add((stroke) => {
    const layer = ensureDefaultDataLayer();
    if (!drawDataLayer.has(stroke.id)) drawDataLayer.set(stroke.id, layer.id);
    if (!drawName.has(stroke.id)) {
      drawCounter += 1;
      drawName.set(stroke.id, `Trazo ${drawCounter}`);
    }
    requestRender();
  });
  drawings.onItemDeleted.add((id) => { drawDataLayer.delete(id); drawName.delete(id); requestRender(); });

  const v3 = (v: THREE.Vector3): Vec3Tuple => [v.x, v.y, v.z];
  const toVec3 = (v: Vec3Tuple): THREE.Vector3 => new THREE.Vector3(v[0], v[1], v[2]);

  function serialize(): SerializedDataLayers {
    const measurements = [...measurementDataLayer.entries()]
      .map(([id, layerId]) => {
        const line = findLineById(id);
        if (!line) return null;
        const dimLine = findDimensionLineById(id);
        return {
          layerId, name: measurementName.get(id) ?? id,
          start: v3(line.start), end: v3(line.end),
          units: line.units, rounding: line.rounding,
          visible: dimLine ? dimLine.visible : true,
        };
      })
      .filter((m): m is NonNullable<typeof m> => m !== null);

    const sections = [...planeDataLayer.entries()]
      .map(([id, layerId]) => {
        const plane = clipper.list.get(id);
        if (!plane) return null;
        return { layerId, title: plane.title, origin: v3(plane.origin), normal: v3(plane.normal), enabled: plane.enabled };
      })
      .filter((s): s is NonNullable<typeof s> => s !== null);

    const topicsOut = [...topicDataLayer.entries()]
      .filter(([guid]) => topics.list.has(guid))
      .map(([topicGuid, layerId]) => ({ layerId, topicGuid }));

    const labelsOut = [...labelDataLayer.entries()]
      .map(([id, layerId]) => {
        const label = labels.list.get(id);
        if (!label) return null;
        return {
          layerId, title: label.title, comment: label.comment, color: label.color,
          position: v3(label.position), visible: label.mark.visible,
        };
      })
      .filter((l): l is NonNullable<typeof l> => l !== null);

    const drawingsOut = [...drawDataLayer.entries()]
      .map(([id, layerId]) => {
        const stroke = drawings.list.get(id);
        if (!stroke) return null;
        return {
          layerId, name: drawName.get(id) ?? id, color: stroke.color, width: stroke.width,
          points: stroke.points.map(v3), visible: stroke.line.visible,
          cameraPosition: v3(stroke.cameraPosition), cameraTarget: v3(stroke.cameraTarget),
        };
      })
      .filter((d): d is NonNullable<typeof d> => d !== null);

    return {
      layers: dataLayers.map((l) => ({ ...l })),
      measurements, sections, topics: topicsOut, labels: labelsOut, drawings: drawingsOut,
    };
  }

  function restore(data: SerializedDataLayers): void {
    // Antes de reasignar los mapas layerId hay que borrar los ítems que ya
    // existen en la escena (mediciones, cortes, etiquetas, trazos): si no,
    // quedan dibujados en el mundo 3D aunque desaparezcan del árbol.
    measurer.list.clear();
    for (const id of [...clipper.list.keys()]) clipper.delete(world, id);
    for (const id of [...labels.list.keys()]) labels.deleteLabel(id);
    for (const id of [...drawings.list.keys()]) drawings.deleteStroke(id);

    dataLayers.length = 0;
    measurementDataLayer.clear();
    measurementName.clear();
    planeDataLayer.clear();
    topicDataLayer.clear();
    labelDataLayer.clear();
    drawDataLayer.clear();
    drawName.clear();
    activeDataLayerId = null;

    for (const l of data.layers) dataLayers.push({ ...l });

    for (const m of data.measurements) {
      const line = new OBF.Line(toVec3(m.start), toVec3(m.end));
      line.units = m.units as OBF.Line["units"];
      line.rounding = m.rounding;
      measurer.list.add(line);
      measurementDataLayer.set(line.id, m.layerId);
      measurementName.set(line.id, m.name);
      const dimLine = findDimensionLineById(line.id);
      if (dimLine) dimLine.visible = m.visible;
    }

    for (const s of data.sections) {
      const id = clipper.createFromNormalAndCoplanarPoint(world, toVec3(s.normal), toVec3(s.origin));
      const plane = clipper.list.get(id);
      if (plane) {
        plane.title = s.title;
        plane.enabled = s.enabled;
      }
      planeDataLayer.set(id, s.layerId);
    }

    for (const t of data.topics) {
      if (topics.list.has(t.topicGuid)) topicDataLayer.set(t.topicGuid, t.layerId);
    }

    for (const lb of data.labels) {
      const label = labels.createFromData({
        title: lb.title, comment: lb.comment, color: lb.color, position: toVec3(lb.position),
      });
      label.mark.visible = lb.visible;
      labelDataLayer.set(label.id, lb.layerId);
    }

    for (const d of data.drawings) {
      const stroke = drawings.addStroke({
        color: d.color, width: d.width, points: d.points.map(toVec3),
        cameraPosition: toVec3(d.cameraPosition), cameraTarget: toVec3(d.cameraTarget),
      });
      stroke.line.visible = d.visible;
      drawDataLayer.set(stroke.id, d.layerId);
      drawName.set(stroke.id, d.name);
    }

    requestRender();
  }

  return {
    renderForCollection, createDataLayer, moveDataLayerTo, onCollectionRemoved, isDraggingDataLayer,
    serialize, restore,
  };
}
