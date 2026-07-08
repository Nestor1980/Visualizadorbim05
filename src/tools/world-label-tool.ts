import * as THREE from "three";
import * as OBC from "@thatopen/components";
import * as OBF from "@thatopen/components-front";

export interface WorldLabel {
  id: string;
  title: string;
  comment: string;
  position: THREE.Vector3;
  mark: OBF.Mark;
  element: HTMLElement;
}

export interface WorldLabelTool {
  list: Map<string, WorldLabel>;
  onItemAdded: OBC.Event<WorldLabel>;
  onItemDeleted: OBC.Event<string>;
  createAt: (point: THREE.Vector3) => WorldLabel;
  deleteLabel: (id: string) => void;
  select: (id: string) => void;
  rename: (id: string, title: string) => void;
  updateLOD: () => void;
  /** Ícono fantasma que sigue el punto raycasteado bajo el cursor en modo
   *  "label", para previsualizar dónde va a quedar la próxima etiqueta.
   *  `null` la oculta. */
  previewAt: (point: THREE.Vector3 | null) => void;
}

/** Debajo de esta distancia (unidades de mundo) el marcador pasa de ícono a título. */
const TITLE_DISTANCE = 20;

export function createWorldLabelTool(world: OBC.World, viewport: HTMLElement): WorldLabelTool {
  const list = new Map<string, WorldLabel>();
  const onItemAdded   = new OBC.Event<WorldLabel>();
  const onItemDeleted = new OBC.Event<string>();

  let labelCounter = 0;
  let selectedId: string | null = null;

  function applyState(label: WorldLabel): void {
    if (!label.mark.visible) return;
    const state =
      label.id === selectedId ? "expanded" :
      world.camera.three.position.distanceTo(label.position) < TITLE_DISTANCE ? "title" :
      "icon";
    label.element.dataset.state = state;
  }

  function deselect(): void {
    if (!selectedId) return;
    const prev = list.get(selectedId);
    selectedId = null;
    if (prev) applyState(prev);
  }

  function select(id: string): void {
    if (selectedId === id) return;
    const prev = selectedId ? list.get(selectedId) : null;
    selectedId = id;
    if (prev) applyState(prev);
    const label = list.get(id);
    if (label) applyState(label);
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

    const commit = () => {
      // Ya se hizo commit (blur en cascada de ambos campos); evita doble commit.
      if (!titleInput.isConnected) return;
      label.title   = titleInput.value.trim() || `Etiqueta ${labelCounter}`;
      label.comment = commentInput.value.trim();

      const newTitleEl = document.createElement("div");
      renderTitle(label, newTitleEl);
      const newCommentEl = document.createElement("div");
      renderComment(label, newCommentEl);
      titleInput.replaceWith(newTitleEl);
      commentInput.replaceWith(newCommentEl);
      applyState(label);
    };

    const scheduleCommitCheck = () => {
      requestAnimationFrame(() => {
        const active = document.activeElement;
        if (active !== titleInput && active !== commentInput) commit();
      });
    };

    titleInput.addEventListener("keydown", (e) => {
      e.stopPropagation();
      if (e.key === "Enter") { e.preventDefault(); commentInput.focus(); }
      else if (e.key === "Escape") { e.preventDefault(); commit(); }
    });
    commentInput.addEventListener("keydown", (e) => {
      e.stopPropagation();
      if (e.key === "Escape" || (e.key === "Enter" && (e.metaKey || e.ctrlKey))) {
        e.preventDefault();
        commit();
      }
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

    const titleEl   = document.createElement("div");
    const commentEl = document.createElement("div");

    element.append(badge, titleEl, commentEl);

    const mark = new OBF.Mark(world, element);
    mark.three.position.copy(point);
    // Ancla el punto 3D en el borde inferior del badge (como un pin de mapa)
    // en vez del centro geométrico de todo el bloque título+comentario.
    mark.three.center.set(0.5, 1);

    const label: WorldLabel = {
      id,
      title:   `Etiqueta ${labelCounter}`,
      comment: "",
      position: point.clone(),
      mark,
      element,
    };
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

  function deleteLabel(id: string): void {
    const label = list.get(id);
    if (!label) return;
    if (selectedId === id) selectedId = null;
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

  return { list, onItemAdded, onItemDeleted, createAt, deleteLabel, select, rename, updateLOD, previewAt };
}
