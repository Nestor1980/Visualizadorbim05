/**
 * Reglas de cuantificación por tipo IFC: define, para cada clase IFC (ej.
 * "IFCWALL", "IFCWINDOW"), qué magnitud usa la herramienta de Cómputo para
 * calcular su cantidad — área, volumen, longitud o conteo de piezas.
 * "auto" (el valor para cualquier tipo no listado acá) prueba área → volumen
 * → longitud según qué quantity set IFC traiga datos, con respaldo geométrico
 * de área cuando no hay ninguno — ver `quantity-extractor.ts`.
 *
 * Los defaults viven en código (`DEFAULT_RULES`); el usuario puede
 * sobreescribirlos (o agregar reglas para tipos nuevos) desde el modal de
 * Configuración, y esas overrides se guardan en localStorage — son una
 * preferencia del navegador, no del proyecto.
 */

export type QuantityMethod = "cantidad" | "area" | "volumen" | "longitud" | "auto";

export interface QuantityRule {
  tipo: string;
  method: QuantityMethod;
  /** true si el tipo no viene en `DEFAULT_RULES` — lo agregó el usuario. */
  isCustomType: boolean;
  /** true si el valor efectivo viene de una override guardada, no del default. */
  isOverridden: boolean;
}

const STORAGE_KEY = "bim-computo-quantity-rules";

export const QUANTITY_METHOD_LABELS: Record<QuantityMethod, string> = {
  cantidad: "Cantidad (piezas)",
  area: "Área (m²)",
  volumen: "Volumen (m³)",
  longitud: "Longitud (ml)",
  auto: "Automático",
};

// IFC4 tiene variantes "StandardCase" de varias entidades (IfcWindowStandardCase,
// IfcWallStandardCase, etc.) que muchos exportadores (Revit incluido) emiten en
// vez de la entidad simple — sin normalizar esto, una ventana exportada como
// "IFCWINDOWSTANDARDCASE" no matchearía la regla de "IFCWINDOW".
export function normalizeIfcType(tipoIfc: string): string {
  const upper = tipoIfc.trim().toUpperCase();
  return upper.endsWith("STANDARDCASE") ? upper.slice(0, -"STANDARDCASE".length) : upper;
}

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
  IFCSTAIRFLIGHT: "cantidad",
  IFCRAMPFLIGHT: "cantidad",
  // Se miden por superficie.
  IFCWALL: "area",
  IFCSLAB: "area",
  IFCROOF: "area",
  IFCCOVERING: "area",
  IFCCURTAINWALL: "area",
  IFCPLATE: "area",
  // Se miden por volumen.
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

/** Método de cuantificación efectivo para un tipo IFC: override del usuario,
 *  si no default de fábrica, si no "auto". */
export function getQuantityMethod(tipoIfc: string | null): QuantityMethod {
  if (!tipoIfc) return "auto";
  const key = normalizeIfcType(tipoIfc);
  return readOverrides()[key] ?? DEFAULT_RULES[key] ?? "auto";
}

/** Todas las reglas para mostrar en el panel de Configuración: unión de los
 *  tipos con default de fábrica y los que el usuario haya agregado. */
export function listQuantityRules(): QuantityRule[] {
  const overrides = readOverrides();
  const tipos = new Set([...Object.keys(DEFAULT_RULES), ...Object.keys(overrides)]);
  return [...tipos].sort().map((tipo) => ({
    tipo,
    method: overrides[tipo] ?? DEFAULT_RULES[tipo] ?? "auto",
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

/** Quita la regla de un tipo IFC: si tenía default de fábrica, vuelve a él;
 *  si era un tipo agregado por el usuario, desaparece de la lista. */
export function resetQuantityRule(tipoIfc: string): void {
  const key = normalizeIfcType(tipoIfc);
  const overrides = { ...readOverrides() };
  delete overrides[key];
  writeOverrides(overrides);
}
