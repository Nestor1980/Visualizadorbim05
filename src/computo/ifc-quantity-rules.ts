/**
 * Reglas de cuantificación por tipo IFC: define, para cada clase IFC (ej.
 * "IFCWALL", "IFCWINDOW"), qué magnitud usa la herramienta de Cómputo para
 * calcular su cantidad — área neta, área bruta, volumen, longitud o conteo
 * de piezas. "auto" (el valor para cualquier tipo no listado acá) prueba
 * área → volumen → longitud según qué quantity set IFC traiga datos, con
 * respaldo geométrico de área cuando no hay ninguno — ver
 * `quantity-extractor.ts`.
 *
 * Neto vs. Bruto: la distinción central del cómputo IFC (Qto_XxxBaseQuantities
 * trae ambas versiones de casi toda superficie). Para reflejar consumo real
 * de material la regla general es Neto — "area" busca primero las claves
 * Net*. Un puñado de rubros piden explícitamente la geometría idealizada sin
 * descuentos (cubiertas inclinadas, contrapisos): "area_bruta" busca primero
 * las claves Gross*.
 *
 * Una misma clase IFC puede necesitar reglas distintas según su
 * PredefinedType (ej. IFCSLAB de fundación se mide por volumen, IFCSLAB de
 * piso por área; IFCCOVERING de zócalo se mide por longitud, de revoque por
 * área) — para esos casos la clave del rubro es compuesta: "IFCSLAB:BASESLAB".
 * `getQuantityMethod` prueba primero `CLASE:PREDEFINEDTYPE`, y si no hay
 * regla para ese par cae a la regla de `CLASE` sola.
 *
 * Los defaults viven en código (`DEFAULT_RULES`); el usuario puede
 * sobreescribirlos (o agregar reglas para tipos nuevos) desde el modal de
 * Configuración, y esas overrides se guardan en localStorage — son una
 * preferencia del navegador, no del proyecto.
 */

export type QuantityMethod = "cantidad" | "area" | "area_bruta" | "volumen" | "longitud" | "auto";

/** Fuente explícita de cantidad para un tipo IFC: en vez de dejar que el
 *  extractor pruebe sus claves candidatas (NetSideArea, GrossArea, …) sobre
 *  todos los quantity sets, se le indica exactamente de qué Property Set y qué
 *  propiedad leer el número. `pset` vacío = cualquier Property Set que tenga
 *  esa propiedad. Se configura desde Configuración → Cómputo → Reglas. */
export interface QuantitySource {
  pset: string;
  prop: string;
}

export interface QuantityRule {
  tipo: string;
  method: QuantityMethod;
  /** Property Set/propiedad de la que leer la cantidad (override del usuario),
   *  o `null` para dejar la búsqueda automática por método. */
  source: QuantitySource | null;
  /** true si el tipo no viene en `DEFAULT_RULES` — lo agregó el usuario. */
  isCustomType: boolean;
  /** true si el valor efectivo viene de una override guardada, no del default. */
  isOverridden: boolean;
}

const STORAGE_KEY = "bim-computo-quantity-rules";
const SOURCE_STORAGE_KEY = "bim-computo-quantity-sources";

export const QUANTITY_METHOD_LABELS: Record<QuantityMethod, string> = {
  cantidad: "Cantidad (piezas)",
  area: "Área neta (m²)",
  area_bruta: "Área bruta (m²)",
  volumen: "Volumen (m³)",
  longitud: "Longitud (ml)",
  auto: "Automático",
};

// IFC4 tiene variantes "StandardCase" de varias entidades (IfcWindowStandardCase,
// IfcWallStandardCase, etc.) que muchos exportadores (Revit incluido) emiten en
// vez de la entidad simple — sin normalizar esto, una ventana exportada como
// "IFCWINDOWSTANDARDCASE" no matchearía la regla de "IFCWINDOW". Admite además
// claves compuestas "CLASE:PREDEFINEDTYPE" (ej. "IfcSlab:BaseSlab" →
// "IFCSLAB:BASESLAB") — solo la parte de clase pierde el sufijo StandardCase.
export function normalizeIfcType(tipoIfc: string): string {
  const [cls, ...rest] = tipoIfc.split(":");
  const upperClass = (cls ?? "").trim().toUpperCase();
  const normalizedClass = upperClass.endsWith("STANDARDCASE")
    ? upperClass.slice(0, -"STANDARDCASE".length)
    : upperClass;
  if (rest.length === 0) return normalizedClass;
  return `${normalizedClass}:${rest.join(":").trim().toUpperCase()}`;
}

// PredefinedType que IFC usa como "sin dato" — no alcanzan para desambiguar,
// se ignoran al armar la clave compuesta CLASE:PREDEFINEDTYPE.
const UNDEFINED_PREDEFINED_TYPES = new Set(["NOTDEFINED", "USERDEFINED"]);

const DEFAULT_RULES: Record<string, QuantityMethod> = {
  // Se cuentan por pieza — tienen superficie/volumen propio pero en un
  // cómputo se cuentan, no se miden (ventanas, puertas, artefactos...).
  IFCWINDOW: "cantidad",
  IFCDOOR: "cantidad",
  IFCFURNISHINGELEMENT: "cantidad",
  IFCFURNITURE: "cantidad",
  IFCSANITARYTERMINAL: "cantidad",
  IFCLIGHTFIXTURE: "cantidad",
  IFCOUTLET: "cantidad",
  IFCSWITCHINGDEVICE: "cantidad",
  IFCFLOWTERMINAL: "cantidad",
  IFCELECTRICDISTRIBUTIONBOARD: "cantidad",
  IFCSTAIRFLIGHT: "cantidad",
  IFCRAMPFLIGHT: "cantidad",
  // Se miden por superficie neta (cara con descuento de vanos/encuentros) —
  // es la convención por defecto para reflejar consumo real de material.
  IFCWALL: "area",
  IFCSLAB: "area",
  IFCCOVERING: "area",
  IFCCURTAINWALL: "area",
  IFCPLATE: "area",
  // Se miden por superficie bruta — geometría idealizada sin descontar, la
  // convención que pide una cubierta inclinada (la proyección subestimaría).
  IFCROOF: "area_bruta",
  // Losa de fundación/platea o losa de techo: misma clase IFCSLAB que un piso,
  // pero rubro distinto — se desambigua por PredefinedType.
  "IFCSLAB:BASESLAB": "volumen",
  "IFCSLAB:ROOF": "area_bruta",
  // Zócalo modelado como IfcCovering: se mide por longitud de perímetro, no
  // por área, a diferencia de un IfcCovering de revoque/piso/cielorraso.
  "IFCCOVERING:MOLDING": "longitud",
  "IFCCOVERING:SKIRTINGBOARD": "longitud",
  // Se miden por volumen — el Neto es imprescindible en los encuentros en
  // "L"/"T" para no computar dos veces el material de la unión.
  IFCCOLUMN: "volumen",
  IFCBEAM: "volumen",
  IFCFOOTING: "volumen",
  IFCPILE: "volumen",
  // Se miden por longitud.
  IFCPIPESEGMENT: "longitud",
  IFCDUCTSEGMENT: "longitud",
  IFCCABLECARRIERSEGMENT: "longitud",
  IFCRAILING: "longitud",
  IFCMEMBER: "longitud",
};

let overridesCache: Record<string, QuantityMethod> | null = null;

function readOverrides(): Record<string, QuantityMethod> {
  if (overridesCache) return overridesCache;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    overridesCache = raw ? JSON.parse(raw) : {};
  } catch {
    overridesCache = {};
  }
  return overridesCache;
}

function writeOverrides(overrides: Record<string, QuantityMethod>): void {
  overridesCache = overrides;
  if (Object.keys(overrides).length === 0) localStorage.removeItem(STORAGE_KEY);
  else localStorage.setItem(STORAGE_KEY, JSON.stringify(overrides));
}

let sourcesCache: Record<string, QuantitySource> | null = null;

function readSources(): Record<string, QuantitySource> {
  if (sourcesCache) return sourcesCache;
  try {
    const raw = localStorage.getItem(SOURCE_STORAGE_KEY);
    sourcesCache = raw ? JSON.parse(raw) : {};
  } catch {
    sourcesCache = {};
  }
  return sourcesCache!;
}

function writeSources(sources: Record<string, QuantitySource>): void {
  sourcesCache = sources;
  if (Object.keys(sources).length === 0) localStorage.removeItem(SOURCE_STORAGE_KEY);
  else localStorage.setItem(SOURCE_STORAGE_KEY, JSON.stringify(sources));
}

/** Método de cuantificación efectivo para un tipo IFC: override del usuario
 *  para `CLASE:PREDEFINEDTYPE` (si `predefinedType` viene y hay regla para
 *  ese par), si no override para la `CLASE` sola, si no el default de
 *  fábrica en el mismo orden, si no "auto". */
export function getQuantityMethod(tipoIfc: string | null, predefinedType?: string | null): QuantityMethod {
  if (!tipoIfc) return "auto";
  const overrides = readOverrides();
  const classKey = normalizeIfcType(tipoIfc);

  const pdt = predefinedType?.trim();
  if (pdt && !UNDEFINED_PREDEFINED_TYPES.has(pdt.toUpperCase())) {
    const compoundKey = normalizeIfcType(`${classKey}:${pdt}`);
    const compound = overrides[compoundKey] ?? DEFAULT_RULES[compoundKey];
    if (compound) return compound;
  }

  return overrides[classKey] ?? DEFAULT_RULES[classKey] ?? "auto";
}

/** Fuente de cantidad efectiva para un tipo IFC (Property Set + propiedad de
 *  la que leer el número), o `null` si no hay ninguna configurada — mismo
 *  orden de resolución que `getQuantityMethod`: `CLASE:PREDEFINEDTYPE` y si
 *  no la `CLASE` sola. Solo overrides del usuario: no hay defaults de fábrica. */
export function getQuantitySource(
  tipoIfc: string | null,
  predefinedType?: string | null,
): QuantitySource | null {
  if (!tipoIfc) return null;
  const sources = readSources();
  const classKey = normalizeIfcType(tipoIfc);

  const pdt = predefinedType?.trim();
  if (pdt && !UNDEFINED_PREDEFINED_TYPES.has(pdt.toUpperCase())) {
    const compoundKey = normalizeIfcType(`${classKey}:${pdt}`);
    if (sources[compoundKey]) return sources[compoundKey];
  }

  return sources[classKey] ?? null;
}

/** Todas las reglas para mostrar en el panel de Configuración: unión de los
 *  tipos con default de fábrica y los que el usuario haya agregado (por
 *  método o por fuente de PSet). */
export function listQuantityRules(): QuantityRule[] {
  const overrides = readOverrides();
  const sources = readSources();
  const tipos = new Set([
    ...Object.keys(DEFAULT_RULES),
    ...Object.keys(overrides),
    ...Object.keys(sources),
  ]);
  return [...tipos].sort().map((tipo) => ({
    tipo,
    method: overrides[tipo] ?? DEFAULT_RULES[tipo] ?? "auto",
    source: sources[tipo] ?? null,
    isCustomType: !(tipo in DEFAULT_RULES),
    isOverridden: tipo in overrides,
  }));
}

/** Fija la regla de un tipo IFC (nuevo o existente). Se persiste en
 *  localStorage salvo que coincida con el default de fábrica, en cuyo caso
 *  no hace falta guardar una override. */
export function setQuantityRule(tipoIfc: string, method: QuantityMethod): void {
  const key = normalizeIfcType(tipoIfc);
  if (!key) return;
  const overrides = { ...readOverrides() };
  if (method === DEFAULT_RULES[key]) delete overrides[key];
  else overrides[key] = method;
  writeOverrides(overrides);
}

/** Fija (o limpia, con `null` o `prop` vacío) la fuente de cantidad de un tipo
 *  IFC — el Property Set y la propiedad de la que el extractor debe leer el
 *  número en vez de probar sus claves candidatas. */
export function setQuantitySource(tipoIfc: string, source: QuantitySource | null): void {
  const key = normalizeIfcType(tipoIfc);
  if (!key) return;
  const sources = { ...readSources() };
  const prop = source?.prop.trim() ?? "";
  if (!prop) delete sources[key];
  else sources[key] = { pset: source?.pset.trim() ?? "", prop };
  writeSources(sources);
}

/** Quita la regla de un tipo IFC (método Y fuente de PSet): si tenía default
 *  de fábrica, vuelve a él; si era un tipo agregado por el usuario, desaparece
 *  de la lista. */
export function resetQuantityRule(tipoIfc: string): void {
  const key = normalizeIfcType(tipoIfc);
  const overrides = { ...readOverrides() };
  delete overrides[key];
  writeOverrides(overrides);
  const sources = { ...readSources() };
  delete sources[key];
  writeSources(sources);
}
