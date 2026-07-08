import * as OBF from "@thatopen/components-front";
import * as OBC from "@thatopen/components";
import * as FRAGS from "@thatopen/fragments";
import * as THREE from "three";
import type { SectionTool } from "./section-tool";
import { measureFaceEdges } from "./measurement-tool";
import type { WorldLabelTool } from "./world-label-tool";
import type * as BUI from "@thatopen/ui";
import type { ToolOptionsView } from "../ui/tool-options-panel";

export type ToolMode = "navigate" | "measure" | "section" | "label" | "properties";

interface ToolOptionsPanelLike {
  setView: (view: ToolOptionsView) => void;
}

function isEditableTarget(event: Event): boolean {
  const target = event.composedPath()[0];
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable;
}

export class ToolManager {
  activeMode: ToolMode = "navigate";

  navigateBtnEl: BUI.Button | null = null;
  measureBtnEl: BUI.Button | null = null;
  sectionBtnEl: BUI.Button | null = null;
  labelBtnEl: BUI.Button | null = null;
  propertiesBtnEl: BUI.Button | null = null;

  private measurer: OBF.LengthMeasurement;
  private highlighter: OBF.Highlighter;
  private hoverer: OBF.Hoverer;
  private sectionTool: SectionTool;
  private worldLabelTool: WorldLabelTool;
  private postproduction: { enabled: boolean } | null = null;
  private toolOptionsPanel: ToolOptionsPanelLike | null = null;

  constructor(
    measurer: OBF.LengthMeasurement,
    highlighter: OBF.Highlighter,
    hoverer: OBF.Hoverer,
    sectionTool: SectionTool,
    worldLabelTool: WorldLabelTool,
  ) {
    this.measurer      = measurer;
    this.highlighter   = highlighter;
    this.hoverer       = hoverer;
    this.sectionTool   = sectionTool;
    this.worldLabelTool = worldLabelTool;
  }

  setPostproduction(pp: { enabled: boolean }): void {
    this.postproduction = pp;
  }

  setToolOptionsPanel(toolOptionsPanel: ToolOptionsPanelLike): void {
    this.toolOptionsPanel = toolOptionsPanel;
  }

  setMode(mode: ToolMode): void {
    this.activeMode = mode;

    this.measurer.enabled                      = false;
    this.highlighter.enabled                   = false;
    this.hoverer.enabled                       = false;
    this.sectionTool.clipper.enabled           = false;
    this.sectionTool.sectionFillGroup.visible  = false;

    if (mode === "navigate" || mode === "properties") {
      this.highlighter.enabled = true;
      this.hoverer.enabled     = true;
    } else if (mode === "measure") {
      this.measurer.enabled = true;
    } else if (mode === "section") {
      this.sectionTool.clipper.enabled          = true;
      this.sectionTool.sectionFillGroup.visible = true;
    }
    if (mode !== "label") this.worldLabelTool.previewAt(null);

    const modeButtons: Record<ToolMode, BUI.Button | null> = {
      navigate:   this.navigateBtnEl,
      measure:    this.measureBtnEl,
      section:    this.sectionBtnEl,
      label:      this.labelBtnEl,
      properties: this.propertiesBtnEl,
    };
    for (const [btnMode, btn] of Object.entries(modeButtons)) {
      if (btn) btn.active = btnMode === mode;
    }

    const view: ToolOptionsView =
      mode === "measure"    ? "measure" :
      mode === "section"    ? "section" :
      mode === "properties" ? "properties" :
      null;
    this.toolOptionsPanel?.setView(view);
  }

  bindViewportEvents(
    viewport: HTMLElement,
    world: OBC.World,
    fragments: OBC.FragmentsManager,
    canvas: HTMLCanvasElement,
  ): void {
    viewport.addEventListener("dblclick", () => {
      if (this.activeMode === "section") {
        this.sectionTool.clipper.create(world);
        this.sectionTool.rebuildSectionFills();
      }
    });

    // Modo "label": un click simple sobre el modelo coloca un WorldLabel en el
    // punto de impacto. Clicks sobre un marcador ya existente (p. ej. para
    // seleccionarlo) no deben disparar una creación nueva.
    //
    // La geometría de fragments (v3) vive del lado del worker y sus mallas en
    // el hilo principal no son fiables para un `THREE.Raycaster` manual (le
    // faltan BVH/índices a varias, y tira excepciones o da "miss" en
    // superficies visiblemente sólidas). `fragments.raycast(...)` es la API
    // soportada: delega en el worker y devuelve el hit real más cercano.
    const raycastModel = async (clientX: number, clientY: number): Promise<THREE.Vector3 | null> => {
      try {
        const result = await fragments.raycast({
          camera: world.camera.three,
          mouse: new THREE.Vector2(clientX, clientY),
          dom: canvas,
        });
        return result?.point ?? null;
      } catch (error) {
        console.error("Error al raycastear el modelo para colocar la etiqueta:", error);
        return null;
      }
    };

    viewport.addEventListener("click", (event: MouseEvent) => {
      if (this.activeMode !== "label") return;
      if ((event.target as HTMLElement).closest(".world-label")) return;
      console.log("[debug] label click at", event.clientX, event.clientY);
      raycastModel(event.clientX, event.clientY).then((point) => {
        console.log("[debug] label click raycast result", point);
        if (point) this.worldLabelTool.createAt(point);
      });
    });

    // Ícono fantasma que sigue el punto raycasteado bajo el cursor, para
    // mostrar dónde va a quedar la próxima etiqueta antes de hacer click.
    // El raycast es asíncrono (va al worker), así que se coalesce a un
    // máximo de un cálculo en vuelo por vez en vez de uno por evento.
    let pendingPreviewEvent: MouseEvent | null = null;
    let previewInFlight = false;
    const flushPreview = async () => {
      const event = pendingPreviewEvent;
      pendingPreviewEvent = null;
      if (!event || this.activeMode !== "label") return;
      if ((event.target as HTMLElement).closest(".world-label")) {
        this.worldLabelTool.previewAt(null);
        return;
      }
      previewInFlight = true;
      const point = await raycastModel(event.clientX, event.clientY);
      previewInFlight = false;
      if (this.activeMode !== "label") return;
      this.worldLabelTool.previewAt(point);
      // Si llegó un mousemove nuevo mientras este raycast estaba en vuelo, procesarlo ahora.
      if (pendingPreviewEvent) flushPreview();
    };
    viewport.addEventListener("pointermove", (event: MouseEvent) => {
      if (this.activeMode !== "label") return;
      pendingPreviewEvent = event;
      if (!previewInFlight) flushPreview();
    });
    viewport.addEventListener("pointerleave", () => {
      if (this.activeMode === "label") this.worldLabelTool.previewAt(null);
    });

    // En modo "measure", un click sobre un snap válido (vértice/borde/superficie,
    // según measurer.snappings) coloca el punto de medición en lugar de dejar
    // que camera-controls arranque el orbit; sin snap válido bajo el cursor el
    // evento se deja pasar intacto y la cámara orbita como siempre. `lastPick`
    // ya viene resuelto en background por el picker interno de Measurement (se
    // recalcula por RAF en cada frame en que el mouse se mueve), así que se
    // puede leer de forma síncrona justo al presionar, sin esperar un pick nuevo.
    viewport.addEventListener("pointerdown", (event: PointerEvent) => {
      if (event.button !== 0 || this.activeMode !== "measure") return;

      const pick = (this.measurer as any).lastPick;
      // `facePoints`/`faceIndices` vienen poblados en cualquier pick cercano a
      // una cara sin importar el modo de snap activo — para no "quedar pegado"
      // en superficie hay que exigir además que el snap resuelto para ESTE
      // pick sea efectivamente FACE (measurer.snappings solo trae una clase a
      // la vez, así que snappingClass refleja el modo realmente seleccionado).
      const hasFaceSnap = !!(
        pick && pick.snappingClass === FRAGS.SnappingClass.FACE && pick.facePoints && pick.faceIndices
      );
      const hasPointOrEdgeSnap = !hasFaceSnap && !!(pick && (pick.point || (pick.snappedEdgeP1 && pick.snappedEdgeP2)));
      if (!hasFaceSnap && !hasPointOrEdgeSnap) return;

      // camera-controls ya registró este pointerdown y arrancó su drag interno,
      // pero solo aplica la rotación en los próximos pointermove (releyendo
      // `enabled`/mouseButtons en cada uno) — deshabilitarlo acá alcanza para
      // que este gesto puntual no orbite, sin necesidad de interceptar el evento.
      const camera = world.camera as OBC.OrthoPerspectiveCamera;
      camera.setUserInput(false);
      if (hasFaceSnap) {
        measureFaceEdges(this.measurer, pick.facePoints, pick.faceIndices);
      } else {
        this.measurer.create();
      }
      window.addEventListener("pointerup", () => camera.setUserInput(true), { once: true });
    });

    window.addEventListener("keydown", (event) => {
      if (event.code !== "Delete" && event.code !== "Backspace") return;
      // No borrar mediciones/planos mientras el usuario escribe en un campo
      // de texto (p. ej. el formulario BCF).
      if (isEditableTarget(event)) return;
      if (this.activeMode === "measure") {
        this.measurer.delete();
      } else if (this.activeMode === "section") {
        this.sectionTool.clipper.delete(world);
        this.sectionTool.rebuildSectionFills();
      }
    });
  }
}
