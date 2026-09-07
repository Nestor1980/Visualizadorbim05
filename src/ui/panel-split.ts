export const SCENE_FRAME_MIN_HEIGHT = 160;
export const SCENE_FRAME_DEFAULT_HEIGHT = 320;

/**
 * Apila dos frames del panel derecho en columna ("Escena" arriba, paneles
 * dinámicos abajo), con un handle de arrastre horizontal entre ambos que
 * muta --scene-h (altura del frame superior) en vez de tocar el layout del
 * bim-grid — misma idea que attachRightPanelResize pero en el eje vertical.
 */
export function createPanelSplit(topFrame: HTMLElement, bottomFrame: HTMLElement): HTMLElement {
  const split = document.createElement("div");
  split.className = "panel-split";

  const topPane = document.createElement("div");
  topPane.className = "panel-split-pane panel-split-pane--top";
  topPane.append(topFrame);

  const handle = document.createElement("div");
  handle.className = "panel-split-handle";
  handle.setAttribute("role", "separator");
  handle.setAttribute("aria-orientation", "horizontal");
  handle.setAttribute("aria-label", "Redimensionar paneles");

  const bottomPane = document.createElement("div");
  bottomPane.className = "panel-split-pane panel-split-pane--bottom";
  bottomPane.append(bottomFrame);

  split.append(topPane, handle, bottomPane);
  attachPanelSplitResize(split, handle);
  keepSceneHeightInBounds(split);

  return split;
}

/** Vuelve a acotar `--scene-h` cada vez que cambia el alto del split (resize
 *  de ventana, aparición de otra barra, cambio de layout). Sin esto, un
 *  `--scene-h` fijado con el panel alto se mantiene en px aunque después el
 *  contenedor se achique: el frame "Escena" (`flex: 0 0 var(--scene-h)`) se
 *  queda con más alto del que hay y el frame de abajo ("Información") se
 *  monta por encima. */
function keepSceneHeightInBounds(split: HTMLElement): void {
  const clamp = () => {
    const raw = getComputedStyle(split).getPropertyValue("--scene-h");
    const current = parseFloat(raw);
    if (!Number.isFinite(current)) return; // usa el default del CSS, ya acotado
    const splitHeight = split.getBoundingClientRect().height;
    if (splitHeight === 0) return;
    const maxHeight = Math.max(SCENE_FRAME_MIN_HEIGHT, splitHeight - SCENE_FRAME_MIN_HEIGHT);
    const clamped = Math.min(maxHeight, Math.max(SCENE_FRAME_MIN_HEIGHT, current));
    if (Math.abs(clamped - current) > 0.5) split.style.setProperty("--scene-h", `${clamped}px`);
  };
  if (typeof ResizeObserver !== "undefined") {
    new ResizeObserver(clamp).observe(split);
  } else {
    window.addEventListener("resize", clamp);
  }
}

function attachPanelSplitResize(split: HTMLElement, handle: HTMLElement): void {
  handle.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    const startY = event.clientY;
    const startHeight =
      parseFloat(getComputedStyle(split).getPropertyValue("--scene-h")) || SCENE_FRAME_DEFAULT_HEIGHT;
    handle.setPointerCapture(event.pointerId);
    document.body.classList.add("resizing-panel-split");

    let pendingY: number | null = null;
    let rafId = 0;

    const applyPending = () => {
      rafId = 0;
      if (pendingY === null) return;
      const splitHeight = split.getBoundingClientRect().height;
      const maxHeight = Math.max(SCENE_FRAME_MIN_HEIGHT, splitHeight - SCENE_FRAME_MIN_HEIGHT);
      const next = startHeight + (pendingY - startY);
      const clamped = Math.min(maxHeight, Math.max(SCENE_FRAME_MIN_HEIGHT, next));
      split.style.setProperty("--scene-h", `${clamped}px`);
      pendingY = null;
    };

    const onMove = (moveEvent: PointerEvent) => {
      pendingY = moveEvent.clientY;
      if (!rafId) rafId = requestAnimationFrame(applyPending);
    };
    const onUp = () => {
      if (rafId) cancelAnimationFrame(rafId);
      applyPending();
      handle.releasePointerCapture(event.pointerId);
      document.body.classList.remove("resizing-panel-split");
      handle.removeEventListener("pointermove", onMove);
      handle.removeEventListener("pointerup", onUp);
    };
    handle.addEventListener("pointermove", onMove);
    handle.addEventListener("pointerup", onUp);
  });
}
