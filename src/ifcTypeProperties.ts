/**
 * ifcTypeProperties.ts
 *
 * Extrae las propiedades del IfcElementType vinculado a un elemento IFC
 * seleccionado, siguiendo la cadena:
 *   itemData.IsTypedBy → IfcRelDefinesByType → RelatingType
 *     → IsDefinedBy / HasPropertySets → IfcPropertySet → HasProperties
 *
 * También expone las helpers primitivas (getItemData, extractPropValue, etc.)
 * para que main.ts pueda delegar toda la lógica de extracción aquí y mantener
 * su propio código limpio.
 */

// ── Tipos públicos ─────────────────────────────────────────────────────────

export interface PropertySet {
  name: string;
  properties: Record<string, string>;
}

export interface TypeInfo {
  /** Nombre del IfcElementType (ej. "Basic Wall:MUR-LCC-300") */
  typeName: string;
  /** Clase IFC del tipo (ej. "IFCWALLTYPE") */
  typeClass: string;
  /** Todos los property sets encontrados en el tipo */
  propertySets: PropertySet[];
}

// ── Helpers primitivas ─────────────────────────────────────────────────────

/**
 * Recupera los datos completos de un item dado su localId (expressID).
 * Prueba getItemsData (fragments v2), getItemData, y raw properties en ese orden.
 */
export async function getItemData(
  model: any,
  id: number,
  deep = true,
): Promise<any> {
  if (!Number.isFinite(id)) return null;

  if (typeof model.getItemsData === "function") {
    try {
      const cfg = deep
        ? { attributesDefault: true, relationsDefault: { attributes: true, relations: true } }
        : { attributesDefault: true };
      const result = model.getItemsData([id], cfg);
      const awaited = result?.then ? await result : result;
      return Array.isArray(awaited) ? awaited[0] : awaited;
    } catch { /* intentar siguiente */ }
  }

  if (typeof model.getItemData === "function") {
    try { return await model.getItemData(id); } catch { /* intentar siguiente */ }
  }

  if (model?.properties?.getItemData) {
    try { return model.properties.getItemData(id); } catch { /* intentar siguiente */ }
  }

  return model?.properties?.[id] ?? null;
}

/**
 * Extrae el expressID de un objeto inline de ThatOpen.
 * _localId puede ser un número plano o un wrapper { value: N }.
 */
export function getExpressId(obj: any): number | null {
  if (!obj || typeof obj !== "object") return null;
  if (typeof obj._localId === "number")        return obj._localId;
  if (typeof obj._localId?.value === "number") return obj._localId.value;
  if (typeof obj.expressID === "number")       return obj.expressID;
  return null;
}

/**
 * Devuelve una cadena legible para NominalValue / Value de una propiedad IFC.
 * Maneja wrappers { value }, escalares y estructuras desconocidas.
 */
export function extractPropValue(prop: any): string {
  if (!prop || typeof prop !== "object") return "—";
  const raw = prop.NominalValue ?? prop.Value;
  if (raw === null || raw === undefined) return "—";
  if (typeof raw === "object" && raw.value !== undefined) return String(raw.value);
  if (typeof raw === "object") return JSON.stringify(raw);
  return String(raw);
}

/**
 * Extrae el valor de un campo Name de objeto IFC.
 * Acepta string plano o wrapper { value }.
 */
export function extractName(raw: any): string {
  if (typeof raw === "string") return raw;
  if (raw?.value !== undefined) return String(raw.value);
  return "";
}

// ── Extracción de PropertySets ─────────────────────────────────────────────

/**
 * Construye una entrada { name, properties } a partir de un IfcPropertySet.
 *
 * Re-recupera el pset por su propio ID (solo atributos) para que ThatOpen
 * inline HasProperties directamente. Las propiedades que siguen siendo
 * referencias se resuelven individualmente.
 */
export async function processPset(
  psetObj: any,
  model: any,
  out: Map<string, PropertySet>,
): Promise<void> {
  if (!psetObj || typeof psetObj !== "object") return;

  const name = extractName(psetObj.Name);
  if (!name) return;

  // Re-fetch por ID propio para obtener HasProperties inline
  let workingPset = psetObj;
  const psetId = getExpressId(psetObj);
  if (psetId !== null && typeof model.getItemsData === "function") {
    try {
      const res = model.getItemsData([psetId], { attributesDefault: true });
      const fetched = Array.isArray(res?.then ? await res : res)
        ? (res?.then ? await res : res)[0]
        : (res?.then ? await res : res);
      const hp = fetched?.HasProperties ?? fetched?.Properties ?? fetched?.Quantities;
      if (fetched && Array.isArray(hp)) workingPset = fetched;
    } catch { /* usar versión inline */ }
  }

  const rawProps = workingPset.HasProperties ?? workingPset.Properties ?? workingPset.Quantities;
  if (!Array.isArray(rawProps) || rawProps.length === 0) return;

  const propertyMap: Record<string, string> = {};

  for (const pRef of rawProps) {
    if (pRef == null) continue;

    let prop: any = null;
    if (typeof pRef === "number") {
      prop = await getItemData(model, pRef, false);
    } else if (typeof pRef === "object" && typeof pRef.value === "number") {
      prop = await getItemData(model, pRef.value, false);
    } else if (typeof pRef === "object") {
      prop = pRef;
    }
    if (!prop || typeof prop !== "object") continue;

    const propName = extractName(prop.Name) || "Propiedad";
    propertyMap[propName] = extractPropValue(prop);
  }

  if (Object.keys(propertyMap).length === 0) return;

  // Conservar la versión con más propiedades si ya existe
  const existing = out.get(name);
  if (!existing || Object.keys(propertyMap).length > Object.keys(existing.properties).length) {
    out.set(name, { name, properties: propertyMap });
  }
}

/**
 * Resuelve una referencia IFC (número, wrapper { value }, o objeto inline)
 * y devuelve el objeto resultante.
 */
async function resolveRef(ref: any, model: any, deep = false): Promise<any> {
  if (ref == null) return null;
  if (typeof ref === "number")                              return getItemData(model, ref, deep);
  if (typeof ref === "object" && typeof ref.value === "number") return getItemData(model, ref.value, deep);
  if (typeof ref === "object")                              return ref;
  return null;
}

// ── API principal ──────────────────────────────────────────────────────────

/**
 * Extrae toda la información del IfcElementType vinculado al elemento dado.
 *
 * Sigue la cadena:
 *   itemData.IsTypedBy → IfcRelDefinesByType.RelatingType
 *     → IsDefinedBy / HasPropertySets → IfcPropertySet
 *
 * @param model   FragmentsModel de ThatOpen
 * @param localId localId (expressID) del elemento seleccionado
 * @returns TypeInfo o null si el elemento no tiene tipo definido
 */
export async function getTypeInfo(
  model: any,
  localId: number,
): Promise<TypeInfo | null> {
  const itemData = await getItemData(model, localId);
  if (!itemData) return null;

  const isTypedBy = itemData.IsTypedBy;
  if (!Array.isArray(isTypedBy) || isTypedBy.length === 0) return null;

  const psetOut = new Map<string, PropertySet>();
  let typeName  = "";
  let typeClass = "";

  for (const relRef of isTypedBy) {
    const relObj = await resolveRef(relRef, model, false);
    if (!relObj) continue;

    // Resolver RelatingType → IfcElementType
    const typeObj = await resolveRef(relObj.RelatingType, model, true);
    if (!typeObj) continue;

    // Nombre e clase del tipo
    if (!typeName) typeName = extractName(typeObj.Name);
    if (!typeClass) {
      const rawClass = typeObj.type ?? typeObj.__type ?? typeObj._type ?? typeObj.constructor?.name ?? "";
      typeClass = typeof rawClass === "string" ? rawClass.toUpperCase() : "";
    }

    // Recorrer IsDefinedBy + HasPropertySets del tipo
    const psetSources: any[] = [
      ...(Array.isArray(typeObj.IsDefinedBy)     ? typeObj.IsDefinedBy     : []),
      ...(Array.isArray(typeObj.HasPropertySets) ? typeObj.HasPropertySets : []),
    ];

    for (const entry of psetSources) {
      const obj = await resolveRef(entry, model, false);
      if (!obj) continue;

      // Caso A: objeto ya es un pset (tiene Name + HasProperties)
      const hasProps = obj.HasProperties ?? obj.Properties ?? obj.Quantities;
      if (obj.Name && Array.isArray(hasProps)) {
        await processPset(obj, model, psetOut);
        continue;
      }

      // Caso B: es IfcRelDefinesByProperties → seguir RelatingPropertyDefinition
      const relPropDef = obj.RelatingPropertyDefinition;
      if (!relPropDef) continue;
      const defs = Array.isArray(relPropDef) ? relPropDef : [relPropDef];
      for (const defRef of defs) {
        const psetObj = await resolveRef(defRef, model, false);
        if (psetObj) await processPset(psetObj, model, psetOut);
      }
    }
  }

  if (psetOut.size === 0 && !typeName) return null;

  return {
    typeName:     typeName  || "Tipo desconocido",
    typeClass:    typeClass || "IFCELEMENTTYPE",
    propertySets: Array.from(psetOut.values()),
  };
}
