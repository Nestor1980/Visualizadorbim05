/**
 * Columnas de la tabla de Cómputo y de sus exportaciones (Excel/PDF): cuáles
 * se ven, en qué orden, y columnas extra traídas de un Property Set del
 * modelo.
 *
 * Es una preferencia del navegador (localStorage), igual que
 * `ifc-categoria-rules.ts` / `ifc-quantity-rules.ts` — no viaja con el
 * proyecto guardado: define qué ve/exporta este usuario, no cómo se calcula el
 * cómputo. Se edita desde el modal "Columnas del Cómputo"
 * (`computo-columns-modal.ts`).
 *
 * La columna "Importe" no se puede ocultar (es el resultado del cómputo). La
 * columna de acciones (botón eliminar) no es parte de este catálogo: no es un
 * dato y no se exporta.
 */

/** Id de una columna fija (las traídas de PSet usan ids `pset-<n>`). */
export type ComputoColumnId =
  | "iapvItem"
  | "iapvSubItem"
  | "rubro"
  | "descripcion"
  | "unidad"
  | "cantidad"
  | "precioUnitario"
  | "importe";

interface BuiltinColumnDef {
  id: ComputoColumnId;
  label: string;
  /** Subcolumna del grupo "Designación de la Obra" en la cabecera de la tabla. */
  designacion: boolean;
  /** No se puede ocultar. */
  locked: boolean;
  /** Ancho sugerido para el Excel (unidades `wch` de SheetJS). */
  excelWidth: number;
}

/** Columna extra: toma su valor de una propiedad de un Property Set del primer
 *  elemento del ítem (ver `ComputoItem.psetValues` en computo-tool.ts). */
export interface PsetColumnDef {
  id: string;
  label: string;
  /** Nombre del Property Set (ej. "Qto_WallBaseQuantities"). */
  pset: string;
  /** Nombre de la propiedad dentro del PSet (ej. "NetSideArea"). */
  prop: string;
}

/** Vista unificada de una columna, ya resuelta (fija o de PSet) — es lo que
 *  consumen la tabla y los exports. */
export interface ComputoColumnView {
  id: string;
  label: string;
  kind: "builtin" | "pset";
  visible: boolean;
  locked: boolean;
  designacion: boolean;
  excelWidth: number;
  /** Solo `kind === "pset"`. */
  pset?: string;
  prop?: string;
}

/** Orden canónico de las columnas fijas — el de fábrica, antes de cualquier
 *  reordenamiento del usuario. */
const BUILTIN_COLUMNS: BuiltinColumnDef[] = [
  { id: "iapvItem",       label: "Item",         designacion: true,  locked: false, excelWidth: 26 },
  { id: "iapvSubItem",    label: "SubItem",      designacion: true,  locked: false, excelWidth: 30 },
  { id: "rubro",          label: "Rubro",        designacion: false, locked: false, excelWidth: 18 },
  { id: "descripcion",    label: "Descripción",  designacion: false, locked: false, excelWidth: 36 },
  { id: "unidad",         label: "Unidad",       designacion: false, locked: false, excelWidth: 10 },
  { id: "cantidad",       label: "Cantidad",     designacion: false, locked: false, excelWidth: 12 },
  { id: "precioUnitario", label: "Precio Unit.", designacion: false, locked: false, excelWidth: 14 },
  { id: "importe",        label: "Importe",      designacion: false, locked: true,  excelWidth: 14 },
];

const STORAGE_KEY = "bim-computo-columns";

interface StoredConfig {
  /** Ids en orden de visualización (fijas y de PSet mezcladas). */
  order: string[];
  /** Ids ocultos. */
  hidden: string[];
  /** Columnas traídas de PSet. */
  pset: PsetColumnDef[];
}

const EMPTY_CONFIG: StoredConfig = { order: [], hidden: [], pset: [] };

let cache: StoredConfig | null = null;
let psetCounter = 0;

function readConfig(): StoredConfig {
  if (cache) return cache;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      cache = { ...EMPTY_CONFIG };
    } else {
      const parsed = JSON.parse(raw);
      // Migración desde el formato viejo (un array plano de ids ocultos).
      if (Array.isArray(parsed)) {
        cache = { order: [], hidden: parsed as string[], pset: [] };
      } else {
        cache = {
          order: Array.isArray(parsed.order) ? parsed.order : [],
          hidden: Array.isArray(parsed.hidden) ? parsed.hidden : [],
          pset: Array.isArray(parsed.pset) ? parsed.pset : [],
        };
      }
    }
  } catch {
    cache = { ...EMPTY_CONFIG };
  }
  // El contador arranca por encima de los ids ya guardados para no repetir.
  for (const col of cache.pset) {
    const n = Number.parseInt(col.id.replace("pset-", ""), 10);
    if (Number.isFinite(n) && n > psetCounter) psetCounter = n;
  }
  return cache;
}

function writeConfig(next: StoredConfig): void {
  cache = next;
  const isDefault =
    next.order.length === 0 && next.hidden.length === 0 && next.pset.length === 0;
  if (isDefault) localStorage.removeItem(STORAGE_KEY);
  else localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  emitChange();
}

// --- Suscripción a cambios (la tabla y el modal se re-renderizan solos) ---

const listeners = new Set<() => void>();

export function subscribeColumns(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function emitChange(): void {
  for (const fn of listeners) fn();
}

// --- Orden efectivo ---

function allIds(cfg: StoredConfig): string[] {
  return [...BUILTIN_COLUMNS.map((c) => c.id), ...cfg.pset.map((c) => c.id)];
}

/** Orden efectivo: primero los ids guardados que todavía existen, después
 *  cualquier id nuevo (columna fija agregada en una versión posterior, o
 *  columna de PSet recién creada) en su orden natural. "Importe" queda
 *  siempre al final — de eso depende que el TOTAL quede alineado a la derecha
 *  en la tabla y en los exports. */
function effectiveOrder(cfg: StoredConfig): string[] {
  const ids = allIds(cfg);
  const seen = new Set<string>();
  const ordered: string[] = [];
  for (const id of cfg.order) {
    if (ids.includes(id) && !seen.has(id)) { ordered.push(id); seen.add(id); }
  }
  for (const id of ids) if (!seen.has(id)) ordered.push(id);
  return [...ordered.filter((id) => id !== "importe"), "importe"];
}

// --- API pública ---

/** Clave con la que se guarda/lee el valor de una propiedad de PSet en
 *  `ComputoItem.psetValues` — misma convención que pset-visibility.ts. */
export function psetValueKey(pset: string, prop: string): string {
  return `${pset}::${prop}`;
}

function toView(id: string, cfg: StoredConfig): ComputoColumnView | null {
  const builtin = BUILTIN_COLUMNS.find((c) => c.id === id);
  if (builtin) {
    return {
      id: builtin.id,
      label: builtin.label,
      kind: "builtin",
      visible: builtin.locked || !cfg.hidden.includes(id),
      locked: builtin.locked,
      designacion: builtin.designacion,
      excelWidth: builtin.excelWidth,
    };
  }
  const custom = cfg.pset.find((c) => c.id === id);
  if (!custom) return null;
  return {
    id: custom.id,
    label: custom.label,
    kind: "pset",
    visible: !cfg.hidden.includes(id),
    locked: false,
    designacion: false,
    excelWidth: 22,
    pset: custom.pset,
    prop: custom.prop,
  };
}

/** Todas las columnas (fijas + de PSet), en orden — para el modal. */
export function listAllColumns(): ComputoColumnView[] {
  const cfg = readConfig();
  return effectiveOrder(cfg)
    .map((id) => toView(id, cfg))
    .filter((c): c is ComputoColumnView => c !== null);
}

/** Columnas visibles, en orden — base de la cabecera, de las filas de la
 *  tabla y de los exports. Siempre incluye "Importe". */
export function visibleComputoColumns(): ComputoColumnView[] {
  return listAllColumns().filter((c) => c.visible);
}

export function isColumnVisible(id: string): boolean {
  const cfg = readConfig();
  const builtin = BUILTIN_COLUMNS.find((c) => c.id === id);
  if (builtin?.locked) return true;
  return !cfg.hidden.includes(id);
}

/** Cambia la visibilidad de una columna (las bloqueadas se ignoran). No deja
 *  ocultar la última columna visible — una tabla sin columnas rompería el
 *  layout. */
export function setColumnVisible(id: string, visible: boolean): void {
  const cfg = readConfig();
  const builtin = BUILTIN_COLUMNS.find((c) => c.id === id);
  if (builtin?.locked) return;

  if (!visible && visibleComputoColumns().length <= 1) return;

  const hidden = cfg.hidden.filter((h) => h !== id);
  if (!visible) hidden.push(id);
  writeConfig({ ...cfg, hidden });
}

/** Mueve una columna un lugar hacia arriba (`-1`) o abajo (`+1`) en el orden.
 *  "Importe" está pinneada al final y no se mueve, ni otra columna puede
 *  pasar por debajo de ella. */
export function moveColumn(id: string, delta: -1 | 1): void {
  if (id === "importe") return;
  const cfg = readConfig();
  const order = effectiveOrder(cfg);
  const from = order.indexOf(id);
  const to = from + delta;
  if (from === -1 || to < 0 || to >= order.length) return;
  if (order[to] === "importe") return;
  [order[from], order[to]] = [order[to], order[from]];
  writeConfig({ ...cfg, order });
}

/** Agrega una columna que toma su valor de `pset` / `prop`. Devuelve el id. */
export function addPsetColumn(label: string, pset: string, prop: string): string {
  const cfg = readConfig();
  const cleanLabel = label.trim() || prop;
  psetCounter += 1;
  const id = `pset-${psetCounter}`;
  const next: StoredConfig = {
    ...cfg,
    pset: [...cfg.pset, { id, label: cleanLabel, pset, prop }],
    // Nace después de la última columna del orden actual.
    order: [...effectiveOrder(cfg), id],
  };
  writeConfig(next);
  return id;
}

export function renamePsetColumn(id: string, label: string): void {
  const cfg = readConfig();
  const clean = label.trim();
  if (!clean) return;
  writeConfig({
    ...cfg,
    pset: cfg.pset.map((c) => (c.id === id ? { ...c, label: clean } : c)),
  });
}

export function removePsetColumn(id: string): void {
  const cfg = readConfig();
  writeConfig({
    order: cfg.order.filter((o) => o !== id),
    hidden: cfg.hidden.filter((h) => h !== id),
    pset: cfg.pset.filter((c) => c.id !== id),
  });
}

/** Vuelve al catálogo de fábrica (borra orden, ocultas y columnas de PSet). */
export function resetColumns(): void {
  writeConfig({ ...EMPTY_CONFIG });
}
