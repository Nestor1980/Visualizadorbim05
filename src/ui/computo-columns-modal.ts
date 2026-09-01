import * as OBC from "@thatopen/components";
import * as BUI from "@thatopen/ui";
import { makeModalDraggable, resetModalPosition, closeOnBackdropClick } from "./draggable-modal";
import { listSeenPsets } from "../ifc/pset-visibility";
import { scanAllModelsForPsets } from "../ifc/pset-scan";
import {
  listAllColumns, subscribeColumns,
  setColumnVisible, moveColumn,
  addPsetColumn, renamePsetColumn, removePsetColumn, resetColumns,
} from "../computo/computo-columns";

export interface ComputoColumnsModal {
  modal: HTMLDialogElement;
  openModal: () => void;
}

function escapeHtml(value: string): string {
  const div = document.createElement("div");
  div.textContent = value;
  return div.innerHTML;
}

/**
 * Modal "Columnas del Cómputo": editar qué columnas se ven en la tabla de
 * Cómputo y en sus exportaciones (Excel/PDF), su orden, y agregar columnas
 * extra que toman su valor de una propiedad de un Property Set del modelo
 * (ver `computo-columns.ts` — todo se guarda en este navegador, no en el
 * proyecto).
 *
 * El catálogo de PSets/propiedades disponibles para agregar sale de
 * `listSeenPsets()` (pset-visibility.ts) — se completa a medida que se
 * seleccionan/agregan elementos, o de una sola vez con "Escanear modelo".
 */
export function createComputoColumnsModal(fragments: OBC.FragmentsManager): ComputoColumnsModal {
  const modal = BUI.Component.create<HTMLDialogElement>(() => {
    return BUI.html`
      <dialog class="settings-modal computo-columns-modal">
        <div class="settings-modal-header">
          <span class="settings-modal-title">Columnas del Cómputo</span>
          <button class="settings-modal-close" type="button" aria-label="Cerrar"
            @click=${() => modal.close()}>
            <iconify-icon icon="material-symbols:close"></iconify-icon>
          </button>
        </div>
        <div class="settings-modal-body">
          <div class="settings-content">
            <div class="settings-row">
              <div class="settings-row-text">
                <span class="settings-row-title">Columnas visibles y orden</span>
                <span class="settings-row-desc">
                  Mostrá u ocultá columnas y cambiá el orden con las flechas.
                  Aplica a la tabla y a las exportaciones. La columna "Importe"
                  no se puede ocultar.
                </span>
              </div>
            </div>
            <div class="cc-list"></div>

            <div class="settings-row settings-row--divider">
              <div class="settings-row-text">
                <span class="settings-row-title">Agregar columna desde un Property Set</span>
                <span class="settings-row-desc">
                  Crea una columna de solo lectura con el valor de una propiedad
                  del primer elemento de cada ítem (ej. Qto_WallBaseQuantities /
                  NetSideArea).
                </span>
              </div>
            </div>
            <div class="cc-add"></div>

            <div class="settings-row settings-row--divider">
              <button type="button" class="quantity-rule-add-btn cc-reset">
                <iconify-icon icon="material-symbols:restart-alt"></iconify-icon>
                <span>Restaurar columnas por defecto</span>
              </button>
            </div>
          </div>
        </div>
      </dialog>
    `;
  });

  const listEl = modal.querySelector<HTMLElement>(".cc-list")!;
  const addEl  = modal.querySelector<HTMLElement>(".cc-add")!;
  const resetBtn = modal.querySelector<HTMLButtonElement>(".cc-reset")!;

  // --- Lista de columnas (visibilidad + orden) ---

  function renderList(): void {
    const cols = listAllColumns();
    listEl.innerHTML = cols
      .map((col, i) => {
        // "Importe" está pinneada al final (ver computo-columns.ts): no se
        // mueve, y la fila anterior tampoco puede bajar más.
        const upDisabled = i === 0 || col.id === "importe";
        const downDisabled = i >= cols.length - 1 || cols[i + 1].id === "importe";
        const kindLabel =
          col.kind === "pset"
            ? `PSet · ${escapeHtml(col.pset ?? "")} / ${escapeHtml(col.prop ?? "")}`
            : "Columna fija";
        const nameCell =
          col.kind === "pset"
            ? `<input type="text" class="quantity-rule-add-input cc-rename" data-id="${col.id}"
                 value="${escapeHtml(col.label)}">`
            : `<span class="cc-name">${escapeHtml(col.label)}</span>`;
        return `
          <div class="cc-row">
            <div class="cc-move">
              <button type="button" class="cc-move-btn" data-move="up" data-id="${col.id}"
                title="Subir" ${upDisabled ? "disabled" : ""}>
                <iconify-icon icon="material-symbols:keyboard-arrow-up"></iconify-icon>
              </button>
              <button type="button" class="cc-move-btn" data-move="down" data-id="${col.id}"
                title="Bajar" ${downDisabled ? "disabled" : ""}>
                <iconify-icon icon="material-symbols:keyboard-arrow-down"></iconify-icon>
              </button>
            </div>
            <label class="cc-vis" title="${col.locked ? "Siempre visible" : "Mostrar columna"}">
              <input type="checkbox" data-vis="${col.id}"
                ${col.visible ? "checked" : ""} ${col.locked ? "disabled" : ""}>
            </label>
            ${nameCell}
            <span class="cc-kind">${kindLabel}</span>
            <button type="button" class="quantity-rule-reset cc-del" data-del="${col.id}"
              title="Quitar columna" ${col.kind === "pset" ? "" : "disabled"}>
              <iconify-icon icon="material-symbols:delete-outline"></iconify-icon>
            </button>
          </div>`;
      })
      .join("");

    listEl.querySelectorAll<HTMLInputElement>("input[data-vis]").forEach((cb) => {
      cb.addEventListener("change", () => setColumnVisible(cb.dataset.vis!, cb.checked));
    });
    listEl.querySelectorAll<HTMLButtonElement>(".cc-move-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        moveColumn(btn.dataset.id!, btn.dataset.move === "up" ? -1 : 1);
      });
    });
    listEl.querySelectorAll<HTMLInputElement>(".cc-rename").forEach((input) => {
      input.addEventListener("change", () => renamePsetColumn(input.dataset.id!, input.value));
    });
    listEl.querySelectorAll<HTMLButtonElement>(".cc-del").forEach((btn) => {
      btn.addEventListener("click", () => removePsetColumn(btn.dataset.del!));
    });
  }

  // --- Fila "Agregar columna desde un PSet" ---

  function renderAdd(): void {
    const psets = listSeenPsets();

    if (psets.length === 0) {
      addEl.innerHTML = `
        <div class="settings-row-desc cc-empty">
          Todavía no se vio ningún Property Set. Agregá elementos al cómputo, o
          escaneá el modelo:
        </div>
        <div class="quantity-rule-add" style="border-top:none;margin-top:0.4rem;padding-top:0;">
          <button type="button" class="quantity-rule-add-btn cc-scan">
            <iconify-icon icon="material-symbols:search"></iconify-icon>
            <span>Escanear modelo completo</span>
          </button>
        </div>`;
      wireScan();
      return;
    }

    const psetOptions = psets
      .map((p) => `<option value="${escapeHtml(p.name)}">${escapeHtml(p.name)}</option>`)
      .join("");

    addEl.innerHTML = `
      <div class="cc-add-grid">
        <select class="quantity-rule-add-select cc-add-pset">${psetOptions}</select>
        <select class="quantity-rule-add-select cc-add-prop"></select>
        <input type="text" class="quantity-rule-add-input cc-add-label" placeholder="Nombre de la columna">
        <button type="button" class="quantity-rule-add-btn cc-add-btn">
          <iconify-icon icon="material-symbols:add"></iconify-icon>
          <span>Agregar</span>
        </button>
      </div>
      <div class="quantity-rule-add" style="border-top:none;margin-top:0.4rem;padding-top:0;">
        <button type="button" class="quantity-rule-add-btn cc-scan">
          <iconify-icon icon="material-symbols:search"></iconify-icon>
          <span>Escanear modelo completo</span>
        </button>
      </div>`;

    const psetSel  = addEl.querySelector<HTMLSelectElement>(".cc-add-pset")!;
    const propSel  = addEl.querySelector<HTMLSelectElement>(".cc-add-prop")!;
    const labelInp = addEl.querySelector<HTMLInputElement>(".cc-add-label")!;
    const addBtn   = addEl.querySelector<HTMLButtonElement>(".cc-add-btn")!;

    const fillProps = (): void => {
      const pset = psets.find((p) => p.name === psetSel.value);
      propSel.innerHTML = (pset?.properties ?? [])
        .map((prop) => `<option value="${escapeHtml(prop.name)}">${escapeHtml(prop.name)}</option>`)
        .join("");
      if (!labelInp.value.trim()) labelInp.value = propSel.value ?? "";
    };
    fillProps();

    psetSel.addEventListener("change", fillProps);
    propSel.addEventListener("change", () => { labelInp.value = propSel.value; });
    addBtn.addEventListener("click", () => {
      if (!psetSel.value || !propSel.value) return;
      addPsetColumn(labelInp.value, psetSel.value, propSel.value);
      labelInp.value = "";
    });

    wireScan();
  }

  function wireScan(): void {
    const scanBtn = addEl.querySelector<HTMLButtonElement>(".cc-scan");
    if (!scanBtn) return;
    const label = scanBtn.querySelector("span")!;
    scanBtn.addEventListener("click", async () => {
      scanBtn.disabled = true;
      label.textContent = "Escaneando…";
      try {
        const { psets } = await scanAllModelsForPsets(fragments, (done, total) => {
          label.textContent = `Escaneando… ${done}/${total}`;
        });
        label.textContent = `Listo: ${psets} PSets`;
        renderAdd();
      } catch (error) {
        console.error("No se pudo escanear el modelo:", error);
        label.textContent = "Error al escanear";
        scanBtn.disabled = false;
      }
    });
  }

  resetBtn.addEventListener("click", () => resetColumns());

  // Re-render de la lista ante cualquier cambio de columnas (propio, o hecho
  // desde el menú rápido de la solapa). La fila "Agregar" no depende del
  // estado de columnas — solo se refresca tras un escaneo (lo hace wireScan).
  subscribeColumns(renderList);

  closeOnBackdropClick(modal);
  const header = modal.querySelector(".settings-modal-header") as HTMLElement;
  makeModalDraggable(modal, header, ".settings-modal-close");
  document.body.append(modal);

  const openModal = (): void => {
    resetModalPosition(modal);
    renderList();
    renderAdd();
    modal.showModal();
  };

  return { modal, openModal };
}
