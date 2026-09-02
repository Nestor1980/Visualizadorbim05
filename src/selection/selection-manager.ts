import * as OBC from "@thatopen/components";

/** Cómo se seleccionan elementos en el viewport mientras la herramienta
 *  "Navegar" está activa:
 *  - `click`  : un click simple selecciona el elemento bajo el cursor.
 *  - `box`    : arrastrar dibuja un rectángulo y selecciona lo que encierra.
 *  - `lasso`  : arrastrar dibuja un contorno a mano alzada ("cuerda") y
 *               selecciona lo que queda dentro.
 *  Solo `click` está implementado por ahora; `box` y `lasso` se construyen
 *  a continuación. */
export type SelectionMode = "click" | "box" | "lasso";

// Thin state holder for selection and isolation state.
// The actual UI updates live in RightPanel; this object is passed to the
// toolbar so it can read lastModelIdMap without importing UI modules.
export class SelectionManager {
  lastModelIdMap: OBC.ModelIdMap = {};
  isIsolated = false;
  selectionMode: SelectionMode = "click";
}
