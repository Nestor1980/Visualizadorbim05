import * as OBF from "@thatopen/components-front";
import * as OBC from "@thatopen/components";
import * as THREE from "three";
import type { SectionTool } from "./section-tool";
import type * as BUI from "@thatopen/ui";
import type { RightPanelView } from "../ui/right-panel/index";

export type ToolMode = "navigate" | "measure" | "section" | "properties";

interface RightPanelLike {
  setView: (view: RightPanelView) => void;
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
  private rightPanel: RightPanelLike | null = null;

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

  setRightPanel(rightPanel: RightPanelLike): void {
    this.rightPanel = rightPanel;
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

    const view: RightPanelView =
      mode === "measure"    ? "measure" :
      mode === "section"    ? "section" :
      mode === "properties" ? "properties" :
      "controls";
    this.rightPanel?.setView(view);
  }

  bindViewportEvents(viewport: HTMLElement, world: OBC.World): void {
    viewport.addEventListener("dblclick", () => {
      if (this.activeMode === "measure") {
        this.measurer.create();
      } else if (this.activeMode === "section") {
        this.sectionTool.clipper.create(world);
        this.sectionTool.rebuildSectionFills();
      }
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
