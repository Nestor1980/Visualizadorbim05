import * as OBC from "@thatopen/components";

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
  let closeOpenMenu: (() => void) | null = null;

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

  function openMoveMenu(anchor: HTMLElement, modelId: string): void {
    closeOpenMenu?.();

    const menu = document.createElement("div");
    menu.className = "row-menu";

    const addItem = (label: string, active: boolean, onSelect: () => void) => {
      const item = document.createElement("button");
      item.type = "button";
      item.className = "row-menu-item" + (active ? " is-active" : "");
      item.textContent = label;
      item.addEventListener("click", (e) => {
        e.stopPropagation();
        onSelect();
        close();
      });
      menu.append(item);
    };

    const currentCollectionId = modelCollection.get(modelId) ?? null;
    addItem("Sin colección", currentCollectionId === null, () => {
      modelCollection.set(modelId, null);
      render();
    });
    for (const col of collections) {
      addItem(col.name, currentCollectionId === col.id, () => {
        modelCollection.set(modelId, col.id);
        col.expanded = true;
        render();
      });
    }
    if (collections.length === 0) {
      const hint = document.createElement("div");
      hint.className = "row-menu-hint";
      hint.textContent = "Crea una colección primero";
      menu.append(hint);
    }

    document.body.append(menu);
    const rect = anchor.getBoundingClientRect();
    menu.style.position = "fixed";
    menu.style.top  = `${rect.bottom + 4}px`;
    menu.style.left = `${Math.min(rect.left, window.innerWidth - menu.offsetWidth - 8)}px`;

    const close = () => {
      menu.remove();
      document.removeEventListener("pointerdown", onOutside, true);
      if (closeOpenMenu === close) closeOpenMenu = null;
    };
    const onOutside = (e: PointerEvent) => {
      if (!menu.contains(e.target as Node)) close();
    };
    requestAnimationFrame(() => document.addEventListener("pointerdown", onOutside, true));
    closeOpenMenu = close;
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

    const moveBtn = makeIconButton("material-symbols:drive-file-move-outline", "Mover a colección", () => {
      openMoveMenu(moveBtn, modelId);
    });

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

    actions.append(moveBtn, eyeBtn, deleteBtn);
    row.append(icon, label, actions);
    return row;
  }

  function renderCollectionRow(col: Collection): HTMLElement {
    const memberIds = [...modelCollection.entries()]
      .filter(([id, cid]) => cid === col.id && fragments.list.has(id))
      .map(([id]) => id);

    const wrapper = document.createElement("div");
    wrapper.className = "collection-group";

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

    const deleteBtn = makeIconButton("mdi:folder-remove-outline", "Eliminar colección (los modelos quedan sin agrupar)", () => {
      for (const id of memberIds) modelCollection.set(id, null);
      const idx = collections.indexOf(col);
      if (idx >= 0) collections.splice(idx, 1);
      render();
    });

    actions.append(eyeBtn, deleteBtn);
    row.append(arrow, folderIcon, nameEl, actions);
    wrapper.append(row);

    if (col.expanded) {
      if (memberIds.length === 0) {
        const empty = document.createElement("div");
        empty.className = "collection-empty";
        empty.textContent = "Vacía — usa \"Mover a colección\" en un modelo";
        wrapper.append(empty);
      } else {
        for (const id of memberIds) wrapper.append(renderModelRow(id, true));
      }
    }

    return wrapper;
  }

  function render(): void {
    closeOpenMenu?.();
    root.innerHTML = "";

    const allModelIds = [...fragments.list.keys()];

    if (allModelIds.length === 0 && collections.length === 0) {
      const empty = document.createElement("div");
      empty.className = "types-empty";
      empty.textContent = "No hay modelos IFC cargados";
      root.append(empty);
      return;
    }

    for (const col of collections) root.append(renderCollectionRow(col));

    const rootModelIds = allModelIds.filter((id) => (modelCollection.get(id) ?? null) === null);
    for (const id of rootModelIds) root.append(renderModelRow(id, false));
  }

  const createCollection = (): void => {
    collectionCounter += 1;
    const col: Collection = {
      id: `col-${Date.now()}-${collectionCounter}`,
      name: `Colección ${collectionCounter}`,
      expanded: true,
      hidden: false,
    };
    collections.push(col);
    render();
    requestAnimationFrame(() => {
      const nameEl = root.querySelector(
        `[data-collection-id="${col.id}"] .collection-row-name`,
      ) as HTMLElement | null;
      if (nameEl) startRename(col, nameEl);
    });
  };

  fragments.list.onItemSet.add(() => render());
  fragments.list.onItemDeleted.add(() => render());
  render();

  return { element: root, createCollection };
}
