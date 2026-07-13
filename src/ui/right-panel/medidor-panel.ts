import * as THREE from "three";
import * as FRAGS from "@thatopen/fragments";
import * as OBF from "@thatopen/components-front";
import * as BUI from "@thatopen/ui";
import type { WallOcclusionControl, MeasurementSelectionControl } from "../../tools/measurement-tool";

export interface MedidorPanel {
  element: HTMLElement;
}

function makeSnapModeBtn(icon: string, label: string): HTMLButtonElement {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "tree-view-btn";
  const ico = document.createElement("bim-icon") as any;
  ico.icon = icon;
  ico.style.fontSize = "13px";
  const lbl = document.createElement("span");
  lbl.textContent = label;
  btn.append(ico, lbl);
  return btn;
}

/** Formatea un vértice de cota como "x, y, z" con 2 decimales. */
function formatPoint(point: THREE.Vector3): string {
  return `${point.x.toFixed(2)}, ${point.y.toFixed(2)}, ${point.z.toFixed(2)}`;
}

export function createMedidorPanel(
  measurer: OBF.LengthMeasurement,
  wallOcclusion: WallOcclusionControl,
  measurementSelection: MeasurementSelectionControl,
): MedidorPanel {
  // — Toggle "Agregar" / "Editar": decide qué hace un click sobre la
  // geometría en modo medidor (crear una cota nueva o seleccionar una
  // existente). El modo de snap (vértice/borde/superficie) solo aplica
  // mientras se agrega, así que se oculta en modo edición.
  const subModeBar = document.createElement("div");
  subModeBar.className = "tree-switcher";
  const btnAddMode    = makeSnapModeBtn("mdi:plus-circle-outline", "Agregar");
  const btnSelectMode = makeSnapModeBtn("mdi:cursor-default-click-outline", "Editar");
  subModeBar.append(btnAddMode, btnSelectMode);

  const snapModeBar = document.createElement("div");
  snapModeBar.className = "tree-switcher";

  const btnVertex  = makeSnapModeBtn("mdi:vector-point", "Vértice");
  const btnEdge    = makeSnapModeBtn("mdi:vector-line", "Borde");
  const btnSurface = makeSnapModeBtn("mdi:vector-square", "Superficie");
  snapModeBar.append(btnVertex, btnEdge, btnSurface);

  let snapMode: "vertex" | "edge" | "surface" = "vertex";
  const updateSnapModeButtons = (): void => {
    btnVertex.classList.toggle("active", snapMode === "vertex");
    btnEdge.classList.toggle("active", snapMode === "edge");
    btnSurface.classList.toggle("active", snapMode === "surface");
  };
  const applySnapMode = (): void => {
    if (snapMode === "vertex") {
      measurer.mode      = "free";
      measurer.snappings = [FRAGS.SnappingClass.POINT];
    } else if (snapMode === "edge") {
      measurer.mode      = "edge";
      measurer.snappings = [FRAGS.SnappingClass.LINE];
    } else if (snapMode === "surface") {
      measurer.mode      = "free";
      measurer.snappings = [FRAGS.SnappingClass.FACE];
    }
    updateSnapModeButtons();
  };
  btnVertex.addEventListener("click", () => { snapMode = "vertex"; applySnapMode(); });
  btnEdge.addEventListener("click", () => { snapMode = "edge"; applySnapMode(); });
  btnSurface.addEventListener("click", () => { snapMode = "surface"; applySnapMode(); });
  applySnapMode();

  const updateSubModeButtons = (): void => {
    const mode = measurementSelection.getSubMode();
    btnAddMode.classList.toggle("active", mode === "add");
    btnSelectMode.classList.toggle("active", mode === "select");
    snapModeBar.style.display = mode === "add" ? "" : "none";
  };
  btnAddMode.addEventListener("click", () => measurementSelection.setSubMode("add"));
  btnSelectMode.addEventListener("click", () => measurementSelection.setSubMode("select"));
  measurementSelection.onSubModeChange.add(updateSubModeButtons);
  updateSubModeButtons();

  const settingsSection = BUI.Component.create<BUI.PanelSection>(() => {
    return BUI.html`
      <bim-panel-section label="Medidor" icon="solar:ruler-cross-pen-bold" .fixed=${false}>
        ${subModeBar}
        ${snapModeBar}
        <bim-color-input label="Color" color=#${measurer.linesMaterial.color.getHexString()}
          @input="${({ target }: { target: BUI.ColorInput }) => { measurer.color = new THREE.Color(target.color); }}">
        </bim-color-input>
        <bim-dropdown label="Unidades" required
          @change="${({ target }: { target: BUI.Dropdown }) => { const [units] = target.value; measurer.units = units; }}">
          ${measurer.unitsList.map((unit) => BUI.html`
            <bim-option label=${unit} value=${unit} ?checked=${unit === measurer.units}></bim-option>`)}
        </bim-dropdown>
        <bim-dropdown label="Precisión" required
          @change="${({ target }: { target: BUI.Dropdown }) => { const [rounding] = target.value; measurer.rounding = rounding; }}">
          <bim-option label="0" value=0></bim-option>
          <bim-option label="1" value=1></bim-option>
          <bim-option label="2" value=2 checked></bim-option>
          <bim-option label="3" value=3></bim-option>
          <bim-option label="4" value=4></bim-option>
        </bim-dropdown>
        <bim-checkbox ?checked=${wallOcclusion.isEnabled()} label="Oclusión de pared"
          @change="${({ target }: { target: BUI.Checkbox }) => { wallOcclusion.setEnabled(target.value); }}">
        </bim-checkbox>
      </bim-panel-section>
    `;
  });

  // — Propiedades de la cota seleccionada (modo "Editar") —
  const selectionSection = document.createElement("bim-panel-section") as any;
  selectionSection.label = "Cota seleccionada";
  selectionSection.icon  = "solar:ruler-cross-pen-linear";
  selectionSection.fixed = false;
  selectionSection.style.display = "none";

  const infoBody = document.createElement("div");
  infoBody.style.cssText = "display:flex;flex-direction:column;gap:4px;padding:2px 2px 8px;font-size:11px;";

  const deleteBtn = document.createElement("button");
  deleteBtn.type = "button";
  deleteBtn.className = "tree-view-btn";
  const deleteIcon = document.createElement("bim-icon") as any;
  deleteIcon.icon = "mdi:trash-can-outline";
  deleteIcon.style.fontSize = "13px";
  const deleteLabel = document.createElement("span");
  deleteLabel.textContent = "Eliminar cota";
  deleteBtn.append(deleteIcon, deleteLabel);
  deleteBtn.addEventListener("click", () => measurementSelection.deleteSelected());

  selectionSection.append(infoBody, deleteBtn);

  const renderSelection = (dim: OBF.DimensionLine | null): void => {
    if (!dim) {
      selectionSection.style.display = "none";
      return;
    }
    selectionSection.style.display = "";
    const { start, end } = dim.line;
    infoBody.innerHTML = `
      <div><strong>Longitud:</strong> ${dim.line.value} ${dim.units}</div>
      <div><strong>Inicio:</strong> ${formatPoint(start)}</div>
      <div><strong>Fin:</strong> ${formatPoint(end)}</div>
    `;
  };
  measurementSelection.onSelectionChange.add(renderSelection);
  renderSelection(measurementSelection.getSelected());

  const element = document.createElement("div");
  element.append(settingsSection, selectionSection);

  return { element };
}
