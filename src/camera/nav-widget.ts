import * as OBC from "@thatopen/components";
import * as BUI from "@thatopen/ui";
import { createViewCube, CUBE_DEFAULT_SIZE } from "./view-cube";
import { createAxisGizmo, GIZMO_DEFAULT_SIZE } from "./axis-gizmo";

type NavWidgetMode = "cube" | "gizmo";

const MODE_STORAGE_KEY  = "bim-nav-widget-mode";
const SCALE_STORAGE_KEY = "bim-nav-widget-scale";

const MIN_SCALE_PCT = 70;
const MAX_SCALE_PCT = 160;

function readStoredScale(): number {
  const raw = Number(localStorage.getItem(SCALE_STORAGE_KEY));
  return Number.isFinite(raw) && raw >= MIN_SCALE_PCT / 100 && raw <= MAX_SCALE_PCT / 100 ? raw : 1;
}

/**
 * Widget de navegación 3D en la esquina del viewport: muestra un cubo con
 * caras rotuladas (TOP/FRONT/...) o un gizmo de ejes tipo Blender. Un botón
 * abre un menú desplegable (bim-context-menu) con la opción de alternar
 * entre ambos y un slider para achicar/agrandar el widget. Ambos disparan
 * el mismo snap de cámara a vista ortogonal al hacer click, y comparten el
 * mismo enganche de orientación (`ref.el.updateOrientation()`) usado por el
 * loop de render.
 */
export function createNavWidget(
  viewport: HTMLElement,
  world: OBC.World,
  fragments: OBC.FragmentsManager,
  ref: { el: any },
): void {
  let scale: number = readStoredScale();

  const cube  = createViewCube(world, fragments, Math.round(CUBE_DEFAULT_SIZE * scale));
  const gizmo = createAxisGizmo(world, fragments, Math.round(GIZMO_DEFAULT_SIZE * scale));

  let mode: NavWidgetMode = localStorage.getItem(MODE_STORAGE_KEY) === "gizmo" ? "gizmo" : "cube";

  const applyMode = () => {
    cube.remove();
    gizmo.remove();
    ref.el = mode === "cube" ? cube : gizmo;
    viewport.append(ref.el);
    ref.el.updateOrientation();
  };

  const applyScale = () => {
    cube.setSize(Math.round(CUBE_DEFAULT_SIZE * scale));
    gizmo.setSize(Math.round(GIZMO_DEFAULT_SIZE * scale));
  };

  let modeButtonEl: BUI.Button | null = null;

  const updateModeButton = () => {
    if (!modeButtonEl) return;
    const switchingToGizmo = mode === "cube";
    modeButtonEl.label = switchingToGizmo ? "Ver gizmo" : "Ver cubo";
    modeButtonEl.icon  = switchingToGizmo ? "mdi:axis-arrow" : "mdi:cube-outline";
  };

  // El binding de atributo `value=${...}` de lit-html no llega a invocar el
  // setter interno del slider (su `value` es un accessor propio, no una
  // @property reflejada). Por eso el tamaño se fija/lee siempre a través de
  // la propiedad JS del elemento capturado con BUI.ref, nunca vía atributo.
  let sliderEl: (HTMLElement & { min: number; max: number; step: number; value: number; valueLabelDisplay: string }) | null = null;

  const menu = BUI.Component.create<BUI.Button>(() => {
    return BUI.html`
      <bim-button class="nav-widget-menu-trigger" icon="mdi:axis-arrow">
        <bim-tooltip>
          <div style="font-weight:600;">Navegación 3D</div>
        </bim-tooltip>
        <bim-context-menu class="nav-widget-menu-panel">
          <bim-button
            ${BUI.ref((el: Element | undefined) => { modeButtonEl = (el as BUI.Button) ?? null; updateModeButton(); })}
            @click=${() => {
              mode = mode === "cube" ? "gizmo" : "cube";
              localStorage.setItem(MODE_STORAGE_KEY, mode);
              applyMode();
              updateModeButton();
            }}>
          </bim-button>
          <span class="nav-widget-menu-size-label">Tamaño</span>
          <bim-slider
            ${BUI.ref((el: Element | undefined) => {
              sliderEl = (el as typeof sliderEl) ?? null;
              if (!sliderEl) return;
              sliderEl.min   = MIN_SCALE_PCT;
              sliderEl.max   = MAX_SCALE_PCT;
              sliderEl.step  = 5;
              sliderEl.value = Math.round(scale * 100);
              sliderEl.valueLabelDisplay = "off";
            })}
            @change=${() => {
              if (!sliderEl) return;
              scale = sliderEl.value / 100;
              localStorage.setItem(SCALE_STORAGE_KEY, String(scale));
              applyScale();
            }}>
          </bim-slider>
        </bim-context-menu>
      </bim-button>
    `;
  });

  applyMode();
  updateModeButton();
  viewport.append(menu);
}
