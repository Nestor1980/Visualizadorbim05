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
  /** Recrea una etiqueta ya con título/comentario/color fijos (sin entrar a modo
   *  edición), usada al restaurar un proyecto guardado. */
  createFromData: (data: { title: string; comment: string; color: string; position: THREE.Vector3 }) => WorldLabel;
  deleteLabel: (id: string) => void;
  select: (id: string) => void;
  getSelected: () => WorldLabel | null;
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
const DEFAULT_LABEL_COLOR = "#74ac49";

/** Tamaño de guión/espacio (unidades del mundo) de la línea punteada que
 *  conecta la etiqueta arrastrada con el punto original que señala. */
const LEADER_DASH_SIZE = 0.06;
const LEADER_GAP_SIZE  = 0.05;
/** Distancia mínima (unidades del mundo) entre la etiqueta y su posición
 *  original para mostrar la línea punteada — evita dibujarla cuando la
 *  etiqueta está prácticamente en su lugar. */
const LEADER_MIN_DISTANCE = 0.05;
/** Movimiento mínimo (px de pantalla) antes de que un pointerdown sobre la
 *  etiqueta se interprete como arrastre en vez de click (selección) o
 *  dblclick (edición) — sin esto, cualquier click dispararía también un
 *  micro-arrastre. */
const DRAG_THRESHOLD_PX = 4;

export function createWorldLabelTool(world: OBC.World, viewport: HTMLElement): WorldLabelTool {
  const list = new Map<string, WorldLabel>();
  const onItemAdded       = new OBC.Event<WorldLabel>();
  const onItemDeleted     = new OBC.Event<string>();
  const onSelectionChange = new OBC.Event<WorldLabel | null>();

  let labelCounter = 0;
  let selectedId: string | null = null;
  let activeColor = DEFAULT_LABEL_COLOR;

  interface LabelLeader {
    leader: THREE.Line;
    material: THREE.LineDashedMaterial;
  }
  const leaders = new Map<string, LabelLeader>();

  function createLeader(colorHex: string): LabelLeader {
    const material = new THREE.LineDashedMaterial({
      color: colorHex,
      dashSize: LEADER_DASH_SIZE,
      gapSize: LEADER_GAP_SIZE,
      // Sin esto, el tramo de línea que cae "detrás" de geometría del modelo
      // (frecuente: la etiqueta se arrastra lejos de su punto de anclaje,
      // muchas veces al aire, y la línea recta entre ambos atraviesa la
      // fachada) se recorta por el z-buffer y parece terminar en la
      // superficie en vez de seguir hasta la coordenada real.
      depthTest: false,
    });
    // Se usa THREE.Line (nativo) en vez del Line2/LineMaterial "fat line" de
    // three/examples: ese shader extruye el grosor en espacio de pantalla a
    // partir de las posiciones proyectadas de ambos extremos, y en ciertos
    // ángulos de cámara (frecuentes al orbitar) esa extrusión degenera y la
    // línea entera desaparece un frame sí, uno no. THREE.Line no tiene ese
    // problema (es la primitiva GL_LINE_STRIP de toda la vida); a cambio no
    // se puede pedir un grosor en píxeles fijo, pero para una línea guía
    // fina de 1px eso no hace falta.
    const leader = new THREE.Line(new THREE.BufferGeometry(), material);
    leader.renderOrder = 10;
    leader.visible = false;
    world.scene.three.add(leader);
    return { leader, material };
  }

  /** Actualiza (o esconde) la línea punteada entre el punto original de la
   *  etiqueta y la posición actual de su mark, que puede haberse arrastrado. */
  function updateLeader(label: WorldLabel): void {
    const visual = leaders.get(label.id);
    if (!visual) return;
    const anchor = label.position;
    const pos = label.mark.three.position;
    const show = label.mark.visible && anchor.distanceTo(pos) > LEADER_MIN_DISTANCE;
    visual.leader.visible = show;
    if (!show) return;
    visual.leader.geometry.setFromPoints([anchor, pos]);
    visual.leader.computeLineDistances();
  }

  function applyState(label: WorldLabel): void {
    updateLeader(label);
    if (!label.mark.visible) return;
    const state =
      label.id === selectedId ? "expanded" :
      world.camera.three.position.distanceTo(label.position) < TITLE_DISTANCE ? "title" :
      "icon";
    label.element.dataset.state = state;
  }

  function applyColor(label: WorldLabel): void {
    label.element.style.setProperty("--label-color", label.color);
    const picker = label.element.querySelector<HTMLInputElement>(".world-label-color-input");
    if (picker && picker.value !== label.color) picker.value = label.color;
    const visual = leaders.get(label.id);
    if (visual) visual.material.color.set(label.color);
  }

  /**
   * Permite arrastrar la etiqueta entera (badge, título o comentario) en el
   * plano paralelo a la cámara, a la profundidad en la que ya está. Mientras
   * se aleja del punto 3D original donde se creó, se dibuja una línea
   * punteada uniéndola con ese punto; si vuelve a acercarse, se oculta de
   * nuevo. Igual que el arrastre de etiquetas del medidor de distancias.
   *
   * El listener va en `element` (no en un handle fijo) porque el badge se
   * oculta vía CSS en los estados "title"/"expanded" — hay que poder agarrar
   * desde el título o el comentario también. Para no romper el click
   * (seleccionar) ni el dblclick (editar) que ya tienen esos nodos, el
   * arrastre solo se arma tras superar `DRAG_THRESHOLD_PX`; si el puntero no
   * se movió lo suficiente, nunca se llama a `preventDefault` y el
   * click/dblclick nativo sigue su curso normal.
   */
  function setupLabelDrag(label: WorldLabel, element: HTMLElement): void {
    const plane = new THREE.Plane();
    const raycaster = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    const cameraDirection = new THREE.Vector3();
    const target = new THREE.Vector3();
    let dragging = false;
    let armedPointerId: number | null = null;
    let downX = 0;
    let downY = 0;

    const pickOnPlane = (event: PointerEvent): boolean => {
      if (!world.renderer) return false;
      const rect = world.renderer.three.domElement.getBoundingClientRect();
      ndc.set(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        -((event.clientY - rect.top) / rect.height) * 2 + 1,
      );
      raycaster.setFromCamera(ndc, world.camera.three);
      return raycaster.ray.intersectPlane(plane, target) !== null;
    };

    element.addEventListener("pointerdown", (event: PointerEvent) => {
      if (event.button !== 0) return;
      // Los controles de edición (inputs, botones, color picker) deben
      // conservar su comportamiento nativo sin iniciar un arrastre.
      if ((event.target as HTMLElement).closest("input, textarea, button, .world-label-color-input")) return;
      armedPointerId = event.pointerId;
      downX = event.clientX;
      downY = event.clientY;
    });

    element.addEventListener("pointermove", (event: PointerEvent) => {
      if (event.pointerId !== armedPointerId) return;
      if (!dragging) {
        const dx = event.clientX - downX;
        const dy = event.clientY - downY;
        if (dx * dx + dy * dy < DRAG_THRESHOLD_PX * DRAG_THRESHOLD_PX) return;
        dragging = true;
        select(label.id);
        document.body.style.cursor = "grabbing";
        element.setPointerCapture(event.pointerId);
        (world.camera as OBC.OrthoPerspectiveCamera).setUserInput(false);
        world.camera.three.getWorldDirection(cameraDirection);
        plane.setFromNormalAndCoplanarPoint(cameraDirection, label.mark.three.position);
      }
      event.stopPropagation();
      event.preventDefault();
      if (pickOnPlane(event)) {
        label.mark.three.position.copy(target);
        updateLeader(label);
      }
    });

    const endDrag = (event: PointerEvent): void => {
      if (event.pointerId !== armedPointerId) return;
      if (dragging) {
        element.releasePointerCapture(event.pointerId);
        (world.camera as OBC.OrthoPerspectiveCamera).setUserInput(true);
        document.body.style.cursor = "";
      }
      dragging = false;
      armedPointerId = null;
    };
    element.addEventListener("pointerup", endDrag);
    element.addEventListener("pointercancel", endDrag);
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

  function getSelected(): WorldLabel | null {
    return selectedId ? list.get(selectedId) ?? null : null;
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

  function createColorPicker(label: WorldLabel): HTMLInputElement {
    const input = document.createElement("input");
    input.type      = "color";
    input.className = "world-label-color-input";
    input.value     = label.color;
    input.title     = "Color de la etiqueta";
    input.addEventListener("click", (e) => { e.stopPropagation(); select(label.id); });
    input.addEventListener("input", (e) => {
      e.stopPropagation();
      setColor(label.id, (e.target as HTMLInputElement).value);
    });
    return input;
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
    label.element.classList.add("world-label-editing");

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
      label.element.classList.remove("world-label-editing");
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

    const titleRow = document.createElement("div");
    titleRow.className = "world-label-title-row";

    const titleEl   = document.createElement("div");
    const commentEl = document.createElement("div");

    card.append(titleRow, commentEl);
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
    leaders.set(id, createLeader(label.color));
    titleRow.append(titleEl, createColorPicker(label));
    applyColor(label);
    renderTitle(label, titleEl);
    renderComment(label, commentEl);
    list.set(id, label);
    setupLabelDrag(label, element);

    enterEditMode(label);
    onItemAdded.trigger(label);
    return label;
  }

  /** Igual que `createAt`, pero con título/comentario/color fijos de entrada y
   *  sin abrir el modo edición — pensada para restaurar un proyecto guardado,
   *  no para la creación interactiva del usuario. */
  function createFromData(data: { title: string; comment: string; color: string; position: THREE.Vector3 }): WorldLabel {
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

    const titleRow = document.createElement("div");
    titleRow.className = "world-label-title-row";

    const titleEl   = document.createElement("div");
    const commentEl = document.createElement("div");

    card.append(titleRow, commentEl);
    element.append(badge, card);

    const mark = new OBF.Mark(world, element);
    mark.three.position.copy(data.position);
    mark.three.center.set(0.5, 1);

    const label: WorldLabel = {
      id,
      title:   data.title,
      comment: data.comment,
      color:   data.color,
      position: data.position.clone(),
      mark,
      element,
    };
    leaders.set(id, createLeader(label.color));
    titleRow.append(titleEl, createColorPicker(label));
    applyColor(label);
    renderTitle(label, titleEl);
    renderComment(label, commentEl);
    list.set(id, label);
    setupLabelDrag(label, element);

    applyState(label);
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
    const visual = leaders.get(id);
    if (visual) {
      world.scene.three.remove(visual.leader);
      visual.leader.geometry.dispose();
      visual.material.dispose();
      leaders.delete(id);
    }
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
    createAt, createFromData, deleteLabel, select, getSelected, rename, edit, setColor, setActiveColor, getActiveColor,
    updateLOD, previewAt,
  };
}
