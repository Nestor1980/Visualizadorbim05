/**
 * Reglas de categoría automática por tipo IFC: mapea una clase IFC (ej.
 * "IFCWALL") al nombre de la sección de cómputo a la que se asigna
 * automáticamente un ítem nuevo de ese tipo (ver `handleAdd` en
 * computo-tool.ts) — misma idea que `ifc-quantity-rules.ts` pero para el
 * nombre de categoría en vez del método de cuantificación, y con el mismo
 * mecanismo: defaults en código, overrides del usuario en localStorage
 * (preferencia del navegador, no del proyecto), reglas compuestas opcionales
 * "CLASE:PREDEFINEDTYPE" para desambiguar (ej. una losa de fundación va a
 * "Fundaciones", una losa de piso a "Losas", aunque ambas sean IFCSLAB).
 *
 * Un tipo sin regla (ni default ni override) no se autoasigna a ninguna
 * categoría: el ítem nace en "Sin categoría" y el usuario lo arrastra a mano,
 * como antes de que existiera esta auto-asignación.
 *
 * La asignación es de una sola vez, al crear el ítem — igual que Rubro/
 * Descripción se siembran del primer elemento y no se recalculan después,
 * para no pisar una recategorización manual (drag & drop) que el usuario ya
 * haya hecho.
 */

import { normalizeIfcType } from "./ifc-quantity-rules";

export interface CategoriaRule {
  tipo: string;
  nombre: string;
  /** true si el tipo no viene en `DEFAULT_CATEGORIA_RULES` — lo agregó el usuario. */
  isCustomType: boolean;
  /** true si el valor efectivo viene de una override guardada, no del default. */
  isOverridden: boolean;
}

const STORAGE_KEY = "bim-computo-categoria-rules";

const UNDEFINED_PREDEFINED_TYPES = new Set(["NOTDEFINED", "USERDEFINED"]);

const DEFAULT_CATEGORIA_RULES: Record<string, string> = {
  IFCWALL: "Paredes",
  IFCCURTAINWALL: "Paredes",
  IFCWINDOW: "Ventanas",
  IFCDOOR: "Puertas",
  IFCPLATE: "Placas",
  IFCSLAB: "Losas",
  "IFCSLAB:BASESLAB": "Fundaciones",
  "IFCSLAB:ROOF": "Cubiertas",
  IFCROOF: "Cubiertas",
  IFCCOLUMN: "Columnas",
  IFCBEAM: "Vigas",
  IFCFOOTING: "Fundaciones",
  IFCPILE: "Fundaciones",
  IFCCOVERING: "Revestimientos",
  "IFCCOVERING:MOLDING": "Zócalos",
  "IFCCOVERING:SKIRTINGBOARD": "Zócalos",
  IFCFURNISHINGELEMENT: "Mobiliario",
  IFCFURNITURE: "Mobiliario",
  IFCSANITARYTERMINAL: "Artefactos sanitarios",
  IFCFLOWTERMINAL: "Instalación sanitaria",
  IFCPIPESEGMENT: "Instalación sanitaria",
  IFCLIGHTFIXTURE: "Iluminación",
  IFCOUTLET: "Instalación eléctrica",
  IFCSWITCHINGDEVICE: "Instalación eléctrica",
  IFCELECTRICDISTRIBUTIONBOARD: "Instalación eléctrica",
  IFCCABLECARRIERSEGMENT: "Instalación eléctrica",
  IFCDUCTSEGMENT: "Instalación de aire",
  IFCSTAIRFLIGHT: "Escaleras",
  IFCRAMPFLIGHT: "Rampas",
  IFCRAILING: "Barandas",
  IFCMEMBER: "Estructura metálica",
};

let overridesCache: Record<string, string> | null = null;

function readOverrides(): Record<string, string> {
  if (overridesCache) return overridesCache;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    overridesCache = raw ? JSON.parse(raw) : {};
  } catch {
    overridesCache = {};
  }
  return overridesCache;
}

function writeOverrides(overrides: Record<string, string>): void {
  overridesCache = overrides;
  if (Object.keys(overrides).length === 0) localStorage.removeItem(STORAGE_KEY);
  else localStorage.setItem(STORAGE_KEY, JSON.stringify(overrides));
}

/** Nombre de categoría efectivo para un tipo IFC, o `null` si no hay regla
 *  (ni override ni default) — en ese caso el ítem no se autoasigna. Prueba
 *  primero `CLASE:PREDEFINEDTYPE` (si `predefinedType` viene y hay regla para
 *  ese par), si no la `CLASE` sola. */
export function getCategoriaNombre(tipoIfc: string | null, predefinedType?: string | null): string | null {
  if (!tipoIfc) return null;
  const overrides = readOverrides();
  const classKey = normalizeIfcType(tipoIfc);

  const pdt = predefinedType?.trim();
  if (pdt && !UNDEFINED_PREDEFINED_TYPES.has(pdt.toUpperCase())) {
    const compoundKey = normalizeIfcType(`${classKey}:${pdt}`);
    const compound = overrides[compoundKey] ?? DEFAULT_CATEGORIA_RULES[compoundKey];
    if (compound) return compound;
  }

  return overrides[classKey] ?? DEFAULT_CATEGORIA_RULES[classKey] ?? null;
}

/** Todas las reglas para mostrar en el panel de Configuración: unión de los
 *  tipos con default de fábrica y los que el usuario haya agregado. */
export function listCategoriaRules(): CategoriaRule[] {
  const overrides = readOverrides();
  const tipos = new Set([...Object.keys(DEFAULT_CATEGORIA_RULES), ...Object.keys(overrides)]);
  return [...tipos].sort().map((tipo) => ({
    tipo,
    nombre: overrides[tipo] ?? DEFAULT_CATEGORIA_RULES[tipo] ?? "",
    isCustomType: !(tipo in DEFAULT_CATEGORIA_RULES),
    isOverridden: tipo in overrides,
  }));
}

/** Fija la categoría de un tipo IFC (nuevo o existente). Se persiste en
 *  localStorage salvo que coincida con el default de fábrica, en cuyo caso
 *  no hace falta guardar una override. */
export function setCategoriaRule(tipoIfc: string, nombre: string): void {
  const key = normalizeIfcType(tipoIfc);
  if (!key || !nombre.trim()) return;
  const overrides = { ...readOverrides() };
  if (nombre === DEFAULT_CATEGORIA_RULES[key]) delete overrides[key];
  else overrides[key] = nombre;
  writeOverrides(overrides);
}

/** Quita la regla de un tipo IFC: si tenía default de fábrica, vuelve a él;
 *  si era un tipo agregado por el usuario, desaparece de la lista. */
export function resetCategoriaRule(tipoIfc: string): void {
  const key = normalizeIfcType(tipoIfc);
  const overrides = { ...readOverrides() };
  delete overrides[key];
  writeOverrides(overrides);
}
