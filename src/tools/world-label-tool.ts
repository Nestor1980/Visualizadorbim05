import * as THREE from "three";
import * as OBC from "@thatopen/components";
import * as OBF from "@thatopen/components-front";

export interface WorldLabel {
  id: string;
  title: string;
  comment: string;
  color: string;
  position: THREE.Vector3;
  mark: OBF.Mark;
  element: HTMLElement;
}

export interface WorldLabelTool {
  list: Map<string, WorldLabel>;
  onItemAdded: OBC.Event<WorldLabel>;
  onItemDeleted: OBC.Event<string>;
  /** Se dispara con la etiqueta recién seleccionada, o `null` al deseleccionar. */
  onSelectionChange: OBC.Event<WorldLabel | null>;
  createAt: (point: THREE.Vector3) => WorldLabel;
  deleteLabel: (id: string) => void;
  select: (id: string) => void;
  rename: (id: string, title: string) => void;
  /** Reabre una etiqueta ya creada en modo edición (título + comentario). */
  edit: (id: string) => void;
  setColor: (id: string, color: string) => void;
  /** Color usado para la próxima etiqueta a crear; también recolorea la etiqueta seleccionada. */
  setActiveColor: (color: string) => void;
  getActiveColor: () => string;
  updateLOD: () => void;
  /** Ícono fantasma que sigue el punto raycasteado bajo el cursor en modo
   *  "label", para previsualizar dónde va a quedar la próxima etiqueta.
   *  `null` la oculta. */
  previewAt: (point: THREE.Vector3 | null) => void;
}

/** Debajo de esta distancia (unidades de mundo) el marcador pasa de ícono a título. */
const TITLE_DISTANCE = 20;

/** Color por defecto de una etiqueta nueva (personalizable desde el panel lateral). */
const DEFAULT_LABEL_COLOR = "#e6553f";

export function createWorldLabelTool(world: OBC.World, viewport: HTMLElement): WorldLabelTool {
  const list = new Map<string, WorldLabel>();
  const onItemAdded       = new OBC.Event<WorldLabel>();
  const onItemDeleted     = new OBC.Event<string>();
  const onSelectionChange = new OBC.Event<WorldLabel | null>();

  let labelCounter = 0;
  let selectedId: string | null = null;
  let activeColor = DEFAULT_LABEL_COLOR;

  function applyState(label: WorldLabel): void {
    if (!label.mark.visible) return;
    const state =
      label.id === selectedId ? "expanded" :
      world.camera.three.position.distanceTo(label.position) < TITLE_DISTANCE ? "title" :
      "icon";
    label.element.dataset.state = state;
  }

  function applyColor(label: WorldLabel): void {
    label.element.style.setProperty("--label-color", label.color);
  }

  function deselect(): void {
    if (!selectedId) return;
    const prev = list.get(selectedId);
    selectedId = null;
    if (prev) applyState(prev);
    onSelectionChange.trigger(null);
  }

  function select(id: string): void {
    if (selectedId === id) return;
    const prev = selectedId ? list.get(selectedId) : null;
    selectedId = id;
    if (prev) applyState(prev);
    const label = list.get(id);
    if (label) applyState(label);
    onSelectionChange.trigger(label ?? null);
  }

  function setColor(id: string, color: string): void {
    const label = list.get(id);
    if (!label) return;
    label.color = color;
    applyColor(label);
  }

  function setActiveColor(color: string): void {
    activeColor = color;
    if (selectedId) setColor(selectedId, color);
  }

  function getActiveColor(): string {
    return activeColor;
  }

  viewport.addEventListener("pointerdown", (e: PointerEvent) => {
    if ((e.target as HTMLElement).closest(".world-label")) return;
    deselect();
  });

  function renderTitle(label: WorldLabel, titleEl: HTMLElement): void {
    titleEl.textContent = label.title;
    titleEl.className = "world-label-title";
    titleEl.addEventListener("click", (e) => { e.stopPropagation(); select(label.id); });
    titleEl.addEventListener("dblclick", (e) => {
      e.stopPropagation();
      enterEditMode(label);
    });
  }

  function renderComment(label: WorldLabel, commentEl: HTMLElement): void {
    commentEl.textContent = label.comment;
    commentEl.className = "world-label-comment";
    commentEl.addEventListener("click", (e) => { e.stopPropagation(); select(label.id); });
    commentEl.addEventListener("dblclick", (e) => {
      e.stopPropagation();
      enterEditMode(label);
    });
  }

  function enterEditMode(label: WorldLabel): void {
    select(label.id);
    label.element.dataset.state = "expanded";

    const titleField   = label.element.querySelector(".world-label-title, .world-label-title-input");
    const commentField = label.element.querySelector(".world-label-comment, .world-label-comment-textarea");
    if (!titleField || !commentField) return;

    const titleInput = document.createElement("input");
    titleInput.type      = "text";
    titleInput.className = "world-label-title-input";
    titleInput.value     = label.title;
    titleInput.placeholder = `Etiqueta ${labelCounter}`;

    const commentInput = document.createElement("textarea");
    commentInput.className   = "world-label-comment-textarea";
    commentInput.value       = label.comment;
    commentInput.placeholder = "Comentario…";
    commentInput.rows        = 2;

    titleField.replaceWith(titleInput);
    commentField.replaceWith(commentInput);

    const actions = document.createElement("div");
    actions.className = "world-label-edit-actions";

    const deleteBtn = document.createElement("button");
    deleteBtn.type      = "button";
    deleteBtn.className = "world-label-edit-btn world-label-edit-delete";
    const deleteIcon = document.createElement("bim-icon") as any;
    deleteIcon.icon = "mdi:trash-can-outline";
    deleteBtn.append(deleteIcon);

    const cancelBtn = document.createElement("button");
    cancelBtn.type      = "button";
    cancelBtn.className = "world-label-edit-btn world-label-edit-cancel";
    const cancelIcon = document.createElement("bim-icon") as any;
    cancelIcon.icon = "mdi:close";
    cancelBtn.append(cancelIcon);

    const acceptBtn = document.createElement("button");
    acceptBtn.type      = "button";
    acceptBtn.className = "world-label-edit-btn world-label-edit-accept";
    const acceptIcon = document.createElement("bim-icon") as any;
    acceptIcon.icon = "mdi:check";
    acceptBtn.append(acceptIcon);

    const confirmActions = document.createElement("div");
    confirmActions.className = "world-label-edit-actions-group";
    confirmActions.append(cancelBtn, acceptBtn);

    actions.append(deleteBtn, confirmActions);
    // El padre de commentInput es la tarjeta (".world-label-card"); ambos
    // campos ya fueron insertados ahí arriba vía replaceWith.
    commentInput.parentElement?.append(actions);

    // Cancelar solo descarta los cambios del formulario y vuelve a mostrar
    // el título/comentario tal como estaban; borrar la etiqueta es una acción
    // aparte (botón de papelera) para no perder la nota por error.
    const finishEdit = (save: boolean) => {
      // Ya se hizo commit/cancel (blur en cascada de ambos campos); evita duplicarlo.
      if (!titleInput.isConnected) return;
      if (save) {
        label.title   = titleInput.value.trim() || `Etiqueta ${labelCounter}`;
        label.comment = commentInput.value.trim();
      }

      const newTitleEl = document.createElement("div");
      renderTitle(label, newTitleEl);
      const newCommentEl = document.createElement("div");
      renderComment(label, newCommentEl);
      titleInput.replaceWith(newTitleEl);
      commentInput.replaceWith(newCommentEl);
      actions.remove();
      applyState(label);
    };
    const commit = () => finishEdit(true);

    const scheduleCommitCheck = () => {
      requestAnimationFrame(() => {
        const active = document.activeElement;
        if (active !== titleInput && active !== commentInput) commit();
      });
    };

    // preventDefault en mousedown evita que el input/textarea pierda el foco
    // (y por lo tanto que dispare blur -> commit) antes de leer la acción real.
    deleteBtn.addEventListener("mousedown", (e) => e.preventDefault());
    cancelBtn.addEventListener("mousedown", (e) => e.preventDefault());
    acceptBtn.addEventListener("mousedown", (e) => e.preventDefault());
    deleteBtn.addEventListener("click", (e) => { e.stopPropagation(); deleteLabel(label.id); });
    cancelBtn.addEventListener("click", (e) => { e.stopPropagation(); finishEdit(false); });
    acceptBtn.addEventListener("click", (e) => { e.stopPropagation(); finishEdit(true); });

    titleInput.addEventListener("keydown", (e) => {
      e.stopPropagation();
      if (e.key === "Enter") { e.preventDefault(); commentInput.focus(); }
      else if (e.key === "Escape") { e.preventDefault(); finishEdit(false); }
    });
    commentInput.addEventListener("keydown", (e) => {
      e.stopPropagation();
      if (e.key === "Escape") { e.preventDefault(); finishEdit(false); }
      else if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); commit(); }
    });
    titleInput.addEventListener("blur", scheduleCommitCheck);
    commentInput.addEventListener("blur", scheduleCommitCheck);
    titleInput.addEventListener("click", (e) => e.stopPropagation());
    commentInput.addEventListener("click", (e) => e.stopPropagation());

    titleInput.focus();
    titleInput.select();
  }

  function createAt(point: THREE.Vector3): WorldLabel {
    labelCounter += 1;
    const id = `label-${Date.now()}-${labelCounter}`;

    const element = document.createElement("div");
    element.className   = "world-label";
    element.dataset.state = "expanded";

    const badge = document.createElement("div");
    badge.className = "world-label-badge";
    const icon = document.createElement("bim-icon") as any;
    icon.icon  = "mdi:note-text-outline";
    badge.append(icon);
    badge.addEventListener("click", (e) => { e.stopPropagation(); select(id); });

    const card = document.createElement("div");
    card.className = "world-label-card";

    const titleEl   = document.createElement("div");
    const commentEl = document.createElement("div");

    card.append(titleEl, commentEl);
    element.append(badge, card);

    const mark = new OBF.Mark(world, element);
    mark.three.position.copy(point);
    // Ancla el punto 3D en el borde inferior del badge (como un pin de mapa)
    // en vez del centro geométrico de todo el bloque título+comentario.
    mark.three.center.set(0.5, 1);

    const label: WorldLabel = {
      id,
      title:   `Etiqueta ${labelCounter}`,
      comment: "",
      color: activeColor,
      position: point.clone(),
      mark,
      element,
    };
    applyColor(label);
    renderTitle(label, titleEl);
    renderComment(label, commentEl);
    list.set(id, label);

    enterEditMode(label);
    onItemAdded.trigger(label);
    return label;
  }

  function rename(id: string, title: string): void {
    const label = list.get(id);
    if (!label) return;
    label.title = title.trim() || label.title;
    const titleEl = label.element.querySelector(".world-label-title");
    if (titleEl) titleEl.textContent = label.title;
  }

  function edit(id: string): void {
    const label = list.get(id);
    if (label) enterEditMode(label);
  }

  function deleteLabel(id: string): void {
    const label = list.get(id);
    if (!label) return;
    if (selectedId === id) {
      selectedId = null;
      onSelectionChange.trigger(null);
    }
    label.mark.dispose();
    list.delete(id);
    onItemDeleted.trigger(id);
  }

  function updateLOD(): void {
    for (const label of list.values()) applyState(label);
  }

  let previewMark: OBF.Mark | null = null;
  function ensurePreviewMark(): OBF.Mark {
    if (previewMark) return previewMark;
    const el = document.createElement("div");
    el.className = "world-label-preview";
    const icon = document.createElement("bim-icon") as any;
    icon.icon = "mdi:note-plus-outline";
    el.append(icon);
    previewMark = new OBF.Mark(world, el);
    previewMark.three.center.set(0.5, 1);
    previewMark.visible = false;
    return previewMark;
  }

  function previewAt(point: THREE.Vector3 | null): void {
    const mark = ensurePreviewMark();
    if (!point) {
      mark.visible = false;
      return;
    }
    mark.three.position.copy(point);
    mark.visible = true;
  }

  return {
    list, onItemAdded, onItemDeleted, onSelectionChange,
    createAt, deleteLabel, select, rename, edit, setColor, setActiveColor, getActiveColor,
    updateLOD, previewAt,
  };
}
