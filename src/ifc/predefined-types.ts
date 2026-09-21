import { IFC2X3, IFC4, IFC4X3 } from "web-ifc";
import { normalizeIfcType } from "../computo/ifc-quantity-rules";

// Catálogo de los esquemas soportados por el lector. Los valores describen
// funciones IFC (BEAM, JOIST…), no materiales como acero u hormigón.
let catalog: Map<string, Set<string>> | undefined;

export function getPredefinedTypeOptions(ifcClass: string): string[] {
  if (!catalog) {
    catalog = new Map();
    for (const schema of [IFC2X3, IFC4, IFC4X3]) {
      for (const [name, enumeration] of Object.entries(schema)) {
        if (!name.endsWith("TypeEnum")) continue;
        const key = name.slice(0, -"TypeEnum".length).toUpperCase();
        const values = catalog.get(key) ?? new Set<string>();
        for (const entry of Object.values(enumeration)) {
          if (entry && typeof entry === "object" && "value" in entry && typeof entry.value === "string") {
            values.add(entry.value);
          }
        }
        catalog.set(key, values);
      }
    }
  }
  return [...(catalog.get(normalizeIfcType(ifcClass).split(":")[0]) ?? [])].sort();
}
