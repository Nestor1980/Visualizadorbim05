import * as OBF from "@thatopen/components-front";
import * as OBC from "@thatopen/components";
import * as THREE from "three";
import type { SectionTool } from "./section-tool";
import type * as BUI from "@thatopen/ui";

export type ToolMode = "navigate" | "measure" | "section";

const ACTIVE_STYLE = {
  background:   "var(--bim-ui_main-base)",
  borderRadius: "4px",
  outline:      "2px solid var(--bim-ui_accent-base, #6528d7)",
};
const RESET_STYLE = { background: "", borderRadius: "", outline: "" };

export class ToolManager {
  activeMode: ToolMode = "navigate";

  measureBtnEl: BUI.Button | null = null;
  sectionBtnEl: BUI.Button | null = null;

  private measurer: OBF.LengthMeasurement;
  private highlighter: OBF.Highlighter;
  private hoverer: OBF.Hoverer;
  private sectionTool: SectionTool;
  private postproduction: { enabled: boolean } | null = null;

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

  setMode(mode: ToolMode): void {
    this.activeMode = mode;

    this.measurer.enabled                      = false;
    this.highlighter.enabled                   = false;
    this.hoverer.enabled                       = false;
    this.sectionTool.clipper.enabled           = false;
    this.sectionTool.sectionFillGroup.visible  = false;

    if (mode === "navigate") {
      this.highlighter.enabled = true;
      this.hoverer.enabled     = true;
    } else if (mode === "measure") {
      this.measurer.enabled = true;
    } else if (mode === "section") {
      this.sectionTool.clipper.enabled          = true;
      this.sectionTool.sectionFillGroup.visible = true;
    }

    [this.measureBtnEl, this.sectionBtnEl].forEach((btn) => {
      if (btn) Object.assign(btn.style, RESET_STYLE);
    });
    if (mode === "measure" && this.measureBtnEl)
      Object.assign(this.measureBtnEl.style, ACTIVE_STYLE);
    if (mode === "section" && this.sectionBtnEl)
      Object.assign(this.sectionBtnEl.style, ACTIVE_STYLE);
  }

  bindViewportEvents(viewport: HTMLElement, world: OBC.World): void {
    viewport.ondblclick = () => {
      if (this.activeMode === "measure") {
        this.measurer.create();
      } else if (this.activeMode === "section") {
        this.sectionTool.clipper.create(world);
        this.sectionTool.rebuildSectionFills();
      }
    };

    window.onkeydown = (event) => {
      if (event.code === "Delete" || event.code === "Backspace") {
        if (this.activeMode === "measure") {
          this.measurer.delete();
        } else if (this.activeMode === "section") {
          this.sectionTool.clipper.delete(world);
          this.sectionTool.rebuildSectionFills();
        }
      }
    };
  }
}
