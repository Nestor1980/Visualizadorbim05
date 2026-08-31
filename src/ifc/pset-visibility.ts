/**
 * Preferencia del visualizador (no del modelo IFC) sobre qué PSets y qué
 * propiedades individuales se muestran en el panel de propiedades — ver
 * "Property Set Inspector" en settings-modal.ts. Todo visible por defecto:
 * se guarda solo lo que el usuario oculta, así un modelo nuevo no aparece
 * "vacío" hasta que se configure algo (mismo criterio que
 * ifc-categoria-rules.ts).
 *
 * El catálogo de PSets/propiedades "conocidos" para listar en el inspector
 * no se arma escaneando todo el modelo de antemano (podría ser lento en
 * modelos grandes) — se registra de forma perezosa vía `registerSeen()`,
 * cada vez que properties-panel.ts efectivamente renderiza un PSet, así que
 * el inspector va creciendo a medida que el usuario explora el modelo.
 */

const STORAGE_KEY = "bim-pset-visibility";
const SEEN_STORAGE_KEY = "bim-pset-visibility-seen";

interface VisibilityState {
  hiddenPsets: string[];
  /** Claves `"NombrePset::NombrePropiedad"`. */
  hiddenProps: string[];
}

type SeenState = Record<string, string[]>;

function propKey(psetName: string, propName: string): string {
  return `${psetName}::${propName}`;
}

let stateCache: VisibilityState | null = null;

function readState(): VisibilityState {
  if (stateCache) return stateCache;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    stateCache = raw ? JSON.parse(raw) : { hiddenPsets: [], hiddenProps: [] };
  } catch {
    stateCache = { hiddenPsets: [], hiddenProps: [] };
  }
  return stateCache;
}

function writeState(state: VisibilityState): void {
  stateCache = state;
  if (state.hiddenPsets.length === 0 && state.hiddenProps.length === 0) localStorage.removeItem(STORAGE_KEY);
  else localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

let seenCache: SeenState | null = null;

function readSeen(): SeenState {
  if (seenCache) return seenCache;
  try {
    const raw = localStorage.getItem(SEEN_STORAGE_KEY);
    seenCache = raw ? JSON.parse(raw) : {};
  } catch {
    seenCache = {};
  }
  return seenCache;
}

function writeSeen(seen: SeenState): void {
  seenCache = seen;
  localStorage.setItem(SEEN_STORAGE_KEY, JSON.stringify(seen));
}

export function isPsetVisible(psetName: string): boolean {
  return !readState().hiddenPsets.includes(psetName);
}

export function isPropertyVisible(psetName: string, propName: string): boolean {
  const state = readState();
  if (state.hiddenPsets.includes(psetName)) return false;
  return !state.hiddenProps.includes(propKey(psetName, propName));
}

export function setPsetVisible(psetName: string, visible: boolean): void {
  const hiddenPsets = readState().hiddenPsets.filter((n) => n !== psetName);
  if (!visible) hiddenPsets.push(psetName);
  writeState({ ...readState(), hiddenPsets });
}

export function setPropertyVisible(psetName: string, propName: string, visible: boolean): void {
  const key = propKey(psetName, propName);
  const hiddenProps = readState().hiddenProps.filter((k) => k !== key);
  if (!visible) hiddenProps.push(key);
  writeState({ ...readState(), hiddenProps });
}

/** Registra que se vio este PSet con estas propiedades — alimenta el
 *  catálogo del inspector (ver `listSeenPsets`). Se llama cada vez que
 *  properties-panel.ts renderiza un PSet real; no hace nada si no hay
 *  propiedades nuevas para agregar (evita escrituras innecesarias a
 *  localStorage en cada selección). */
export function registerSeen(psetName: string, propNames: string[]): void {
  const seen = readSeen();
  const existing = new Set(seen[psetName] ?? []);
  let changed = !seen[psetName];
  for (const name of propNames) {
    if (!existing.has(name)) { existing.add(name); changed = true; }
  }
  if (!changed) return;
  writeSeen({ ...seen, [psetName]: [...existing] });
}

export interface SeenPsetInfo {
  name: string;
  visible: boolean;
  properties: { name: string; visible: boolean }[];
}

/** Todos los PSets/propiedades vistos hasta ahora, para listarlos en el
 *  Property Set Inspector (ver settings-modal.ts) — orden alfabético para
 *  ubicar rápido un PSet puntual en modelos con muchos. */
export function listSeenPsets(): SeenPsetInfo[] {
  const seen = readSeen();
  return Object.keys(seen).sort().map((psetName) => ({
    name: psetName,
    visible: isPsetVisible(psetName),
    properties: [...seen[psetName]].sort().map((propName) => ({
      name: propName,
      visible: isPropertyVisible(psetName, propName),
    })),
  }));
}
