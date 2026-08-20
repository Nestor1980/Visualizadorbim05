import JSZip from "jszip";
import * as OBC from "@thatopen/components";
import type { LeftPanel } from "../ui/left-panel/index";

const SCHEMA_VERSION = 1;

interface ProjectManifest {
  schemaVersion: number;
  createdAt: string;
  models: { name: string; size: number }[];
}

/** Dependencias que necesita este módulo, tomadas de las piezas ya armadas en `main.ts`. */
export interface ProjectIoDeps {
  fragments: OBC.FragmentsManager;
  topics: OBC.BCFTopics;
  viewpoints: OBC.Viewpoints;
  world: OBC.World;
  leftPanel: Pick<
    LeftPanel,
    "getModelBytes" | "loadIfcBytes" | "serializeCollections" | "restoreCollections" | "serializeDataLayers" | "restoreDataLayers"
  >;
}

/** Arma el paquete de proyecto (.vbim, un zip renombrado) con los IFC cargados,
 *  las colecciones, las capas de datos y todas sus lecturas. Ver PROJECT_SAVE_LOAD.md. */
export async function buildProjectZip(deps: ProjectIoDeps): Promise<Blob> {
  const zip = new JSZip();
  const modelBytes = deps.leftPanel.getModelBytes();

  const manifest: ProjectManifest = {
    schemaVersion: SCHEMA_VERSION,
    createdAt: new Date().toISOString(),
    models: [...modelBytes.entries()].map(([name, bytes]) => ({ name, size: bytes.byteLength })),
  };
  zip.file("manifest.json", JSON.stringify(manifest));

  const modelsFolder = zip.folder("models")!;
  for (const [name, bytes] of modelBytes) modelsFolder.file(name, bytes);

  const projectState = {
    collections: deps.leftPanel.serializeCollections(),
    dataLayers: deps.leftPanel.serializeDataLayers(),
  };
  zip.file("project.json", JSON.stringify(projectState));

  // BCF Topics tienen su propio formato de intercambio (zip BCF) con export/import
  // nativos — se reusa tal cual en vez de reinventar la serialización acá.
  const allTopics = [...deps.topics.list.values()];
  if (allTopics.length > 0) {
    const bcfBlob = await deps.topics.export(allTopics);
    zip.file("topics.bcf", await bcfBlob.arrayBuffer());
  }

  return zip.generateAsync({ type: "blob" });
}

type SaveFilePickerFn = (options?: {
  suggestedName?: string;
  types?: { description: string; accept: Record<string, string[]> }[];
}) => Promise<{
  createWritable: () => Promise<{ write: (data: Blob) => Promise<void>; close: () => Promise<void> }>;
}>;

/** Arma el paquete de proyecto y lo guarda. En navegadores con File System
 *  Access API (Chrome/Edge) abre el diálogo nativo "Guardar como" para elegir
 *  carpeta y nombre; si no está disponible (Firefox/Safari) cae a la descarga
 *  directa a la carpeta de descargas de siempre. */
export async function saveProjectToFile(deps: ProjectIoDeps): Promise<void> {
  const blob = await buildProjectZip(deps);
  const ts = new Date().toISOString().slice(0, 10);
  const suggestedName = `proyecto_${ts}.vbim`;

  const showSaveFilePicker = (window as unknown as { showSaveFilePicker?: SaveFilePickerFn }).showSaveFilePicker;
  if (showSaveFilePicker) {
    let handle;
    try {
      handle = await showSaveFilePicker({
        suggestedName,
        types: [{ description: "Proyecto BIM", accept: { "application/zip": [".vbim"] } }],
      });
    } catch (error) {
      if ((error as { name?: string })?.name === "AbortError") return; // el usuario cerró el diálogo sin elegir
      throw error;
    }
    const writable = await handle.createWritable();
    await writable.write(blob);
    await writable.close();
    return;
  }

  const file = new File([blob], suggestedName);
  const a = document.createElement("a");
  a.href = URL.createObjectURL(file);
  a.download = file.name;
  a.click();
  URL.revokeObjectURL(a.href);
}

/** Descarta todo lo cargado en la sesión actual: modelos IFC, BCF topics,
 *  colecciones y capas de datos (con sus mediciones/cortes/etiquetas/trazos). */
async function clearScene(deps: ProjectIoDeps): Promise<void> {
  for (const modelId of [...deps.fragments.list.keys()]) {
    await deps.fragments.core.disposeModel(modelId);
  }
  for (const guid of [...deps.topics.list.keys()]) deps.topics.list.delete(guid);
  deps.leftPanel.restoreCollections({ collections: [], modelCollection: [] });
  deps.leftPanel.restoreDataLayers({ layers: [], sections: [], topics: [], labels: [], drawings: [], cotas: [], computo: [] });
}

/** Vacía la escena para empezar un proyecto nuevo desde cero. */
export async function newProject(deps: ProjectIoDeps): Promise<void> {
  await clearScene(deps);
}

/** Reemplaza la escena actual por la contenida en un paquete de proyecto
 *  (.vbim). El orden de reconstrucción importa: ver PROJECT_SAVE_LOAD.md. */
export async function loadProjectZip(file: File | Blob, deps: ProjectIoDeps): Promise<void> {
  const zip = await JSZip.loadAsync(await file.arrayBuffer());

  const manifestFile = zip.file("manifest.json");
  const projectFile  = zip.file("project.json");
  if (!manifestFile || !projectFile) {
    throw new Error("Paquete de proyecto inválido: faltan manifest.json o project.json");
  }
  const manifest: ProjectManifest = JSON.parse(await manifestFile.async("string"));

  await clearScene(deps);

  // 1. Modelos IFC, cargados con su nombre original para que `fragments.list`
  //    les asigne el mismo modelId referenciado por las colecciones guardadas.
  for (const { name } of manifest.models) {
    const entry = zip.file(`models/${name}`);
    if (!entry) continue;
    const bytes = new Uint8Array(await entry.async("arraybuffer"));
    await deps.leftPanel.loadIfcBytes(bytes, name);
  }

  // 2. BCF topics antes que las capas de datos: éstas reasignan por guid de
  //    topic, así que el topic ya tiene que existir.
  const topicsFile = zip.file("topics.bcf");
  if (topicsFile) {
    const bcfBytes = new Uint8Array(await topicsFile.async("arraybuffer"));
    await deps.topics.load(bcfBytes);
    for (const vp of deps.viewpoints.list.values()) {
      if (!vp.world) vp.world = deps.world;
    }
  }

  // 3. Colecciones y capas de datos (mediciones, cortes, etiquetas, trazos).
  const projectState = JSON.parse(await projectFile.async("string"));
  deps.leftPanel.restoreCollections(projectState.collections);
  deps.leftPanel.restoreDataLayers(projectState.dataLayers);
}

/** Abre el selector de archivos del sistema y carga el .vbim elegido. */
export function pickAndOpenProjectFile(deps: ProjectIoDeps): void {
  const input = document.createElement("input");
  input.type   = "file";
  input.accept = ".vbim,.zip";
  input.onchange = async () => {
    const file = input.files?.[0];
    if (!file) return;
    try {
      await loadProjectZip(file, deps);
    } catch (error) {
      console.error("Error al abrir el proyecto:", error);
      alert("No se pudo abrir el proyecto. Revisá la consola para más detalles.");
    }
  };
  input.click();
}
