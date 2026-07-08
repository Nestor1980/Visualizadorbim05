/**
 * Arrastre por header para un <dialog> modal: al agarrar, la posición pasa de
 * estar centrada por transform (ver CSS del modal) a top/left absolutos en
 * px, así el drag no pelea con el translate(-50%,-50%) del centrado inicial.
 */
export function makeModalDraggable(modal: HTMLDialogElement, header: HTMLElement, closeSelector: string): void {
  let dragOffsetX = 0;
  let dragOffsetY = 0;

  const onPointerMove = (event: PointerEvent) => {
    modal.style.left = `${event.clientX - dragOffsetX}px`;
    modal.style.top  = `${event.clientY - dragOffsetY}px`;
  };
  const onPointerUp = (event: PointerEvent) => {
    header.releasePointerCapture(event.pointerId);
    header.removeEventListener("pointermove", onPointerMove);
    header.removeEventListener("pointerup", onPointerUp);
  };
  header.addEventListener("pointerdown", (event) => {
    if ((event.target as HTMLElement).closest(closeSelector)) return;
    const rect = modal.getBoundingClientRect();
    modal.style.transform = "none";
    modal.style.top  = `${rect.top}px`;
    modal.style.left = `${rect.left}px`;
    dragOffsetX = event.clientX - rect.left;
    dragOffsetY = event.clientY - rect.top;
    header.setPointerCapture(event.pointerId);
    header.addEventListener("pointermove", onPointerMove);
    header.addEventListener("pointerup", onPointerUp);
  });
}

/** Limpia la posición arrastrada para que el modal vuelva a nacer centrado. */
export function resetModalPosition(modal: HTMLDialogElement): void {
  modal.style.top = "";
  modal.style.left = "";
  modal.style.transform = "";
}

/** Cierra el modal al hacer click en el backdrop (fuera del contenido). */
export function closeOnBackdropClick(modal: HTMLDialogElement): void {
  modal.addEventListener("click", (event) => {
    if (event.target === modal) modal.close();
  });
}
