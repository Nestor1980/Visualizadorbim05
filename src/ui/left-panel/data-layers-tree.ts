import * as THREE from "three";
import * as OBC from "@thatopen/components";
import type { WorldLabelTool } from "../../tools/world-label-tool";
import type { DrawTool } from "../../tools/draw-tool";
import type { CotaTool } from "../../tools/cota-tool";
import type { ComputoTool, ComputoItem, ComputoCategoria } from "../../tools/computo-tool";

export interface DataLayer {
  id: string;
  name: string;
  /** Colección que contiene esta capa; null = suelta (nivel raíz), igual que un modelo sin colección. */
  collectionId: string | null;
  expanded: boolean;
  cotasExpanded: boolean;
  sectionsExpanded: boolean;
  topicsExpanded: boolean;
  labelsExpanded: boolean;
  drawingsExpanded: boolean;
  computoExpanded: boolean;
  /** Estado del último toggle de visibilidad grupal (no se recalcula desde los miembros). */
  hidden: boolean;
}

type Vec3Tuple = [number, number, number];

/** Estado serializable de las capas de datos y todo lo que anidan, para
 *  guardar/restaurar un proyecto. Los ítems no guardan su id interno: al
 *  recrearlos reciben uno nuevo y se reasignan a `layerId` justo después. */
export interface SerializedDataLayers {
  layers: DataLayer[];
  /** Id de la capa de datos activa (donde caen las cotas/cortes/etiquetas
   *  nuevas). Opcional: los proyectos guardados antes de este campo caen a la
   *  primera capa al restaurar, igual que antes. */
  activeDataLayerId?: string | null;
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
  cotas: {
    layerId: string; name: string; start: Vec3Tuple; end: Vec3Tuple; visible: boolean;
  }[];
  computo: ({ layerId: string } & ComputoItem)[];
  /** Secciones de la tabla de cómputo (ver `ComputoCategoria`) — no tienen
   *  `layerId`: son un agrupador propio de la tabla, no de las capas de datos. */
  computoCategorias?: ComputoCategoria[];
  /** Opcional: proyectos guardados con la herramienta de medición vieja
   *  (deprecada) traían este campo. Ya no hay dónde restaurarlos — se ignora
   *  al cargar, en vez de romper la carga del resto del proyecto. */
  measurements?: unknown[];
}

type DraggedItem = { kind: "cota" | "section" | "topic" | "label" | "draw" | "computo"; id: string } | null;

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
  /** Reemplaza capas de datos, cotas, cortes, etiquetas y trazos actuales
   *  por los guardados. Los BCF topics deben estar cargados (`topics.load`)
   *  ANTES de llamar a esto, para que la reasignación por guid encuentre el topic. */
  restore: (data: SerializedDataLayers) => void;
  /** Notifica cualquier mutación del árbol de capas (crear/renombrar/borrar
   *  capa, mover un ítem a otra capa, togglear visibilidad, drag & drop…) — no
   *  distingue del re-render por expandir/colapsar, así que el consumidor debe
   *  filtrar por diff. Usado por el historial de undo/redo. */
  onMutated: (cb: () => void) => void;
}

export function createDataLayersTree(
  clipper: OBC.Clipper,
  topics: OBC.BCFTopics,
  labels: WorldLabelTool,
  drawings: DrawTool,
  cotas: CotaTool,
  computos: ComputoTool,
  world: OBC.World,
  requestRender: () => void,
  getDefaultCollectionId: () => string,
  onTopicSelect: (topicGuid: string) => void,
  onOpenTopicsTable: () => void,
): DataLayersController {
  // `requestRender` es el único choke-point que se llama tras cualquier cambio
  // del árbol; se envuelve para avisarle también al historial de undo/redo.
  const baseRequestRender = requestRender;
  let notifyMutated: (() => void) | null = null;
  requestRender = () => {
    baseRequestRender();
    notifyMutated?.();
  };

  const dataLayers: DataLayer[] = [];
  let dataLayerCounter = 0;
  /** Id de la capa de datos activa: las cotas/cortes/topics/etiquetas/
   *  trazos nuevos se anidan ahí. Siempre hay una sola (mientras exista al
   *  menos una capa) y no se puede desactivar directamente, solo activar otra. */
  let activeDataLayerId: string | null = null;

  const planeDataLayer = new Map<string, string>();       // planeId -> dataLayerId
  const topicDataLayer = new Map<string, string>();       // topicGuid -> dataLayerId
  const labelDataLayer = new Map<string, string>();       // labelId -> dataLayerId
  const drawDataLayer = new Map<string, string>();        // strokeId -> dataLayerId
  const drawName = new Map<string, string>();             // strokeId -> nombre editable
  const cotaDataLayer = new Map<string, string>();        // cotaId -> dataLayerId
  const cotaName = new Map<string, string>();             // cotaId -> nombre editable
  const computoDataLayer = new Map<string, string>();     // computoItemId -> dataLayerId
  let sectionCounter = 0;
  let drawCounter = 0;
  let cotaCounter = 0;

  let draggedItem: DraggedItem = null;
  let draggedDataLayerId: string | null = null;
  /** Ítems de cómputo con sus elementos IFC expandidos en el árbol — estado
   *  efímero de UI, no se persiste con el proyecto. */
  const computoItemExpanded = new Set<string>();

  function pruneStaleEntries(): void {
    const livePlaneIds = new Set(clipper.list.keys());
    for (const id of [...planeDataLayer.keys()]) if (!livePlaneIds.has(id)) planeDataLayer.delete(id);

    for (const id of [...drawDataLayer.keys()]) if (!drawings.list.has(id)) drawDataLayer.delete(id);
    for (const id of [...drawName.keys()]) if (!drawings.list.has(id)) drawName.delete(id);

    for (const id of [...cotaDataLayer.keys()]) if (!cotas.list.has(id)) cotaDataLayer.delete(id);
    for (const id of [...cotaName.keys()]) if (!cotas.list.has(id)) cotaName.delete(id);

    for (const id of [...computoDataLayer.keys()]) if (!computos.list.has(id)) computoDataLayer.delete(id);
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

  /** Checkbox "Capa de datos activa": las cotas/cortes/topics/etiquetas/
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
      ? "Capa activa (las cotas nuevas caen acá)"
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

  function renderCotaRow(cotaId: string): HTMLElement {
    const cota = cotas.list.get(cotaId);
    if (!cota) return document.createElement("div");
    const name = cotaName.get(cotaId) ?? cotaId;
    const hidden = !cota.visible;

    const row = document.createElement("div");
    row.className = "models-row models-row--nested data-layer-item-row";
    row.draggable = true;
    row.addEventListener("dragstart", (e: DragEvent) => {
      draggedItem = { kind: "cota", id: cotaId };
      e.dataTransfer?.setData("text/plain", cotaId);
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
    label.textContent = `${name} — ${cota.distance.toFixed(2)} m`;
    label.addEventListener("dblclick", (e) => {
      e.stopPropagation();
      startRename(name, label, (value) => cotaName.set(cotaId, value));
    });

    const actions = document.createElement("div");
    actions.className = "models-row-actions";

    const eyeBtn = makeIconButton(hidden ? "mdi:eye-off" : "mdi:eye", hidden ? "Mostrar" : "Ocultar", () => {
      cota.visible = !cota.visible;
      requestRender();
    });
    const deleteBtn = makeIconButton("mdi:delete", "Eliminar cota", () => {
      cotas.deleteCota(cotaId);
      requestRender();
    });

    actions.append(eyeBtn, deleteBtn);
    row.append(icon, label, actions);
    return row;
  }

  /** Fila hija de un ítem de cómputo: un elemento IFC puntual de sus
   *  `elementos` (ver ComputoItem.elementos), para ver/editar la
   *  trazabilidad tabla ↔ árbol ↔ modelo sin salir del árbol. */
  function renderComputoElementRow(item: ComputoItem, el: { modelId: string; localId: number }): HTMLElement {
    const row = document.createElement("div");
    row.className = "models-row models-row--nested data-layer-item-row--child";

    const icon = document.createElement("bim-icon") as any;
    icon.icon = "material-symbols:category-outline";
    icon.className = "models-row-icon";

    const label = document.createElement("span");
    label.className = "models-row-name";
    label.textContent = `Elemento #${el.localId}`;

    const actions = document.createElement("div");
    actions.className = "models-row-actions";
    const removeBtn = makeIconButton("mdi:close", "Quitar este elemento del ítem", () => {
      computos.removeElementFromItem(item.id, el.modelId, el.localId);
      requestRender();
    });
    actions.append(removeBtn);

    row.append(icon, label, actions);
    return row;
  }

  function renderComputoRow(itemId: string): HTMLElement {
    const item = computos.list.get(itemId);
    if (!item) return document.createElement("div");

    const wrapper = document.createElement("div");
    wrapper.className = "data-layer-item-group";

    const row = document.createElement("div");
    row.className = "models-row models-row--nested data-layer-item-row";
    row.draggable = true;
    row.addEventListener("dragstart", (e: DragEvent) => {
      draggedItem = { kind: "computo", id: itemId };
      e.dataTransfer?.setData("text/plain", itemId);
      if (e.dataTransfer) e.dataTransfer.effectAllowed = "move";
      row.classList.add("is-dragging");
    });
    row.addEventListener("dragend", () => {
      draggedItem = null;
      row.classList.remove("is-dragging");
    });

    const hasElements = item.elementos.length > 0;
    const expanded = computoItemExpanded.has(itemId);

    const arrow = document.createElement("button");
    arrow.type = "button";
    arrow.className = "types-arrow" + (expanded ? " expanded" : "");
    arrow.setAttribute("aria-label", expanded ? "Colapsar" : "Expandir");
    arrow.style.visibility = hasElements ? "" : "hidden";
    const arrowIcon = document.createElement("bim-icon") as any;
    arrowIcon.icon = "material-symbols:chevron-right";
    arrow.append(arrowIcon);
    arrow.addEventListener("click", (e) => {
      e.stopPropagation();
      if (!hasElements) return;
      if (expanded) computoItemExpanded.delete(itemId); else computoItemExpanded.add(itemId);
      requestRender();
    });

    const icon = document.createElement("bim-icon") as any;
    icon.icon = "material-symbols:calculate-outline";
    icon.className = "models-row-icon";

    const label = document.createElement("span");
    label.className = "models-row-name";
    const rubro = item.rubro || "Sin rubro";
    const descripcion = item.descripcion || item.tipoElemento || item.tipoIfc || item.id;
    label.textContent = `${rubro} — ${descripcion} (${item.elementos.length})`;

    const actions = document.createElement("div");
    actions.className = "models-row-actions";

    const deleteBtn = makeIconButton("mdi:delete", "Eliminar ítem de cómputo", () => {
      computos.deleteItem(itemId);
      requestRender();
    });

    actions.append(deleteBtn);
    row.append(arrow, icon, label, actions);
    wrapper.append(row);

    if (expanded) {
      for (const el of item.elementos) wrapper.append(renderComputoElementRow(item, el));
    }

    return wrapper;
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
    kind: "cota" | "section" | "topic" | "label" | "draw" | "computo",
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
      if (kind === "cota") cotaDataLayer.set(draggedItem.id, layer.id);
      else if (kind === "section") planeDataLayer.set(draggedItem.id, layer.id);
      else if (kind === "topic") topicDataLayer.set(draggedItem.id, layer.id);
      else if (kind === "draw") drawDataLayer.set(draggedItem.id, layer.id);
      else if (kind === "computo") computoDataLayer.set(draggedItem.id, layer.id);
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
          kind === "cota"        ? renderCotaRow(id) :
          kind === "section"     ? renderSectionRow(id) :
          kind === "topic"       ? renderTopicRow(id) :
          kind === "draw"        ? renderDrawRow(id) :
          kind === "computo"     ? renderComputoRow(id) :
          renderLabelRow(id),
        );
      }
    }

    return wrapper;
  }

  function renderDataLayerRow(layer: DataLayer): HTMLElement {
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
    const cotaIds = [...cotaDataLayer.entries()]
      .filter(([id, layerId]) => layerId === layer.id && cotas.list.has(id))
      .map(([id]) => id);
    const computoIds = [...computoDataLayer.entries()]
      .filter(([id, layerId]) => layerId === layer.id && computos.list.has(id))
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
      if (draggedItem.kind === "cota") cotaDataLayer.set(draggedItem.id, layer.id);
      else if (draggedItem.kind === "section") planeDataLayer.set(draggedItem.id, layer.id);
      else if (draggedItem.kind === "topic") topicDataLayer.set(draggedItem.id, layer.id);
      else if (draggedItem.kind === "draw") drawDataLayer.set(draggedItem.id, layer.id);
      else if (draggedItem.kind === "computo") computoDataLayer.set(draggedItem.id, layer.id);
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
        for (const id of cotaIds) {
          const cota = cotas.list.get(id);
          if (cota) cota.visible = !layer.hidden;
        }
        requestRender();
      },
    );

    const deleteBtn = makeIconButton("mdi:delete", "Eliminar capa de datos (borra sus cotas, cortes, etiquetas, dibujos e ítems de cómputo)", () => {
      if (!confirm(`¿Eliminar "${layer.name}" y todas sus cotas/cortes/etiquetas/dibujos/ítems de cómputo?`)) return;
      for (const id of sectionIds) clipper.delete(world, id);
      for (const id of labelIds) labels.deleteLabel(id);
      for (const id of drawIds) drawings.deleteStroke(id);
      for (const id of cotaIds) cotas.deleteCota(id);
      for (const id of computoIds) computos.deleteItem(id);
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
      if (cotaIds.length > 0) {
        wrapper.append(renderCategoryRow(
          layer, "cota", "Cotas", "solar:ruler-bold", cotaIds,
          layer.cotasExpanded, () => { layer.cotasExpanded = !layer.cotasExpanded; },
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
      if (computoIds.length > 0) {
        wrapper.append(renderCategoryRow(
          layer, "computo", "Cómputo", "material-symbols:calculate-outline", computoIds,
          layer.computoExpanded, () => { layer.computoExpanded = !layer.computoExpanded; },
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
      cotasExpanded: true,
      sectionsExpanded: true,
      topicsExpanded: true,
      labelsExpanded: true,
      drawingsExpanded: true,
      computoExpanded: true,
      hidden: false,
    };
    dataLayers.push(layer);
    return layer;
  }

  /**
   * Devuelve la capa de datos por defecto (nace dentro de la colección por
   * defecto). Si el usuario ya había creado una capa a mano antes de la
   * primera cota/corte, esa se reusa en vez de crear una redundante; si
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

  cotas.onItemAdded.add((cota) => {
    const layer = ensureDefaultDataLayer();
    if (!cotaDataLayer.has(cota.id)) cotaDataLayer.set(cota.id, layer.id);
    if (!cotaName.has(cota.id)) {
      cotaCounter += 1;
      cotaName.set(cota.id, `Cota ${cotaCounter}`);
    }
    requestRender();
  });
  cotas.onItemDeleted.add((id) => { cotaDataLayer.delete(id); cotaName.delete(id); requestRender(); });

  computos.onItemAdded.add((item) => {
    const layer = ensureDefaultDataLayer();
    if (!computoDataLayer.has(item.id)) computoDataLayer.set(item.id, layer.id);
    requestRender();
  });
  computos.onItemChanged.add(() => requestRender());
  computos.onItemDeleted.add((id) => { computoDataLayer.delete(id); computoItemExpanded.delete(id); requestRender(); });

  const v3 = (v: THREE.Vector3): Vec3Tuple => [v.x, v.y, v.z];
  const toVec3 = (v: Vec3Tuple): THREE.Vector3 => new THREE.Vector3(v[0], v[1], v[2]);

  function serialize(): SerializedDataLayers {
    const sections = [...planeDataLayer.entries()]
      .map(([id, layerId]) => {
        const plane = clipper.list.get(id);
        if (!plane) return null;
        // `plane.origin` / `plane.normal` quedan congelados en el valor de
        // creación: al arrastrar el plano con el gizmo solo se actualiza
        // `plane.three` (ver SimplePlane.update). Se serializa desde ahí para
        // que un plano movido guarde —y deshaga— su posición real.
        const three = plane.three;
        const origin = three.normal.clone().multiplyScalar(-three.constant);
        return { layerId, title: plane.title, origin: v3(origin), normal: v3(three.normal), enabled: plane.enabled };
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

    const cotasOut = [...cotaDataLayer.entries()]
      .map(([id, layerId]) => {
        const cota = cotas.list.get(id);
        if (!cota) return null;
        return {
          layerId, name: cotaName.get(id) ?? id,
          start: v3(cota.start), end: v3(cota.end), visible: cota.visible,
        };
      })
      .filter((c): c is NonNullable<typeof c> => c !== null);

    const computoOut = [...computoDataLayer.entries()]
      .map(([id, layerId]) => {
        const item = computos.list.get(id);
        if (!item) return null;
        return { layerId, ...item, elementos: item.elementos.map((e) => ({ ...e })) };
      })
      .filter((c): c is NonNullable<typeof c> => c !== null);

    const computoCategoriasOut = [...computos.categorias.values()].map((c) => ({ ...c }));

    return {
      layers: dataLayers.map((l) => ({ ...l })),
      activeDataLayerId,
      sections, topics: topicsOut, labels: labelsOut, drawings: drawingsOut, cotas: cotasOut,
      computo: computoOut, computoCategorias: computoCategoriasOut,
    };
  }

  function restore(data: SerializedDataLayers): void {
    // Antes de reasignar los mapas layerId hay que borrar los ítems que ya
    // existen en la escena (cotas, cortes, etiquetas, trazos): si no, quedan
    // dibujados en el mundo 3D aunque desaparezcan del árbol.
    for (const id of [...clipper.list.keys()]) clipper.delete(world, id);
    for (const id of [...labels.list.keys()]) labels.deleteLabel(id);
    for (const id of [...drawings.list.keys()]) drawings.deleteStroke(id);
    for (const id of [...cotas.list.keys()]) cotas.deleteCota(id);
    for (const id of [...computos.list.keys()]) computos.deleteItem(id);
    for (const id of [...computos.categorias.keys()]) computos.deleteCategoria(id);

    dataLayers.length = 0;
    planeDataLayer.clear();
    topicDataLayer.clear();
    labelDataLayer.clear();
    drawDataLayer.clear();
    drawName.clear();
    cotaDataLayer.clear();
    cotaName.clear();
    computoDataLayer.clear();
    activeDataLayerId = null;

    for (const l of data.layers) dataLayers.push({ ...l });

    activeDataLayerId =
      data.activeDataLayerId && dataLayers.some((l) => l.id === data.activeDataLayerId)
        ? data.activeDataLayerId
        : dataLayers[0]?.id ?? null;

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

    for (const c of data.cotas ?? []) {
      const cota = cotas.addCota(toVec3(c.start), toVec3(c.end));
      cota.visible = c.visible;
      cotaDataLayer.set(cota.id, c.layerId);
      cotaName.set(cota.id, c.name);
    }

    for (const cat of data.computoCategorias ?? []) computos.restoreCategoria(cat);

    for (const c of data.computo ?? []) {
      const { layerId, ...item } = c;
      computos.restoreItem(item);
      computoDataLayer.set(item.id, layerId);
    }
    computos.repaintHighlight();

    requestRender();
  }

  return {
    renderForCollection, createDataLayer, moveDataLayerTo, onCollectionRemoved, isDraggingDataLayer,
    serialize, restore,
    onMutated: (cb) => { notifyMutated = cb; },
  };
}
