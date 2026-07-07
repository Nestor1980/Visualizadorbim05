import * as OBC from "@thatopen/components";
import type { DataLayersController } from "./data-layers-tree";

interface Collection {
  id: string;
  name: string;
  expanded: boolean;
  /** Estado del último toggle de visibilidad grupal (no se recalcula desde los miembros). */
  hidden: boolean;
}

export interface ModelsTree {
  element: HTMLElement;
  createCollection: () => void;
  ensureDefaultCollectionId: () => string;
  attachDataLayers: (controller: DataLayersController) => void;
  refresh: () => void;
}

/** Paleta de matices para diferenciar renglones de modelos a simple vista. */
const ROW_HUES = [210, 150, 280, 32, 340, 95, 260, 8];

export function createModelsTree(fragments: OBC.FragmentsManager): ModelsTree {
  const collections: Collection[] = [];
  const modelCollection = new Map<string, string | null>();
  const hiddenModels = new Map<string, boolean>();
  const modelColorIndex = new Map<string, number>();
  let nextColorIndex = 0;
  let collectionCounter = 0;
  /** Id del modelo que se está arrastrando; nulo fuera de un drag activo. */
  let draggedModelId: string | null = null;
  /** Id de la colección donde caen los modelos nuevos por defecto. */
  let defaultCollectionId: string | null = null;
  /** Capas de datos (mediciones/cortes) anidadas dentro de este árbol; se conecta después de construir ambos módulos. */
  let dataLayersController: DataLayersController | null = null;

  const root = document.createElement("div");
  root.className = "models-tree";

  const colorFor = (modelId: string): string => {
    if (!modelColorIndex.has(modelId)) {
      modelColorIndex.set(modelId, nextColorIndex % ROW_HUES.length);
      nextColorIndex += 1;
    }
    const hue = ROW_HUES[modelColorIndex.get(modelId)!];
    return `hsl(${hue} 55% 50% / 0.12)`;
  };

  const isModelHidden = (modelId: string): boolean => hiddenModels.get(modelId) ?? false;

  const setModelVisible = async (modelId: string, visible: boolean): Promise<void> => {
    const model = fragments.list.get(modelId);
    if (!model) return;
    await model.setVisible(undefined, visible);
    hiddenModels.set(modelId, !visible);
  };

  const moveModelTo = (modelId: string, collectionId: string | null): void => {
    modelCollection.set(modelId, collectionId);
    draggedModelId = null;
    render();
  };

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

  function startRename(col: Collection, nameEl: HTMLElement): void {
    const input = document.createElement("input");
    input.type = "text";
    input.className = "collection-rename-input";
    input.value = col.name;
    nameEl.replaceWith(input);
    input.focus();
    input.select();

    const commit = () => {
      const value = input.value.trim();
      col.name = value.length > 0 ? value : col.name;
      render();
    };
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") { e.preventDefault(); commit(); }
      else if (e.key === "Escape") { e.preventDefault(); render(); }
    });
    input.addEventListener("blur", commit);
  }

  function renderModelRow(modelId: string, nested: boolean): HTMLElement {
    const row = document.createElement("div");
    row.className = "models-row" + (nested ? " models-row--nested" : "");
    row.style.backgroundColor = colorFor(modelId);

    row.draggable = true;
    row.addEventListener("dragstart", (e: DragEvent) => {
      draggedModelId = modelId;
      e.dataTransfer?.setData("text/plain", modelId);
      if (e.dataTransfer) e.dataTransfer.effectAllowed = "move";
      row.classList.add("is-dragging");
    });
    row.addEventListener("dragend", () => {
      draggedModelId = null;
      row.classList.remove("is-dragging");
    });

    const icon = document.createElement("bim-icon") as any;
    icon.icon = "mage:box-3d-fill";
    icon.className = "models-row-icon";

    const label = document.createElement("span");
    label.className = "models-row-name";
    label.textContent = modelId;
    const labelTooltip = document.createElement("bim-tooltip") as any;
    labelTooltip.textContent = modelId;
    label.append(labelTooltip);

    const actions = document.createElement("div");
    actions.className = "models-row-actions";

    const hidden = isModelHidden(modelId);
    const eyeBtn = makeIconButton(hidden ? "mdi:eye-off" : "mdi:eye", hidden ? "Mostrar" : "Ocultar", async () => {
      await setModelVisible(modelId, isModelHidden(modelId));
      await fragments.core.update(true);
      render();
    });

    const deleteBtn = makeIconButton("mdi:delete", "Eliminar modelo", async () => {
      modelCollection.delete(modelId);
      hiddenModels.delete(modelId);
      modelColorIndex.delete(modelId);
      await fragments.core.disposeModel(modelId);
      render();
    });

    actions.append(eyeBtn, deleteBtn);
    row.append(icon, label, actions);
    return row;
  }

  function renderCollectionRow(col: Collection): HTMLElement {
    const memberIds = [...modelCollection.entries()]
      .filter(([id, cid]) => cid === col.id && fragments.list.has(id))
      .map(([id]) => id);

    const wrapper = document.createElement("div");
    wrapper.className = "collection-group";

    wrapper.addEventListener("dragover", (e: DragEvent) => {
      if (!draggedModelId && !dataLayersController?.isDraggingDataLayer()) return;
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
      const draggedLayerId = dataLayersController?.isDraggingDataLayer();
      if (draggedLayerId) {
        dataLayersController!.moveDataLayerTo(draggedLayerId, col.id);
        return;
      }
      const id = draggedModelId ?? e.dataTransfer?.getData("text/plain") ?? null;
      if (!id || !fragments.list.has(id)) return;
      col.expanded = true;
      moveModelTo(id, col.id);
    });

    const row = document.createElement("div");
    row.className = "collection-row";
    row.dataset.collectionId = col.id;

    const arrow = document.createElement("button");
    arrow.type = "button";
    arrow.className = "types-arrow" + (col.expanded ? " expanded" : "");
    arrow.setAttribute("aria-label", col.expanded ? "Colapsar" : "Expandir");
    const arrowIcon = document.createElement("bim-icon") as any;
    arrowIcon.icon = "material-symbols:chevron-right";
    const arrowTooltip = document.createElement("bim-tooltip") as any;
    arrowTooltip.textContent = col.expanded ? "Colapsar" : "Expandir";
    arrow.append(arrowIcon, arrowTooltip);
    arrow.addEventListener("click", (e) => {
      e.stopPropagation();
      col.expanded = !col.expanded;
      render();
    });

    const folderIcon = document.createElement("bim-icon") as any;
    folderIcon.icon = col.expanded ? "material-symbols:folder-open-outline" : "material-symbols:folder-outline";
    folderIcon.className = "collection-row-icon";

    const nameEl = document.createElement("span");
    nameEl.className = "collection-row-name";
    nameEl.textContent = col.name;
    const nameTooltip = document.createElement("bim-tooltip") as any;
    nameTooltip.textContent = "Doble click para renombrar";
    nameEl.append(nameTooltip);
    nameEl.addEventListener("dblclick", (e) => {
      e.stopPropagation();
      startRename(col, nameEl);
    });

    const actions = document.createElement("div");
    actions.className = "models-row-actions";

    const eyeBtn = makeIconButton(
      col.hidden ? "mdi:eye-off" : "mdi:eye",
      col.hidden ? "Mostrar colección" : "Ocultar colección",
      async () => {
        col.hidden = !col.hidden;
        await Promise.all(memberIds.map((id) => setModelVisible(id, !col.hidden)));
        await fragments.core.update(true);
        render();
      },
    );

    const deleteBtn = makeIconButton("mdi:folder-remove-outline", "Eliminar colección (los modelos y capas de datos quedan sin agrupar)", () => {
      for (const id of memberIds) modelCollection.set(id, null);
      dataLayersController?.onCollectionRemoved(col.id);
      const idx = collections.indexOf(col);
      if (idx >= 0) collections.splice(idx, 1);
      render();
    });

    actions.append(eyeBtn, deleteBtn);
    row.append(arrow, folderIcon, nameEl, actions);
    wrapper.append(row);

    const layerRows = dataLayersController?.renderForCollection(col.id) ?? [];
    if (col.expanded) {
      if (memberIds.length === 0 && layerRows.length === 0) {
        const empty = document.createElement("div");
        empty.className = "collection-empty";
        empty.textContent = "Vacía — arrastrá un modelo hasta acá";
        wrapper.append(empty);
      } else {
        for (const id of memberIds) wrapper.append(renderModelRow(id, true));
        for (const layerRow of layerRows) wrapper.append(layerRow);
      }
    }

    return wrapper;
  }

  function render(): void {
    root.innerHTML = "";

    const allModelIds = [...fragments.list.keys()];
    const looseLayerRows = dataLayersController?.renderForCollection(null) ?? [];

    if (allModelIds.length === 0 && collections.length === 0 && looseLayerRows.length === 0) {
      const empty = document.createElement("div");
      empty.className = "types-empty";
      empty.textContent = "No hay modelos IFC cargados";
      root.append(empty);
      return;
    }

    for (const col of collections) root.append(renderCollectionRow(col));

    const rootModelIds = allModelIds.filter((id) => (modelCollection.get(id) ?? null) === null);
    for (const id of rootModelIds) root.append(renderModelRow(id, false));

    for (const layerRow of looseLayerRows) root.append(layerRow);
  }

  // Soltar un modelo sobre el fondo del árbol (fuera de cualquier colección)
  // lo saca de su colección actual. Los drops dentro de una colección hacen
  // stopPropagation, así que este handler solo ve los que caen "afuera".
  root.addEventListener("dragover", (e: DragEvent) => {
    if (!draggedModelId && !dataLayersController?.isDraggingDataLayer()) return;
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
    root.classList.add("drag-over-root");
  });
  root.addEventListener("dragleave", (e: DragEvent) => {
    if (!root.contains(e.relatedTarget as Node)) root.classList.remove("drag-over-root");
  });
  root.addEventListener("drop", (e: DragEvent) => {
    e.preventDefault();
    root.classList.remove("drag-over-root");
    const draggedLayerId = dataLayersController?.isDraggingDataLayer();
    if (draggedLayerId) {
      dataLayersController!.moveDataLayerTo(draggedLayerId, null);
      return;
    }
    const id = draggedModelId ?? e.dataTransfer?.getData("text/plain") ?? null;
    if (!id || !fragments.list.has(id)) return;
    moveModelTo(id, null);
  });

  function addCollection(): Collection {
    collectionCounter += 1;
    const col: Collection = {
      id: `col-${Date.now()}-${collectionCounter}`,
      name: `Colección ${collectionCounter}`,
      expanded: true,
      hidden: false,
    };
    collections.push(col);
    return col;
  }

  /** Devuelve la colección por defecto, recreándola si el usuario la eliminó. */
  function ensureDefaultCollection(): Collection {
    const existing = collections.find((c) => c.id === defaultCollectionId);
    if (existing) return existing;
    const col = addCollection();
    defaultCollectionId = col.id;
    return col;
  }

  const createCollection = (): void => {
    const col = addCollection();
    render();
    requestAnimationFrame(() => {
      const nameEl = root.querySelector(
        `[data-collection-id="${col.id}"] .collection-row-name`,
      ) as HTMLElement | null;
      if (nameEl) startRename(col, nameEl);
    });
  };

  fragments.list.onItemSet.add(({ key }) => {
    if (!modelCollection.has(key)) {
      modelCollection.set(key, ensureDefaultCollection().id);
    }
    render();
  });
  fragments.list.onItemDeleted.add(() => render());

  defaultCollectionId = addCollection().id;
  render();

  return {
    element: root,
    createCollection,
    ensureDefaultCollectionId: () => ensureDefaultCollection().id,
    attachDataLayers: (controller) => { dataLayersController = controller; render(); },
    refresh: render,
  };
}
