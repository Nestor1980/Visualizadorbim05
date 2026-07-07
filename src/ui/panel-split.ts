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

  return split;
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
