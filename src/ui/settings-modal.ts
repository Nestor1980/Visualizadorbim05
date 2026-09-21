import * as OBC from "@thatopen/components";
import * as BUI from "@thatopen/ui";
import { createThemeToggleButton } from "./theme";
import { makeModalDraggable, resetModalPosition, closeOnBackdropClick } from "./draggable-modal";
import { getDiscordWebhookUrl, setDiscordWebhookUrl } from "../bcf/share";
import {
  listQuantityRules, setQuantityRule, setQuantitySource, setQuantityAdjust, resetQuantityRule,
  QUANTITY_METHOD_LABELS, normalizeIfcType,
  type QuantityMethod, type QuantityAdjust,
} from "../computo/ifc-quantity-rules";
import { isValidQuantityFormula } from "../computo/quantity-formula";
import { listCategoriaRules, setCategoriaRule, resetCategoriaRule } from "../computo/ifc-categoria-rules";
import { listSeenPsets, setPsetVisible, setPropertyVisible } from "../ifc/pset-visibility";
import { scanAllModelsForPsets } from "../ifc/pset-scan";
import { getPredefinedTypeOptions } from "../ifc/predefined-types";

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
 *  patrón que la tabla de Cómputo en computo-manager.ts. Cada regla tiene el
 *  método (área/volumen/longitud/cantidad/auto) y, opcionalmente, una fuente
 *  explícita: de qué Property Set y propiedad leer el número (si no, el
 *  extractor prueba sus claves candidatas — NetSideArea, GrossArea, …). */
function renderQuantityRules(container: HTMLElement): void {
  const unitLabel = (method: QuantityMethod): string => ({ cantidad: "un", area: "m²", area_bruta: "m²", volumen: "m³", longitud: "ml", auto: "según medición" })[method];
  const filter = readQuickFilter(container);
  const allRules = listQuantityRules();
  const predefinedOptions = (ifcClass: string, selected = ""): string => {
    const values = getPredefinedTypeOptions(ifcClass);
    // Conservar reglas guardadas previamente sin permitir nuevos valores libres.
    if (selected && !values.includes(selected)) values.push(selected);
    return `<option value="" disabled ${selected ? "" : "selected"}>Elegir PredefinedType…</option>` + values.map(value => {
      const used = value !== selected && allRules.some(rule => rule.tipo === `${ifcClass}:${value}`);
      return `<option value="${escapeHtml(value)}" ${value === selected ? "selected" : ""} ${used ? "disabled" : ""}>${escapeHtml(value)}${used ? " (regla existente)" : ""}</option>`;
    }).join("");
  };
  const visibleClasses = new Set(allRules.filter(rule => !filter || rule.tipo.includes(filter)).map(rule => rule.tipo.split(":")[0]));
  const rules = allRules.filter(rule => visibleClasses.has(rule.tipo.split(":")[0]));
  let previousClass = "";
  const methodOptions = (Object.keys(QUANTITY_METHOD_LABELS) as QuantityMethod[])
    .map((method) => `<option value="${method}">${QUANTITY_METHOD_LABELS[method]}</option>`)
    .join("");

  // Catálogo de PSets/propiedades vistos hasta ahora, para autocompletar los
  // campos de fuente (mismo origen que el Property Set Inspector y el modal de
  // Columnas). Son solo sugerencias: el campo es texto libre y funciona
  // aunque todavía no se haya explorado el modelo.
  const seenPsets = listSeenPsets();
  const psetDatalist = seenPsets
    .map((p) => `<option value="${escapeHtml(p.name)}"></option>`)
    .join("");
  const propNames = [...new Set(seenPsets.flatMap((p) => p.properties.map((pr) => pr.name)))].sort();
  const propDatalist = propNames.map((n) => `<option value="${escapeHtml(n)}"></option>`).join("");

  container.innerHTML = `
    <datalist id="qr-pset-options">${psetDatalist}</datalist>
    <datalist id="qr-prop-options">${propDatalist}</datalist>
    <div class="quantity-rules-list">
      ${rules.length === 0
        ? `<div class="quantity-rules-empty">${filter ? "Ningún tipo IFC coincide con el filtro." : "No hay reglas."}</div>`
        : rules.map((rule) => {
          const [ifcClass, predefinedType] = rule.tipo.split(":");
          const groupHeader = ifcClass !== previousClass ? `
            <div class="quantity-rule-class-header">
              <strong>${escapeHtml(ifcClass)}</strong>
              <button type="button" class="quantity-rule-add-btn quantity-rule-add-for-class" data-class="${escapeHtml(ifcClass)}" aria-label="Agregar regla para ${escapeHtml(ifcClass)}" ${getPredefinedTypeOptions(ifcClass).length ? "" : 'disabled title="Esta clase no tiene un catálogo PredefinedType; usá la regla general."'}>+ Agregar regla</button>
            </div>
            <div class="quantity-rule-draft" data-class="${escapeHtml(ifcClass)}" hidden></div>` : "";
          previousClass = ifcClass;
          const measurable = rule.method !== "cantidad";
          const geomOn = rule.adjust?.geometry ?? false;
          return `
        ${groupHeader}
        <div class="quantity-rule quantity-rule-nested">
          <div class="quantity-rule-row">
            ${predefinedType && rule.isCustomType
              ? `<label class="quantity-rule-predefined-label">PredefinedType
                  <select class="quantity-rule-add-input quantity-rule-predefined-edit" aria-label="PredefinedType asociado" data-tipo="${escapeHtml(rule.tipo)}">${predefinedOptions(ifcClass, predefinedType)}</select>
                </label>`
              : `<span class="quantity-rule-tipo" title="${escapeHtml(rule.tipo)}">${predefinedType ? `PredefinedType: ${escapeHtml(predefinedType)}` : "Regla general"}</span>`}
            <select class="quantity-rule-select" data-tipo="${escapeHtml(rule.tipo)}">${methodOptions}</select>
            <span class="quantity-rule-unit">Unidad: ${unitLabel(rule.method)}</span>
            <button type="button" class="quantity-rule-reset" data-tipo="${escapeHtml(rule.tipo)}"
              title="${rule.isCustomType ? "Quitar tipo" : "Restaurar valor por defecto"}"
              ${rule.isCustomType || rule.isOverridden || rule.source || rule.adjust ? "" : "disabled"}>
              <iconify-icon icon="${rule.isCustomType ? "material-symbols:delete-outline" : "material-symbols:restart-alt"}"></iconify-icon>
            </button>
          </div>
          <div class="quantity-rule-source" ${measurable && !geomOn ? "" : "hidden"}>
            <span class="quantity-rule-source-label">Medir desde:</span>
            <input type="text" class="quantity-rule-source-pset" list="qr-pset-options"
              data-tipo="${escapeHtml(rule.tipo)}" placeholder="Property Set (cualquiera)"
              value="${escapeHtml(rule.source?.pset ?? "")}">
            <span class="quantity-rule-source-sep">/</span>
            <input type="text" class="quantity-rule-source-prop" list="qr-prop-options"
              data-tipo="${escapeHtml(rule.tipo)}" placeholder="Propiedad, ej. NetSideArea"
              value="${escapeHtml(rule.source?.prop ?? "")}">
          </div>
          <div class="quantity-rule-adjust" ${measurable ? "" : "hidden"}>
            <label class="quantity-rule-geom"
              title="Ignora los Property Sets y calcula la magnitud desde la geometría del elemento — útil cuando el modelo no exporta quantity sets (Qto_*)">
              <input type="checkbox" class="quantity-rule-geom-check" data-tipo="${escapeHtml(rule.tipo)}" ${geomOn ? "checked" : ""}>
              <span>Calcular desde geometría</span>
            </label>
            <span class="quantity-rule-source-sep">·</span>
            <span class="quantity-rule-source-label"
              title="Fórmula aplicada al total ya medido. x = cantidad medida. Ej.: x * 0.9 descuenta un 10% por solapamiento">ƒ(x):</span>
            <input type="text" class="quantity-rule-factor" data-tipo="${escapeHtml(rule.tipo)}"
              placeholder="x * 0.9" value="${escapeHtml(rule.adjust?.factor ?? "")}">
          </div>
        </div>`;
        }).join("")}
    </div>
    <div class="quantity-rule-add">
      <input type="text" class="quantity-rule-add-input" aria-label="Clase IFC" placeholder="Clase IFC, ej. IFCBEAM">
      <select class="quantity-rule-add-select">${methodOptions}</select>
      <button type="button" class="quantity-rule-add-btn">
        <iconify-icon icon="material-symbols:add"></iconify-icon>
        <span>Agregar clase IFC</span>
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

  container.querySelectorAll<HTMLSelectElement>(".quantity-rule-predefined-edit").forEach(input => {
    input.addEventListener("input", () => input.setCustomValidity(""));
    input.addEventListener("change", () => {
      const oldKey = input.dataset.tipo!;
      const value = input.value.trim().toUpperCase();
      const newKey = `${oldKey.split(":")[0]}:${value}`;
      if (newKey === oldKey) return;
      input.setCustomValidity(!/^[A-Z0-9_]+$/.test(value) ? "Indicá un PredefinedType sin espacios."
        : listQuantityRules().some(rule => rule.tipo === newKey) ? "Ya existe una regla para este PredefinedType." : "");
      if (!input.reportValidity()) return;
      const rule = listQuantityRules().find(rule => rule.tipo === oldKey)!;
      setQuantityRule(newKey, rule.method);
      setQuantitySource(newKey, rule.source);
      setQuantityAdjust(newKey, rule.adjust);
      resetQuantityRule(oldKey);
      renderQuantityRules(container);
    });
  });

  // Fuente de PSet: se aplica al salir del campo (change), leyendo los dos
  // inputs de la misma fila. Un `prop` vacío borra la fuente (vuelve a la
  // búsqueda automática). No se re-renderiza la lista entera (haría perder el
  // foco al tabular entre PSet y propiedad) — solo se ajusta el botón de
  // restaurar de esa fila.
  const applySource = (tipo: string): void => {
    const psetInput = container.querySelector<HTMLInputElement>(
      `.quantity-rule-source-pset[data-tipo="${CSS.escape(tipo)}"]`,
    );
    const propInput = container.querySelector<HTMLInputElement>(
      `.quantity-rule-source-prop[data-tipo="${CSS.escape(tipo)}"]`,
    );
    if (!psetInput || !propInput) return;
    setQuantitySource(tipo, { pset: psetInput.value, prop: propInput.value });
    const resetBtn = container.querySelector<HTMLButtonElement>(
      `.quantity-rule-reset[data-tipo="${CSS.escape(tipo)}"]`,
    );
    const rule = rules.find((r) => r.tipo === tipo);
    if (resetBtn && rule) {
      resetBtn.disabled = !(rule.isCustomType || rule.isOverridden || propInput.value.trim());
    }
  };
  container.querySelectorAll<HTMLInputElement>(
    ".quantity-rule-source-pset, .quantity-rule-source-prop",
  ).forEach((input) => {
    input.addEventListener("change", () => {
      if (input.dataset.tipo) applySource(input.dataset.tipo);
    });
  });

  // Ajuste por regla: checkbox "Calcular desde geometría" + fórmula ƒ(x). Los
  // dos inputs viven en la misma fila; cada cambio guarda el par completo.
  const readAdjust = (tipo: string): QuantityAdjust => {
    const geomCheck = container.querySelector<HTMLInputElement>(
      `.quantity-rule-geom-check[data-tipo="${CSS.escape(tipo)}"]`,
    );
    const factorInput = container.querySelector<HTMLInputElement>(
      `.quantity-rule-factor[data-tipo="${CSS.escape(tipo)}"]`,
    );
    return { geometry: geomCheck?.checked ?? false, factor: factorInput?.value ?? "" };
  };
  container.querySelectorAll<HTMLInputElement>(".quantity-rule-geom-check").forEach((check) => {
    check.addEventListener("change", () => {
      const tipo = check.dataset.tipo;
      if (!tipo) return;
      setQuantityAdjust(tipo, readAdjust(tipo));
      renderQuantityRules(container); // muestra/oculta la fila "Medir desde"
    });
  });
  container.querySelectorAll<HTMLInputElement>(".quantity-rule-factor").forEach((input) => {
    // Feedback en vivo mientras se escribe; se guarda al salir del campo.
    input.addEventListener("input", () => {
      input.classList.toggle("quantity-rule-factor-invalid", !isValidQuantityFormula(input.value));
    });
    input.addEventListener("change", () => {
      const tipo = input.dataset.tipo;
      if (!tipo || !isValidQuantityFormula(input.value)) return;
      setQuantityAdjust(tipo, readAdjust(tipo));
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

  container.querySelectorAll<HTMLButtonElement>(".quantity-rule-add-for-class").forEach(button => {
    button.addEventListener("click", () => {
      const ifcClass = button.dataset.class!;
      const draft = container.querySelector<HTMLElement>(`.quantity-rule-draft[data-class="${CSS.escape(ifcClass)}"]`)!;
      if (!draft.hidden) { draft.querySelector<HTMLSelectElement>("[data-predefined]")?.focus(); return; }
      draft.hidden = false;
      draft.innerHTML = `
        <strong>Nueva regla para ${escapeHtml(ifcClass)}</strong>
        <label>PredefinedType asociado
          <select class="quantity-rule-add-input" data-predefined aria-label="PredefinedType asociado" required>${predefinedOptions(ifcClass)}</select>
        </label>
        <label>Método de cálculo <select class="quantity-rule-add-select">${methodOptions}</select></label>
        <span class="quantity-rule-unit" data-unit></span>
        <div class="quantity-rule-row">
          <button type="button" class="quantity-rule-add-btn" data-save>Guardar regla</button>
          <button type="button" class="quantity-rule-add-btn" data-cancel>Cancelar</button>
        </div>`;
      const input = draft.querySelector<HTMLSelectElement>("[data-predefined]")!;
      const select = draft.querySelector<HTMLSelectElement>(".quantity-rule-add-select")!;
      select.value = allRules.find(rule => rule.tipo === ifcClass)?.method ?? "auto";
      const updateUnit = () => { draft.querySelector("[data-unit]")!.textContent = `Unidad de esta regla: ${unitLabel(select.value as QuantityMethod)}`; };
      select.addEventListener("change", updateUnit);
      updateUnit();
      input.addEventListener("input", () => input.setCustomValidity(""));
      const save = () => {
        const predefined = input.value.trim().toUpperCase();
        const key = `${ifcClass}:${predefined}`;
        input.setCustomValidity(!/^[A-Z0-9_]+$/.test(predefined)
          ? "Elegí un PredefinedType de la lista."
          : listQuantityRules().some(rule => rule.tipo === key)
            ? "Ya existe una regla para este PredefinedType en esta clase." : "");
        if (!input.reportValidity()) return;
        setQuantityRule(key, select.value as QuantityMethod);
        renderQuantityRules(container);
        container.querySelector<HTMLElement>(`.quantity-rule-select[data-tipo="${CSS.escape(key)}"]`)?.focus();
      };
      draft.querySelector("[data-save]")!.addEventListener("click", save);
      draft.querySelector("[data-cancel]")!.addEventListener("click", () => { draft.hidden = true; draft.replaceChildren(); });
      input.addEventListener("keydown", event => { if (event.key === "Enter") { event.preventDefault(); save(); } });
      input.focus();
    });
  });

  const addInput  = container.querySelector<HTMLInputElement>(":scope > .quantity-rule-add .quantity-rule-add-input")!;
  const addSelect = container.querySelector<HTMLSelectElement>(":scope > .quantity-rule-add .quantity-rule-add-select")!;
  const addBtn    = container.querySelector<HTMLButtonElement>(":scope > .quantity-rule-add .quantity-rule-add-btn")!;
  for (const input of [addInput]) {
    input.addEventListener("input", () => addInput.setCustomValidity(""));
    input.addEventListener("keydown", event => {
      if (event.key === "Enter") { event.preventDefault(); addBtn.click(); }
    });
  }
  addBtn.addEventListener("click", () => {
    const clase = addInput.value.trim().toUpperCase();
    const tipo = normalizeIfcType(clase);
    addInput.setCustomValidity(/^IFC[A-Z0-9]+$/.test(tipo)
      ? "" : "Indicá una clase IFC, por ejemplo IFCBEAM. Usá Agregar regla para asociar un PredefinedType.");
    if (!addInput.reportValidity()) return;
    if (listQuantityRules().some(rule => rule.tipo === tipo)) {
      addInput.setCustomValidity("Esta regla ya existe. Editala en la lista.");
      addInput.reportValidity();
      return;
    }
    setQuantityRule(tipo, addSelect.value as QuantityMethod);
    const filterInput = container.parentElement?.querySelector<HTMLInputElement>(".settings-quick-filter-input");
    if (filterInput) filterInput.value = clase.split(":")[0];
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
                    En cada clase IFC, usá "Agregar regla" y definí dentro de ella
                    el PredefinedType al que se aplica (ej. BEAM para IFCBEAM).
                    La regla específica tiene prioridad sobre la regla general.
                    Cada regla usa su propia unidad: Volumen para m³ de concreto
                    o Longitud para metros lineales de perfiles metálicos.
                    Usá los valores PredefinedType reales del IFC; si ambos
                    materiales comparten el mismo valor, ese atributo no permite distinguirlos.
                    Define cómo se calcula la cantidad de cada tipo de elemento en
                    la herramienta de Cómputo: por área, volumen, longitud o
                    cantidad de piezas. Opcionalmente, "Medir desde" fija de qué
                    Property Set y propiedad leer el número (ej.
                    Qto_RoofBaseQuantities / ProjectedArea) en vez de la búsqueda
                    automática; "Calcular desde geometría" ignora los Property
                    Sets y mide sobre la malla del elemento (para modelos sin
                    Qto_*); y la fórmula ƒ(x) afecta el total ya medido —
                    x = cantidad medida, ej. <code>x * 0.9</code> descuenta un 10%
                    por solapamiento en cubiertas. Se guarda en este navegador.
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
