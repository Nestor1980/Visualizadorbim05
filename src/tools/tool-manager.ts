import * as OBF from "@thatopen/components-front";
import * as OBC from "@thatopen/components";
import * as THREE from "three";
import type { SectionTool } from "./section-tool";
import type { WorldLabelTool } from "./world-label-tool";
import type { DrawTool } from "./draw-tool";
import type { CotaTool } from "./cota-tool";
import type { ComputoTool } from "./computo-tool";
import type * as BUI from "@thatopen/ui";
import type { ToolOptionsView } from "../ui/tool-options-panel";
import type { SelectionManager } from "../selection/selection-manager";
import { RegionSelect, selectItemsInRegion } from "../selection/region-select";

// "Navegar" absorbió a "Propiedades": seleccionar un elemento en este modo
// muestra su información en la solapa "Información" del panel dinámico.
export type ToolMode = "navigate" | "cota" | "section" | "label" | "draw" | "computo";

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
  cotaBtnEl: BUI.Button | null = null;
  sectionBtnEl: BUI.Button | null = null;
  labelBtnEl: BUI.Button | null = null;
  drawBtnEl: BUI.Button | null = null;
  computoBtnEl: BUI.Button | null = null;

  private highlighter: OBF.Highlighter;
  private hoverer: OBF.Hoverer;
  private sectionTool: SectionTool;
  private worldLabelTool: WorldLabelTool;
  private drawTool: DrawTool;
  private cotaTool: CotaTool;
  private computoTool: ComputoTool;
  private postproduction: { enabled: boolean } | null = null;
  private toolOptionsPanel: ToolOptionsPanelLike | null = null;
  private camera: OBC.OrthoPerspectiveCamera | null = null;

  constructor(
    highlighter: OBF.Highlighter,
    hoverer: OBF.Hoverer,
    sectionTool: SectionTool,
    worldLabelTool: WorldLabelTool,
    drawTool: DrawTool,
    cotaTool: CotaTool,
    computoTool: ComputoTool,
  ) {
    this.highlighter   = highlighter;
    this.hoverer       = hoverer;
    this.sectionTool   = sectionTool;
    this.worldLabelTool = worldLabelTool;
    this.drawTool       = drawTool;
    this.cotaTool       = cotaTool;
    this.computoTool    = computoTool;
  }

  setPostproduction(pp: { enabled: boolean }): void {
    this.postproduction = pp;
  }

  setToolOptionsPanel(toolOptionsPanel: ToolOptionsPanelLike): void {
    this.toolOptionsPanel = toolOptionsPanel;
  }

  setMode(mode: ToolMode): void {
    this.activeMode = mode;

    this.highlighter.enabled                   = false;
    this.hoverer.enabled                       = false;
    this.sectionTool.clipper.enabled           = false;
    this.sectionTool.sectionFillGroup.visible  = false;
    if (mode !== "section") this.sectionTool.hidePreview();

    if (mode === "navigate" || mode === "computo") {
      this.highlighter.enabled = true;
      this.hoverer.enabled     = true;
    } else if (mode === "section") {
      this.sectionTool.clipper.enabled          = true;
      this.sectionTool.sectionFillGroup.visible = true;
    }
    if (mode !== "label") this.worldLabelTool.previewAt(null);

    if (mode === "draw") this.drawTool.activate();
    else if (this.drawTool.active) this.drawTool.deactivate();

    if (mode === "cota") this.cotaTool.activate();
    else if (this.cotaTool.active) this.cotaTool.deactivate();

    if (mode === "computo") this.computoTool.activate();
    else if (this.computoTool.active) this.computoTool.deactivate();

    const modeButtons: Record<ToolMode, BUI.Button | null> = {
      navigate:   this.navigateBtnEl,
      cota:       this.cotaBtnEl,
      section:    this.sectionBtnEl,
      label:      this.labelBtnEl,
      draw:       this.drawBtnEl,
      computo:    this.computoBtnEl,
    };
    for (const [btnMode, btn] of Object.entries(modeButtons)) {
      if (btn) btn.active = btnMode === mode;
    }

    const view: ToolOptionsView =
      mode === "cota"     ? "cota" :
      mode === "section"  ? "section" :
      mode === "draw"     ? "draw" :
      mode === "navigate" ? "selection" :
      mode === "computo"  ? "computo" :
      null;
    this.toolOptionsPanel?.setView(view);
  }

  bindViewportEvents(
    viewport: HTMLElement,
    world: OBC.World,
    fragments: OBC.FragmentsManager,
    canvas: HTMLCanvasElement,
    components: OBC.Components,
    selectionManager: SelectionManager,
  ): void {
    this.camera = world.camera as OBC.OrthoPerspectiveCamera;

    // Arrastrar el gizmo de un plano ya creado también termina en un mouseup
    // sobre el viewport, que el navegador sigue con un evento "click" nativo
    // aunque hubo movimiento de por medio. Sin este flag ese click se leía
    // como "crear plano nuevo" en el punto donde soltaste el arrastre.
    let suppressNextSectionClick = false;
    let isDraggingSectionPlane   = false;
    this.sectionTool.clipper.onBeforeDrag.add(() => {
      isDraggingSectionPlane = true;
      this.sectionTool.hidePreview();
    });
    this.sectionTool.clipper.onAfterDrag.add(() => {
      isDraggingSectionPlane = false;
      suppressNextSectionClick = true;
    });

    viewport.addEventListener("click", () => {
      if (this.activeMode === "section") {
        if (suppressNextSectionClick) {
          suppressNextSectionClick = false;
          return;
        }
        this.sectionTool.clipper.create(world);
        this.sectionTool.rebuildSectionFills();
      }
    });

    // Disco fantasma que anticipa, bajo el cursor, dónde quedaría el próximo
    // plano de corte. El raycast es asíncrono, así que se coalesce a un
    // máximo de un cálculo en vuelo por vez (igual que el preview de label).
    let sectionPreviewPending  = false;
    let sectionPreviewInFlight = false;
    const flushSectionPreview = async () => {
      if (this.activeMode !== "section" || isDraggingSectionPlane) {
        sectionPreviewPending = false;
        return;
      }
      sectionPreviewInFlight = true;
      await this.sectionTool.updatePreview();
      sectionPreviewInFlight = false;
      if (sectionPreviewPending) {
        sectionPreviewPending = false;
        flushSectionPreview();
      }
    };
    viewport.addEventListener("pointermove", () => {
      if (this.activeMode !== "section" || isDraggingSectionPlane) return;
      if (sectionPreviewInFlight) {
        sectionPreviewPending = true;
        return;
      }
      flushSectionPreview();
    });
    viewport.addEventListener("pointerleave", () => {
      if (this.activeMode === "section") this.sectionTool.hidePreview();
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

    // Modo "draw": arrastrar dibuja un trazo a mano alzada sobre el plano fijado
    // al entrar al modo (perpendicular a cámara, por el origen). Un pointerdown
    // sobre un trazo ya existente lo selecciona en vez de empezar uno nuevo; uno
    // sobre vacío deselecciona y arranca el trazo. Fuera de un arrastre de
    // dibujo la cámara sigue navegable con normalidad (zoom, pan, orbit por
    // botón derecho) — solo se congela mientras dura el trazo en sí.
    //
    // Este listener se registra en fase de CAPTURA (a diferencia del resto de
    // este archivo) porque camera-controls decide la acción a aplicar (orbit)
    // apenas ve el pointerdown sobre el propio canvas, en su fase de burbuja —
    // que corre antes que un listener nuestro en "viewport" (un ancestro) si
    // este fuera también de burbuja. Capturando en el ancestro nos adelantamos:
    // deshabilitar la cámara acá SÍ llega a tiempo para este gesto.
    let isDrawingStroke = false;
    viewport.addEventListener("pointerdown", (event: PointerEvent) => {
      if (event.button !== 0 || this.activeMode !== "draw") return;
      // La toolbar y el panel de opciones flotan dentro de "viewport" (para
      // posicionarse por CSS sobre el canvas), así que un click en esos
      // controles también pasa por acá — sin este filtro, clickear "Navegar"
      // deseleccionaba el trazo activo y arrancaba un trazo espurio.
      if (event.target !== canvas) return;

      const hitId = this.drawTool.pickStrokeAt(event.clientX, event.clientY);
      if (hitId) {
        this.drawTool.select(hitId);
        return;
      }
      this.drawTool.deselect();

      this.camera?.setUserInput(false);
      isDrawingStroke = true;
      this.drawTool.beginStroke(event.clientX, event.clientY);

      window.addEventListener("pointerup", () => {
        isDrawingStroke = false;
        this.camera?.setUserInput(true);
        this.drawTool.endStroke();
      }, { once: true });
    }, { capture: true });
    viewport.addEventListener("pointermove", (event: PointerEvent) => {
      if (this.activeMode !== "draw" || !isDrawingStroke) return;
      this.drawTool.extendStroke(event.clientX, event.clientY);
    });

    // Modo "navigate" con selección por región (caja / cuerda): arrastrar con
    // el botón izquierdo dibuja el rectángulo/contorno y, al soltar, selecciona
    // todos los elementos visibles que caen dentro. Shift o Ctrl durante el
    // gesto suman a la selección actual en vez de reemplazarla.
    //
    // Igual que el modo dibujo, el listener va en fase de CAPTURA para
    // adelantarse a camera-controls y congelar la cámara a tiempo. Hoverer y
    // highlighter quedan apagados durante TODO el gesto —incluido el mouseup
    // del canvas que el Highlighter escucha para su pick simple— y se
    // rehabilitan recién después de calcular la región, así el final del
    // arrastre no selecciona además lo que haya bajo el cursor.
    const regionSelect = new RegionSelect(viewport);
    viewport.addEventListener("pointerdown", (event: PointerEvent) => {
      if (event.button !== 0 || this.activeMode !== "navigate") return;
      if (selectionManager.selectionMode === "click") return;
      if (event.target !== canvas) return;

      this.camera?.setUserInput(false);
      this.hoverer.enabled = false;
      this.highlighter.enabled = false;
      regionSelect.begin(selectionManager.selectionMode, event.clientX, event.clientY);

      const restoreInteractions = () => {
        this.camera?.setUserInput(true);
        this.hoverer.enabled = true;
        this.highlighter.enabled = true;
      };
      const onMove = (moveEvent: PointerEvent) => {
        regionSelect.update(moveEvent.clientX, moveEvent.clientY);
      };
      const teardown = () => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        window.removeEventListener("pointercancel", onCancel);
      };
      const onCancel = () => {
        teardown();
        regionSelect.cancel();
        restoreInteractions();
      };
      const onUp = async (upEvent: PointerEvent) => {
        teardown();
        this.camera?.setUserInput(true);
        const region = regionSelect.end();
        const additive = upEvent.shiftKey || upEvent.ctrlKey;
        try {
          const modelIdMap = region
            ? await selectItemsInRegion(region, world, fragments, canvas)
            : {};
          // Recién ahora: el mouseup/click del canvas ya pasó con el
          // Highlighter deshabilitado, así que no hubo pick espurio.
          this.hoverer.enabled = true;
          this.highlighter.enabled = true;
          if (Object.keys(modelIdMap).length > 0) {
            await this.highlighter.highlightByID("select", modelIdMap, !additive);
          } else if (!additive) {
            await this.highlighter.clear("select");
          }
        } catch (error) {
          restoreInteractions();
          console.error("Error al calcular la selección por región:", error);
        }
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
      window.addEventListener("pointercancel", onCancel);
    }, { capture: true });

    // Botón derecho: con una tool activa (distinta de "navigate"), un click
    // derecho simple la cierra y vuelve a modo selección/navegación. Un
    // arrastre con el botón derecho sigue paneando la cámara con normalidad
    // (camera-controls ya hace preventDefault del contextmenu nativo), así
    // que solo se interpreta como "cerrar tool" si el puntero no se movió.
    let rightDownPos: { x: number; y: number } | null = null;
    viewport.addEventListener("pointerdown", (event: PointerEvent) => {
      if (event.button === 2) rightDownPos = { x: event.clientX, y: event.clientY };
    });
    window.addEventListener("pointerup", (event: PointerEvent) => {
      if (event.button !== 2 || !rightDownPos) return;
      const { x, y } = rightDownPos;
      rightDownPos = null;
      const moved = Math.hypot(event.clientX - x, event.clientY - y) > 4;
      if (!moved && this.activeMode !== "navigate") this.setMode("navigate");
    });

    window.addEventListener("keydown", (event) => {
      // No interceptar atajos mientras el usuario escribe en un campo de
      // texto (p. ej. el formulario BCF).
      if (isEditableTarget(event)) return;

      if (event.code === "Delete" || event.code === "Backspace") {
        if (this.activeMode === "draw") {
          this.drawTool.deleteSelected();
        } else if (this.activeMode === "section") {
          this.sectionTool.clipper.delete(world);
          this.sectionTool.rebuildSectionFills();
        }
        return;
      }

      if (event.code === "KeyF") {
        this.focusOnSelection(components, selectionManager).catch(console.error);
      }
    });
  }

  /**
   * "F" para centrar el pivote de órbita sobre la selección actual, sea cual
   * sea su tipo: trazo de dibujo, etiqueta o elemento BIM. Se consulta cada
   * herramienta en orden porque cada una guarda su propia selección de forma
   * independiente (no hay un `SelectionManager` unificado); en la práctica
   * solo una tiene algo seleccionado a la vez, ya que cambiar de modo
   * deselecciona a las demás. No hace zoom/dolly ni cambia el ángulo: traslada
   * cámara y target por el mismo delta (ver `centerOrbitOn`), así la nueva
   * selección queda centrada en pantalla sin girar.
   */
  private async focusOnSelection(components: OBC.Components, selectionManager: SelectionManager): Promise<void> {
    if (!this.camera?.controls) return;

    const stroke = this.drawTool.getSelected();
    if (stroke && stroke.points.length > 0) {
      const box = new THREE.Box3().setFromPoints(stroke.points);
      await this.centerOrbitOn(box.getCenter(new THREE.Vector3()));
      return;
    }

    const label = this.worldLabelTool.getSelected();
    if (label) {
      await this.centerOrbitOn(label.mark.three.position);
      return;
    }

    const modelIdMap = selectionManager.lastModelIdMap;
    const hasSelection = Object.values(modelIdMap).some((ids) => ids.size > 0);
    if (!hasSelection) return;

    const bboxer = components.get(OBC.BoundingBoxer);
    bboxer.list.clear();
    await bboxer.addFromModelIdMap(modelIdMap);
    const box = bboxer.get();
    bboxer.list.clear();
    if (!box.isEmpty()) await this.centerOrbitOn(box.getCenter(new THREE.Vector3()));
  }

  /** Traslada cámara y target por el mismo delta hacia `point`: mantiene
   *  intactos el ángulo y la distancia actuales (a diferencia de
   *  `controls.setTarget`, que fija la posición y reapunta hacia el nuevo
   *  target — si éste queda lejos de la dirección de vista actual, el giro
   *  resultante puede ser enorme). Como el target viejo siempre está
   *  centrado en pantalla, el nuevo punto queda centrado también. */
  private async centerOrbitOn(point: THREE.Vector3): Promise<void> {
    const controls = this.camera!.controls;
    const target   = controls.getTarget(new THREE.Vector3());
    const position = controls.getPosition(new THREE.Vector3());
    const delta    = point.clone().sub(target);
    const newPosition = position.add(delta);
    await controls.setLookAt(
      newPosition.x, newPosition.y, newPosition.z,
      point.x, point.y, point.z,
      true,
    );
  }
}
