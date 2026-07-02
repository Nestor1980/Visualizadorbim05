import * as OBC from "@thatopen/components";

export async function setupIfcLoader(components: OBC.Components): Promise<OBC.IfcLoader> {
  const ifcLoader = components.get(OBC.IfcLoader);
  await ifcLoader.setup({
    autoSetWasm: false,
    wasm: { path: "https://unpkg.com/web-ifc@0.0.77/", absolute: true },
  });
  return ifcLoader;
}
