import * as OBF from "@thatopen/components-front";
import * as OBC from "@thatopen/components";
import * as FRAGS from "@thatopen/fragments";
import * as THREE from "three";
import type { SectionTool } from "./section-tool";
import { measureFaceEdges } from "./measurement-tool";
import type * as BUI from "@thatopen/ui";
import type { ToolOptionsView } from "../ui/tool-options-panel";

export type ToolMode = "navigate" | "measure" | "section" | "properties";

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
  propertiesBtnEl: BUI.Button | null = null;

  private measurer: OBF.LengthMeasurement;
  private highlighter: OBF.Highlighter;
  private hoverer: OBF.Hoverer;
  private sectionTool: SectionTool;
  private postproduction: { enabled: boolean } | null = null;
  private toolOptionsPanel: ToolOptionsPanelLike | null = null;

  constructor(
    measurer: OBF.LengthMeasurement,
    highlighter: OBF.Highlighter,
    hoverer: OBF.Hoverer,
    sectionTool: SectionTool,
  ) {
    this.measurer    = measurer;
    this.highlighter = highlighter;
    this.hoverer     = hoverer;
    this.sectionTool = sectionTool;
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

    const modeButtons: Record<ToolMode, BUI.Button | null> = {
      navigate:   this.navigateBtnEl,
      measure:    this.measureBtnEl,
      section:    this.sectionBtnEl,
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

  bindViewportEvents(viewport: HTMLElement, world: OBC.World): void {
    viewport.addEventListener("dblclick", () => {
      if (this.activeMode === "section") {
        this.sectionTool.clipper.create(world);
        this.sectionTool.rebuildSectionFills();
      }
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
