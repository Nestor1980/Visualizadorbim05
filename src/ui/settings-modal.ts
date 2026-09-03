import * as OBC from "@thatopen/components";
import * as BUI from "@thatopen/ui";
import { createThemeToggleButton } from "./theme";
import { makeModalDraggable, resetModalPosition, closeOnBackdropClick } from "./draggable-modal";
import { getDiscordWebhookUrl, setDiscordWebhookUrl } from "../bcf/share";
import {
  listQuantityRules, setQuantityRule, resetQuantityRule, QUANTITY_METHOD_LABELS,
  type QuantityMethod,
} from "../computo/ifc-quantity-rules";
import { listCategoriaRules, setCategoriaRule, resetCategoriaRule } from "../computo/ifc-categoria-rules";
import { listSeenPsets, setPsetVisible, setPropertyVisible } from "../ifc/pset-visibility";
import { scanAllModelsForPsets } from "../ifc/pset-scan";

export interface SettingsModal {
  modal: HTMLDialogElement;
  openModal: () => void;
}

function escapeHtml(value: string): string {
  const div = document.createElement("div");
  div.textContent = value;
  return div.innerHTML;
}

/** Lee el texto del filtro rápido de tipo IFC que acompaña a `container`
 *  (input `.settings-quick-filter-input` hermano dentro de la misma
 *  `.settings-section`). Devuelve el término en mayúsculas y sin espacios,
 *  o "" si no hay filtro. */
function readQuickFilter(container: HTMLElement): string {
  const input = container.parentElement?.querySelector<HTMLInputElement>(".settings-quick-filter-input");
  return (input?.value ?? "").trim().toUpperCase();
}

/** Tabla editable de reglas de cuantificación por tipo IFC (ver
 *  ifc-quantity-rules.ts) — se re-renderiza entera en cada cambio, mismo
 *  patrón que la tabla de Cómputo en computo-manager.ts. */
function renderQuantityRules(container: HTMLElement): void {
  const filter = readQuickFilter(container);
  const rules = listQuantityRules().filter((rule) => !filter || rule.tipo.toUpperCase().includes(filter));
  const methodOptions = (Object.keys(QUANTITY_METHOD_LABELS) as QuantityMethod[])
    .map((method) => `<option value="${method}">${QUANTITY_METHOD_LABELS[method]}</option>`)
    .join("");

  container.innerHTML = `
    <div class="quantity-rules-list">
      ${rules.length === 0
        ? `<div class="quantity-rules-empty">${filter ? "Ningún tipo IFC coincide con el filtro." : "No hay reglas."}</div>`
        : rules.map((rule) => `
        <div class="quantity-rule-row">
          <span class="quantity-rule-tipo">${escapeHtml(rule.tipo)}</span>
          <select class="quantity-rule-select" data-tipo="${escapeHtml(rule.tipo)}">${methodOptions}</select>
          <button type="button" class="quantity-rule-reset" data-tipo="${escapeHtml(rule.tipo)}"
            title="${rule.isCustomType ? "Quitar tipo" : "Restaurar valor por defecto"}"
            ${rule.isCustomType || rule.isOverridden ? "" : "disabled"}>
            <iconify-icon icon="${rule.isCustomType ? "material-symbols:delete-outline" : "material-symbols:restart-alt"}"></iconify-icon>
          </button>
        </div>`).join("")}
    </div>
    <div class="quantity-rule-add">
      <input type="text" class="quantity-rule-add-input" placeholder="Tipo IFC, ej. IFCCOLUMN">
      <select class="quantity-rule-add-select">${methodOptions}</select>
      <button type="button" class="quantity-rule-add-btn">
        <iconify-icon icon="material-symbols:add"></iconify-icon>
        <span>Agregar</span>
      </button>
    </div>`;

  for (const rule of rules) {
    const select = container.querySelector<HTMLSelectElement>(
      `.quantity-rule-select[data-tipo="${CSS.escape(rule.tipo)}"]`,
    );
    if (select) select.value = rule.method;
  }

  container.querySelectorAll<HTMLSelectElement>(".quantity-rule-select").forEach((select) => {
    select.addEventListener("change", () => {
      const tipo = select.dataset.tipo;
      if (!tipo) return;
      setQuantityRule(tipo, select.value as QuantityMethod);
      renderQuantityRules(container);
    });
  });

  container.querySelectorAll<HTMLButtonElement>(".quantity-rule-reset").forEach((btn) => {
    btn.addEventListener("click", () => {
      const tipo = btn.dataset.tipo;
      if (!tipo) return;
      resetQuantityRule(tipo);
      renderQuantityRules(container);
    });
  });

  const addInput  = container.querySelector<HTMLInputElement>(".quantity-rule-add-input")!;
  const addSelect = container.querySelector<HTMLSelectElement>(".quantity-rule-add-select")!;
  const addBtn    = container.querySelector<HTMLButtonElement>(".quantity-rule-add-btn")!;
  addBtn.addEventListener("click", () => {
    const tipo = addInput.value.trim();
    if (!tipo) return;
    setQuantityRule(tipo, addSelect.value as QuantityMethod);
    renderQuantityRules(container);
  });
}

/** Tabla editable de reglas de categoría automática por tipo IFC (ver
 *  ifc-categoria-rules.ts) — mismo patrón que renderQuantityRules arriba,
 *  salvo que el valor de cada fila es un nombre libre (texto), no un select
 *  de opciones fijas, y por eso el layout es un CSS Grid de verdad (en vez
 *  del flex de renderQuantityRules): con dos columnas de ancho variable
 *  (tipo/nombre) un flex normal desalinea el borde entre columnas fila a
 *  fila según el largo de cada texto — acá las filas son celdas de una
 *  única grilla (`.categoria-rules-grid`), así el ancho de cada columna lo
 *  fija el contenido más largo de TODA la lista, igual en todas las filas.
 *  La fila de "Agregar" queda afuera de esa grilla (bloque flex aparte,
 *  como en renderQuantityRules) para que su botón con texto no ensanche la
 *  columna de acciones de cada fila — el modal es angosto y esa columna
 *  extra le come ancho al input de nombre. */
function renderCategoriaRules(container: HTMLElement): void {
  const filter = readQuickFilter(container);
  const rules = listCategoriaRules().filter((rule) => !filter || rule.tipo.toUpperCase().includes(filter));

  container.innerHTML = `
    ${rules.length === 0
      ? `<div class="quantity-rules-empty">${filter ? "Ningún tipo IFC coincide con el filtro." : "No hay reglas."}</div>`
      : ""}
    <div class="categoria-rules-grid">
      ${rules.map((rule) => `
        <span class="quantity-rule-tipo">${escapeHtml(rule.tipo)}</span>
        <input type="text" class="quantity-rule-add-input" data-tipo="${escapeHtml(rule.tipo)}"
          value="${escapeHtml(rule.nombre)}" placeholder="Nombre de categoría">
        <button type="button" class="quantity-rule-reset" data-tipo="${escapeHtml(rule.tipo)}"
          title="${rule.isCustomType ? "Quitar tipo" : "Restaurar valor por defecto"}"
          ${rule.isCustomType || rule.isOverridden ? "" : "disabled"}>
          <iconify-icon icon="${rule.isCustomType ? "material-symbols:delete-outline" : "material-symbols:restart-alt"}"></iconify-icon>
        </button>`).join("")}
    </div>
    <div class="quantity-rule-add">
      <input type="text" class="quantity-rule-add-input" data-role="tipo" placeholder="Tipo IFC, ej. IFCCOLUMN">
      <input type="text" class="quantity-rule-add-input" data-role="nombre" placeholder="Nombre de categoría, ej. Columnas">
      <button type="button" class="quantity-rule-add-btn">
        <iconify-icon icon="material-symbols:add"></iconify-icon>
        <span>Agregar</span>
      </button>
    </div>`;

  container.querySelectorAll<HTMLInputElement>(".quantity-rule-add-input[data-tipo]").forEach((input) => {
    input.addEventListener("change", () => {
      const tipo = input.dataset.tipo;
      const nombre = input.value.trim();
      if (!tipo) return;
      if (!nombre) { renderCategoriaRules(container); return; }
      setCategoriaRule(tipo, nombre);
      renderCategoriaRules(container);
    });
  });

  container.querySelectorAll<HTMLButtonElement>(".quantity-rule-reset").forEach((btn) => {
    btn.addEventListener("click", () => {
      const tipo = btn.dataset.tipo;
      if (!tipo) return;
      resetCategoriaRule(tipo);
      renderCategoriaRules(container);
    });
  });

  const addTipoInput   = container.querySelector<HTMLInputElement>('.quantity-rule-add-input[data-role="tipo"]')!;
  const addNombreInput = container.querySelector<HTMLInputElement>('.quantity-rule-add-input[data-role="nombre"]')!;
  const addBtn         = container.querySelector<HTMLButtonElement>(".quantity-rule-add-btn")!;
  addBtn.addEventListener("click", () => {
    const tipo = addTipoInput.value.trim();
    const nombre = addNombreInput.value.trim();
    if (!tipo || !nombre) return;
    setCategoriaRule(tipo, nombre);
    renderCategoriaRules(container);
  });
}

/**
 * "Property Set Inspector": lista los PSets y propiedades que el visualizador
 * fue viendo en el modelo (ver `registerSeen` en pset-visibility.ts, llamado
 * desde properties-panel.ts cada vez que se renderiza un PSet real) con un
 * checkbox para ocultarlos del panel de propiedades — a nivel de PSet
 * completo y de propiedad individual dentro de un PSet. No modifica el
 * modelo IFC, es una preferencia del visualizador guardada en este
 * navegador. Vacío hasta que el usuario explore el modelo (seleccione algún
 * elemento), momento en el que empieza a completarse solo.
 */
function renderPsetVisibility(container: HTMLElement): void {
  const psets = listSeenPsets();

  if (psets.length === 0) {
    container.innerHTML = `
      <div class="pset-visibility-empty">
        Todavía no se vio ningún Property Set — seleccioná un elemento en el
        modelo para que aparezcan acá.
      </div>`;
    return;
  }

  container.innerHTML = `
    <div class="pset-visibility-list">
      ${psets.map((pset) => `
        <div class="pset-visibility-item">
          <label class="pset-visibility-header">
            <input type="checkbox" class="pset-visibility-toggle" data-pset="${escapeHtml(pset.name)}"
              ${pset.visible ? "checked" : ""}>
            <span class="pset-visibility-name">${escapeHtml(pset.name)}</span>
            <span class="pset-visibility-count">${pset.properties.length}</span>
          </label>
          <div class="pset-visibility-props">
            ${pset.properties.map((prop) => `
              <label class="pset-visibility-prop-row">
                <input type="checkbox" class="pset-visibility-prop-toggle"
                  data-pset="${escapeHtml(pset.name)}" data-prop="${escapeHtml(prop.name)}"
                  ${prop.visible ? "checked" : ""} ${pset.visible ? "" : "disabled"}>
                <span>${escapeHtml(prop.name)}</span>
              </label>`).join("")}
          </div>
        </div>`).join("")}
    </div>`;

  container.querySelectorAll<HTMLInputElement>(".pset-visibility-toggle").forEach((toggle) => {
    toggle.addEventListener("change", () => {
      const pset = toggle.dataset.pset;
      if (!pset) return;
      setPsetVisible(pset, toggle.checked);
      renderPsetVisibility(container);
    });
  });

  container.querySelectorAll<HTMLInputElement>(".pset-visibility-prop-toggle").forEach((toggle) => {
    toggle.addEventListener("change", () => {
      const pset = toggle.dataset.pset;
      const prop = toggle.dataset.prop;
      if (!pset || !prop) return;
      setPropertyVisible(pset, prop, toggle.checked);
      renderPsetVisibility(container);
    });
  });
}

export function createSettingsModal(fragments: OBC.FragmentsManager): SettingsModal {
  const themeToggleBtn = createThemeToggleButton();

  const modal = BUI.Component.create<HTMLDialogElement>(() => {
    return BUI.html`
      <dialog class="settings-modal">
        <div class="settings-modal-header">
          <span class="settings-modal-title">Configuración</span>
          <button class="settings-modal-close" type="button" aria-label="Cerrar"
            @click=${() => modal.close()}>
            <iconify-icon icon="material-symbols:close"></iconify-icon>
          </button>
        </div>
        <div class="settings-modal-body">
          <div class="settings-sidebar">
            <div class="settings-sidebar-item settings-sidebar-item--active" data-section="appearance">
              <iconify-icon icon="material-symbols:contrast-rounded"></iconify-icon>
              <span>Apariencia</span>
            </div>
            <div class="settings-sidebar-item" data-section="share">
              <iconify-icon icon="mdi:share-variant-outline"></iconify-icon>
              <span>Compartir</span>
            </div>
            <div class="settings-sidebar-group settings-sidebar-group--open">
              <div class="settings-sidebar-item settings-sidebar-item--parent" data-group-toggle="computo">
                <iconify-icon icon="material-symbols:calculate-outline"></iconify-icon>
                <span>Cómputo</span>
                <iconify-icon class="settings-sidebar-caret" icon="material-symbols:chevron-right"></iconify-icon>
              </div>
              <div class="settings-sidebar-children">
                <div class="settings-sidebar-item settings-sidebar-item--child" data-section="computo-reglas">
                  <iconify-icon icon="material-symbols:rule"></iconify-icon>
                  <span>Reglas</span>
                </div>
                <div class="settings-sidebar-item settings-sidebar-item--child" data-section="computo-categorias">
                  <iconify-icon icon="material-symbols:category-outline"></iconify-icon>
                  <span>Categorías</span>
                </div>
              </div>
            </div>
            <div class="settings-sidebar-item" data-section="propiedades">
              <iconify-icon icon="material-symbols:list-alt-outline"></iconify-icon>
              <span>Propiedades</span>
            </div>
          </div>
          <div class="settings-content">
            <div class="settings-section" data-section="appearance">
              <div class="settings-row">
                <div class="settings-row-text">
                  <span class="settings-row-title">Tema</span>
                  <span class="settings-row-desc">Alternar entre modo claro y oscuro</span>
                </div>
                ${themeToggleBtn}
              </div>
            </div>
            <div class="settings-section" data-section="share" hidden>
              <div class="settings-row">
                <div class="settings-row-text">
                  <span class="settings-row-title">Webhook de Discord</span>
                  <span class="settings-row-desc">
                    URL del Incoming Webhook del canal donde se publican los topics BCF
                    compartidos desde "Compartir por Discord".
                  </span>
                </div>
              </div>
              <div class="settings-row">
                <bim-text-input type="url" placeholder="https://discord.com/api/webhooks/..." debounce="400"
                  .value=${getDiscordWebhookUrl()}
                  @input=${(e: Event) => setDiscordWebhookUrl((e.target as BUI.TextInput).value.trim())}>
                </bim-text-input>
              </div>
            </div>
            <div class="settings-section" data-section="computo-reglas" hidden>
              <div class="settings-row">
                <div class="settings-row-text">
                  <span class="settings-row-title">Reglas de cuantificación por tipo IFC</span>
                  <span class="settings-row-desc">
                    Define cómo se calcula la cantidad de cada tipo de elemento en
                    la herramienta de Cómputo: por área, volumen, longitud o
                    cantidad de piezas. Se guarda en este navegador.
                  </span>
                </div>
              </div>
              <div class="settings-quick-filter">
                <iconify-icon icon="material-symbols:search"></iconify-icon>
                <input type="text" class="settings-quick-filter-input" data-filter="reglas"
                  placeholder="Filtrar por tipo IFC, ej. IFCWALL">
              </div>
              <div class="quantity-rules-container"></div>
            </div>
            <div class="settings-section" data-section="computo-categorias" hidden>
              <div class="settings-row">
                <div class="settings-row-text">
                  <span class="settings-row-title">Categorías automáticas por tipo IFC</span>
                  <span class="settings-row-desc">
                    Al crear un ítem nuevo en la tabla de Cómputo, lo asigna de
                    entrada a la sección con este nombre según su tipo IFC
                    (ej. IFCWALL → Paredes) — un tipo sin regla acá nace en
                    "Sin categoría" y se arrastra a mano. Se guarda en este
                    navegador.
                  </span>
                </div>
              </div>
              <div class="settings-quick-filter">
                <iconify-icon icon="material-symbols:search"></iconify-icon>
                <input type="text" class="settings-quick-filter-input" data-filter="categorias"
                  placeholder="Filtrar por tipo IFC, ej. IFCWALL">
              </div>
              <div class="categoria-rules-container"></div>
            </div>
            <div class="settings-section" data-section="propiedades" hidden>
              <div class="settings-row">
                <div class="settings-row-text">
                  <span class="settings-row-title">Property Set Inspector</span>
                  <span class="settings-row-desc">
                    Mostrar u ocultar Property Sets completos, o propiedades
                    individuales dentro de un PSet, en el panel de propiedades
                    del elemento seleccionado. No modifica el modelo IFC — es
                    una preferencia de este navegador. La lista se completa
                    sola a medida que seleccionás elementos en el modelo, o de
                    una sola vez con "Escanear modelo completo".
                  </span>
                </div>
                <button type="button" class="pset-scan-btn quantity-rule-add-btn">
                  <iconify-icon icon="material-symbols:search"></iconify-icon>
                  <span>Escanear modelo completo</span>
                </button>
              </div>
              <div class="pset-visibility-container"></div>
            </div>
          </div>
        </div>
      </dialog>
    `;
  });

  const quantityRulesContainer = modal.querySelector<HTMLElement>(".quantity-rules-container")!;
  renderQuantityRules(quantityRulesContainer);

  const categoriaRulesContainer = modal.querySelector<HTMLElement>(".categoria-rules-container")!;
  renderCategoriaRules(categoriaRulesContainer);

  // Filtro rápido por tipo IFC — el input vive fuera del contenedor que se
  // re-renderiza, así no pierde el foco en cada tecla; sólo dispara un
  // re-render que vuelve a leer su valor vía readQuickFilter().
  modal.querySelector<HTMLInputElement>('.settings-quick-filter-input[data-filter="reglas"]')!
    .addEventListener("input", () => renderQuantityRules(quantityRulesContainer));
  modal.querySelector<HTMLInputElement>('.settings-quick-filter-input[data-filter="categorias"]')!
    .addEventListener("input", () => renderCategoriaRules(categoriaRulesContainer));

  const psetVisibilityContainer = modal.querySelector<HTMLElement>(".pset-visibility-container")!;
  renderPsetVisibility(psetVisibilityContainer);

  const psetScanBtn = modal.querySelector<HTMLButtonElement>(".pset-scan-btn")!;
  const psetScanLabel = psetScanBtn.querySelector("span")!;
  psetScanBtn.addEventListener("click", async () => {
    psetScanBtn.disabled = true;
    psetScanLabel.textContent = "Escaneando…";
    try {
      const { elementos, psets } = await scanAllModelsForPsets(fragments, (done, total) => {
        psetScanLabel.textContent = `Escaneando… ${done}/${total}`;
      });
      renderPsetVisibility(psetVisibilityContainer);
      psetScanLabel.textContent = `Listo: ${elementos} elementos, ${psets} PSets`;
    } catch (error) {
      console.error("No se pudo escanear el modelo:", error);
      psetScanLabel.textContent = "Error al escanear";
    } finally {
      psetScanBtn.disabled = false;
      setTimeout(() => { psetScanLabel.textContent = "Escanear modelo completo"; }, 3000);
    }
  });

  closeOnBackdropClick(modal);

  const header = modal.querySelector(".settings-modal-header") as HTMLElement;
  makeModalDraggable(modal, header, ".settings-modal-close");

  const sidebarItems = [...modal.querySelectorAll<HTMLElement>(".settings-sidebar-item")];
  const sections     = [...modal.querySelectorAll<HTMLElement>(".settings-section")];
  for (const item of sidebarItems) {
    item.addEventListener("click", () => {
      // Ítem padre del árbol (ej. "Cómputo"): sólo despliega/pliega sus hijos.
      if (item.dataset.groupToggle) {
        item.closest(".settings-sidebar-group")?.classList.toggle("settings-sidebar-group--open");
        return;
      }
      const target = item.dataset.section;
      if (!target) return;
      for (const other of sidebarItems) other.classList.toggle("settings-sidebar-item--active", other === item);
      for (const section of sections) section.hidden = section.dataset.section !== target;
    });
  }

  document.body.append(modal);

  const openModal = () => {
    resetModalPosition(modal);
    // Recién en el momento de abrir (no al construir el modal, una sola vez
    // al arrancar la app) porque el catálogo de PSets vistos se completa a
    // medida que el usuario selecciona elementos del modelo — abrir el modal
    // más tarde en la sesión debe reflejar lo que se vio hasta ese momento.
    renderPsetVisibility(psetVisibilityContainer);
    modal.showModal();
  };

  return { modal, openModal };
}
