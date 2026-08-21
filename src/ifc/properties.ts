import * as OBC from "@thatopen/components";

export async function getItemData(model: any, id: number, deep = true): Promise<any> {
  if (!Number.isFinite(id)) return null;
  if (typeof model.getItemsData === "function") {
    try {
      const cfg = deep
        ? { attributesDefault: true, relationsDefault: { attributes: true, relations: true } }
        : { attributesDefault: true };
      const result = model.getItemsData([id], cfg);
      const awaited = result?.then ? await result : result;
      return Array.isArray(awaited) ? awaited[0] : awaited;
    } catch { /* try next */ }
  }
  if (typeof model.getItemData === "function") {
    try { return await model.getItemData(id); } catch { /* try next */ }
  }
  if (model?.properties?.getItemData) {
    try { return model.properties.getItemData(id); } catch { /* try next */ }
  }
  return model?.properties?.[id] ?? null;
}

export function getExpressId(obj: any): number | null {
  if (!obj || typeof obj !== "object") return null;
  if (typeof obj._localId === "number")       return obj._localId;
  if (typeof obj._localId?.value === "number") return obj._localId.value;
  if (typeof obj.expressID === "number")       return obj.expressID;
  return null;
}

export function extractPropValue(prop: any): string {
  if (!prop || typeof prop !== "object") return "—";
  // IfcQuantityArea/Volume/Length/Weight/Count (Qto_ sets) guardan el valor en
  // su propio campo *Value en vez de NominalValue/Value como un IfcPropertySingleValue.
  const raw = prop.NominalValue ?? prop.Value
    ?? prop.AreaValue ?? prop.VolumeValue ?? prop.LengthValue ?? prop.WeightValue ?? prop.CountValue;
  if (raw === null || raw === undefined) return "—";
  if (typeof raw === "object" && raw.value !== undefined) return String(raw.value);
  if (typeof raw === "object") return JSON.stringify(raw);
  return String(raw);
}

export async function processPset(
  psetObj: any,
  model: any,
  out: Map<string, { name: string; properties: Record<string, string> }>,
): Promise<void> {
  if (!psetObj || typeof psetObj !== "object") return;

  const rawName = psetObj.Name;
  const name: string =
    typeof rawName === "string"    ? rawName
    : rawName?.value !== undefined ? String(rawName.value)
    : "";
  if (!name) return;

  // Re-fetch pset by its own ID with attributes-only config so HasProperties
  // items come fully inlined rather than as {value:id} references.
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
    } catch { /* fall through to inline version */ }
  }

  const rawProps = workingPset.HasProperties ?? workingPset.Properties ?? workingPset.Quantities;
  if (!Array.isArray(rawProps) || rawProps.length === 0) return;

  const propertyMap: Record<string, string> = {};
  for (const pRef of rawProps) {
    if (pRef === null || pRef === undefined) continue;

    let prop: any = null;
    if (typeof pRef === "number") {
      prop = await getItemData(model, pRef, false);
    } else if (typeof pRef === "object" && typeof pRef.value === "number") {
      prop = await getItemData(model, pRef.value, false);
    } else if (typeof pRef === "object") {
      prop = pRef;
    }
    if (!prop || typeof prop !== "object") continue;

    const rawPropName = prop.Name;
    const propName: string =
      typeof rawPropName === "string"    ? rawPropName
      : rawPropName?.value !== undefined ? String(rawPropName.value)
      : "Propiedad";
    propertyMap[propName] = extractPropValue(prop);
  }

  if (Object.keys(propertyMap).length === 0) return;

  const existing = out.get(name);
  if (!existing || Object.keys(propertyMap).length > Object.keys(existing.properties).length) {
    out.set(name, { name, properties: propertyMap });
  }
}

export async function getTypePsets(
  model: any,
  itemData: any,
): Promise<{ name: string; properties: Record<string, string> }[]> {
  const out = new Map<string, { name: string; properties: Record<string, string> }>();
  const isTypedBy = itemData.IsTypedBy;
  if (!Array.isArray(isTypedBy) || isTypedBy.length === 0) return [];

  for (const relRef of isTypedBy) {
    if (relRef === null || relRef === undefined) continue;

    let relObj: any;
    if (typeof relRef === "number") {
      relObj = await getItemData(model, relRef, false);
    } else if (typeof relRef === "object" && typeof relRef.value === "number") {
      relObj = await getItemData(model, relRef.value, false);
    } else {
      relObj = relRef;
    }
    if (!relObj || typeof relObj !== "object") continue;

    const relatingTypeRef = relObj.RelatingType;
    if (!relatingTypeRef) continue;

    let typeObj: any;
    if (typeof relatingTypeRef === "number") {
      typeObj = await getItemData(model, relatingTypeRef, true);
    } else if (typeof relatingTypeRef === "object" && typeof relatingTypeRef.value === "number") {
      typeObj = await getItemData(model, relatingTypeRef.value, true);
    } else {
      typeObj = relatingTypeRef;
    }
    if (!typeObj || typeof typeObj !== "object") continue;

    const typePsetSources = [
      ...(Array.isArray(typeObj.IsDefinedBy)     ? typeObj.IsDefinedBy     : []),
      ...(Array.isArray(typeObj.HasPropertySets) ? typeObj.HasPropertySets : []),
    ];

    for (const entry of typePsetSources) {
      if (entry === null || entry === undefined) continue;

      let obj: any;
      if (typeof entry === "number") {
        obj = await getItemData(model, entry, false);
      } else if (typeof entry === "object" && typeof entry.value === "number") {
        obj = await getItemData(model, entry.value, false);
      } else {
        obj = entry;
      }
      if (!obj || typeof obj !== "object") continue;

      const hasProps = obj.HasProperties ?? obj.Properties ?? obj.Quantities;
      if (obj.Name && Array.isArray(hasProps)) {
        await processPset(obj, model, out);
        continue;
      }

      const relPropDef = obj.RelatingPropertyDefinition;
      if (!relPropDef) continue;
      const defs = Array.isArray(relPropDef) ? relPropDef : [relPropDef];
      for (const defRef of defs) {
        let psetObj: any = null;
        if (typeof defRef === "number") {
          psetObj = await getItemData(model, defRef, false);
        } else if (typeof defRef === "object" && typeof defRef.value === "number") {
          psetObj = await getItemData(model, defRef.value, false);
        } else if (typeof defRef === "object") {
          psetObj = defRef;
        }
        if (psetObj) await processPset(psetObj, model, out);
      }
    }
  }

  return Array.from(out.values());
}

/**
 * Nombre del tipo/familia de un elemento (ej. "MUR_LHC200") — a diferencia
 * de `getTypePsets` (que trae los Psets del tipo), esto solo resuelve el
 * `Name` del `IfcElementType` relacionado (vía `IsTypedBy` → `RelatingType`),
 * con `ObjectType` de la instancia como respaldo. Se usa para separar
 * elementos que comparten clase IFC (ej. todos "IFCWALL") pero son de tipos
 * distintos (paredes de espesores/materiales distintos), algo que la sola
 * categoría IFC no distingue.
 */
export async function getElementTypeName(model: any, localId: number): Promise<string | null> {
  const itemData = await getItemData(model, localId, true);
  if (!itemData) return null;

  const isTypedBy = itemData.IsTypedBy;
  if (Array.isArray(isTypedBy)) {
    for (const relRef of isTypedBy) {
      if (relRef === null || relRef === undefined) continue;

      let relObj: any;
      if (typeof relRef === "number") {
        relObj = await getItemData(model, relRef, false);
      } else if (typeof relRef === "object" && typeof relRef.value === "number") {
        relObj = await getItemData(model, relRef.value, false);
      } else {
        relObj = relRef;
      }
      if (!relObj || typeof relObj !== "object") continue;

      const relatingTypeRef = relObj.RelatingType;
      if (!relatingTypeRef) continue;

      let typeObj: any;
      if (typeof relatingTypeRef === "number") {
        typeObj = await getItemData(model, relatingTypeRef, false);
      } else if (typeof relatingTypeRef === "object" && typeof relatingTypeRef.value === "number") {
        typeObj = await getItemData(model, relatingTypeRef.value, false);
      } else {
        typeObj = relatingTypeRef;
      }
      if (!typeObj || typeof typeObj !== "object") continue;

      const rawName = typeObj.Name;
      const name =
        typeof rawName === "string" ? rawName
        : rawName?.value !== undefined ? String(rawName.value)
        : null;
      if (name) return name;
    }
  }

  const rawObjectType = itemData.ObjectType;
  const objectType =
    typeof rawObjectType === "string" ? rawObjectType
    : rawObjectType?.value !== undefined ? String(rawObjectType.value)
    : null;
  return objectType;
}

/**
 * PredefinedType de una instancia (ej. "BASESLAB", "ROOF", "SKIRTINGBOARD")
 * — el atributo IFC que distingue usos distintos de una misma clase (ej.
 * IFCSLAB de fundación vs de piso, IFCCOVERING de zócalo vs de revoque). Se
 * usa para desambiguar la regla de cuantificación cuando la sola clase IFC
 * no alcanza (ver ifc-quantity-rules.ts).
 */
export async function getPredefinedType(model: any, localId: number): Promise<string | null> {
  const itemData = await getItemData(model, localId, false);
  const raw = itemData?.PredefinedType;
  return typeof raw === "string" ? raw
    : raw?.value !== undefined ? String(raw.value)
    : null;
}

export async function getPropertySets(
  modelId: string,
  localId: number,
  fragments: OBC.FragmentsManager,
): Promise<{ name: string; properties: Record<string, string> }[]> {
  const model = fragments.list.get(modelId);
  if (!model) return [];

  const out = new Map<string, { name: string; properties: Record<string, string> }>();
  const itemData = await getItemData(model, localId);
  if (!itemData) return [];

  const isDefinedBy = itemData.IsDefinedBy;
  if (Array.isArray(isDefinedBy)) {
    for (const entry of isDefinedBy) {
      if (entry === null || entry === undefined) continue;

      let obj: any;
      if (typeof entry === "number") {
        obj = await getItemData(model, entry, false);
      } else if (typeof entry === "object" && typeof entry.value === "number") {
        obj = await getItemData(model, entry.value, false);
      } else {
        obj = entry;
      }
      if (!obj || typeof obj !== "object") continue;

      const hasProps = obj.HasProperties ?? obj.Properties ?? obj.Quantities;
      if (obj.Name && Array.isArray(hasProps)) {
        await processPset(obj, model, out);
        continue;
      }

      const relPropDef = obj.RelatingPropertyDefinition;
      if (!relPropDef) continue;
      const defs = Array.isArray(relPropDef) ? relPropDef : [relPropDef];
      for (const defRef of defs) {
        let psetObj: any = null;
        if (typeof defRef === "number") {
          psetObj = await getItemData(model, defRef, false);
        } else if (typeof defRef === "object" && typeof defRef.value === "number") {
          psetObj = await getItemData(model, defRef.value, false);
        } else if (typeof defRef === "object") {
          psetObj = defRef;
        }
        if (psetObj) await processPset(psetObj, model, out);
      }
    }
  }

  // Merge Psets from the linked IfcElementType — instance values take precedence.
  const typePsets = await getTypePsets(model, itemData);
  for (const tPset of typePsets) {
    const existing = out.get(tPset.name);
    if (existing) {
      out.set(tPset.name, {
        name: tPset.name,
        properties: { ...tPset.properties, ...existing.properties },
      });
    } else {
      out.set(tPset.name, tPset);
    }
  }

  return Array.from(out.values());
}

export async function getSharedPropertySets(
  modelId: string,
  localIds: number[],
  fragments: OBC.FragmentsManager,
): Promise<{ name: string; properties: Record<string, string> }[]> {
  if (localIds.length === 0) return [];
  if (localIds.length === 1) return getPropertySets(modelId, localIds[0], fragments);

  const SAMPLE   = Math.min(localIds.length, 8);
  const sample   = localIds.slice(0, SAMPLE);
  const allPsets = await Promise.all(sample.map(id => getPropertySets(modelId, id, fragments)));

  const firstPsets = allPsets[0] ?? [];
  const shared = firstPsets.filter(pset =>
    allPsets.every(itemPsets => itemPsets.some(p => p.name === pset.name)),
  );

  return shared.map(pset => {
    const merged: Record<string, string> = {};
    const matchingAll = allPsets.map(
      itemPsets => itemPsets.find(p => p.name === pset.name),
    );
    for (const [propName, propValue] of Object.entries(pset.properties)) {
      const allVals = matchingAll.map(p => p?.properties[propName] ?? "—");
      merged[propName] = allVals.every(v => v === allVals[0]) ? propValue : "(varies)";
    }
    return { name: pset.name, properties: merged };
  });
}
