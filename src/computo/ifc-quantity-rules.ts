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
