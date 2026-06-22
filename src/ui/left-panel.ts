import * as THREE from "three";
import * as OBC from "@thatopen/components";
import * as OBF from "@thatopen/components-front";
import * as CUI from "@thatopen/ui-obc";
import * as BUI from "@thatopen/ui";
import type { SectionTool } from "../tools/section-tool";

export function createLeftPanel(
  components: OBC.Components,
  fragments: OBC.FragmentsManager,
  ifcLoader: OBC.IfcLoader,
  measurer: OBF.LengthMeasurement,
  sectionTool: SectionTool,
  postproduction: OBF.Postproduction,
  sunLight: THREE.DirectionalLight,
  threeRenderer: THREE.WebGLRenderer,
  onModelLoaded: (model: any) => Promise<void>,
): BUI.Panel {
  const [modelsList] = CUI.tables.modelsList({
    components, metaDataTags: ["schema"], actions: { download: false },
  });

  const loadIfcBtn = BUI.Component.create<BUI.Button>(() => {
    const onClick = async () => {
      const input    = document.createElement("input");
      input.type     = "file";
      input.accept   = ".ifc";
      input.onchange = async () => {
        const file = input.files?.[0];
        if (!file) return;
        const model = await ifcLoader.load(new Uint8Array(await file.arrayBuffer()), true, file.name, {
          processData: { progressCallback: (p) => console.log("Progreso:", p) },
        });
        await onModelLoaded(model);
      };
      input.click();
    };
    return BUI.html`<bim-button label="Cargar IFC" icon="mage:box-3d-fill" @click=${onClick}></bim-button>`;
  });

  const downloadFragments = async () => {
    const [model] = fragments.list.values();
    if (!model) return;
    const file = new File([await model.getBuffer(false)], "modelo.frag");
    const link = document.createElement("a");
    link.href = URL.createObjectURL(file);
    link.download = file.name;
    link.click();
    URL.revokeObjectURL(link.href);
  };

  const getAllMeasurementValues = (): number[] => {
    const lengths: number[] = [];
    for (const line of measurer.list) lengths.push(line.value);
    return lengths;
  };

  const panel = BUI.Component.create<BUI.PanelSection>(() => {
    return BUI.html`
      <bim-panel active label="Visualizador BIM" class="options-menu">

        <bim-panel-section label="Modelos IFC" icon="mage:box-3d-fill">
          ${loadIfcBtn}
          ${modelsList}
        </bim-panel-section>

        <bim-panel-section label="Controles" icon="solar:ruler-bold">
          <bim-label>Doble click: crear medición / plano de sección</bim-label>
          <bim-label>Delete / Backspace: borrar</bim-label>
          <bim-button label="Descargar .frag" @click=${() => downloadFragments()}></bim-button>
        </bim-panel-section>

        <bim-panel-section label="Medidor" icon="solar:ruler-cross-pen-bold">
          <bim-checkbox checked label="Habilitado"
            @change="${({ target }: { target: BUI.Checkbox }) => { measurer.enabled = target.value; }}">
          </bim-checkbox>
          <bim-checkbox checked label="Visible"
            @change="${({ target }: { target: BUI.Checkbox }) => { measurer.visible = target.value; }}">
          </bim-checkbox>
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
          <bim-button label="Borrar todo" @click=${() => measurer.list.clear()}></bim-button>
        </bim-panel-section>

        <bim-panel-section label="Sección" icon="material-symbols:cut">
          <bim-number-input label="Tamaño del plano"
            value="5" min="1" max="30" step="1" suffix="m"
            @change="${({ target }: { target: BUI.NumberInput }) => { sectionTool.clipper.size = target.value; }}">
          </bim-number-input>
          <bim-checkbox checked label="Mostrar relleno en sección"
            @change="${({ target }: { target: BUI.Checkbox }) => {
              sectionTool.sectionFillGroup.visible = target.value && sectionTool.clipper.enabled;
            }}">
          </bim-checkbox>
          <bim-button label="Borrar todos los planos" icon="material-symbols:delete-outline"
            @click=${() => sectionTool.clipper.deleteAll()}>
          </bim-button>
        </bim-panel-section>

        <bim-panel-section label="Renderizado" icon="material-symbols:photo-camera">
          <bim-checkbox checked label="Postproducción"
            @change="${({ target }: { target: BUI.Checkbox }) => { postproduction.enabled = target.value; }}">
          </bim-checkbox>
          <bim-checkbox checked label="Outlines (bordes)"
            @change="${({ target }: { target: BUI.Checkbox }) => { postproduction.outlinesEnabled = target.value; }}">
          </bim-checkbox>
          <bim-checkbox checked label="Gloss (brillo)"
            @change="${({ target }: { target: BUI.Checkbox }) => { postproduction.glossEnabled = target.value; }}">
          </bim-checkbox>
          <bim-checkbox checked label="SMAA (antialiasing)"
            @change="${({ target }: { target: BUI.Checkbox }) => { postproduction.smaaEnabled = target.value; }}">
          </bim-checkbox>
          <bim-dropdown label="Estilo" required
            @change="${({ target }: { target: BUI.Dropdown }) => {
              postproduction.style = target.value[0] as OBF.PostproductionAspect;
            }}">
            <bim-option label="Color"                  value="${OBF.PostproductionAspect.COLOR}"></bim-option>
            <bim-option label="Pen"                    value="${OBF.PostproductionAspect.PEN}"></bim-option>
            <bim-option label="Pen + Sombras"          value="${OBF.PostproductionAspect.PEN_SHADOWS}"></bim-option>
            <bim-option checked label="Color + Pen"    value="${OBF.PostproductionAspect.COLOR_PEN}"></bim-option>
            <bim-option label="Color + Sombras"        value="${OBF.PostproductionAspect.COLOR_SHADOWS}"></bim-option>
            <bim-option label="Color + Pen + Sombras"  value="${OBF.PostproductionAspect.COLOR_PEN_SHADOWS}"></bim-option>
          </bim-dropdown>
          <bim-number-input label="Ancho de bordes" value="1.0" min="0.5" max="5" step="0.1"
            @change="${({ target }: { target: BUI.NumberInput }) => { postproduction.edgesPass.width = target.value; }}">
          </bim-number-input>
          <bim-number-input label="Intensidad AO" value="2.5" min="0" max="10" step="0.1"
            @change="${({ target }: { target: BUI.NumberInput }) => {
              postproduction.aoPass.updateGtaoMaterial({ scale: target.value });
            }}">
          </bim-number-input>
          <bim-checkbox checked label="Sombras Three.js"
            @change="${({ target }: { target: BUI.Checkbox }) => {
              threeRenderer.shadowMap.enabled = target.value;
              sunLight.castShadow             = target.value;
            }}">
          </bim-checkbox>
          <bim-number-input label="Intensidad solar" value="1.0" min="0" max="5" step="0.1"
            @change="${({ target }: { target: BUI.NumberInput }) => { sunLight.intensity = target.value; }}">
          </bim-number-input>
        </bim-panel-section>

      </bim-panel>
    `;
  });

  // Dynamic measurement list section
  measurer.list.onItemAdded.add(() => {
    const existing = (panel as any).querySelector("bim-panel-section[label='Mediciones']");
    if (existing) existing.remove();
    const section = document.createElement("bim-panel-section");
    section.setAttribute("label", "Mediciones");
    const values = getAllMeasurementValues();
    if (values.length === 0) {
      const lbl = document.createElement("bim-label");
      lbl.textContent = "No hay mediciones";
      section.append(lbl);
    } else {
      values.forEach((v, i) => {
        const lbl = document.createElement("bim-label");
        lbl.textContent = `Medición ${i + 1}: ${v.toFixed(2)} m`;
        section.append(lbl);
      });
    }
    (panel as any).append(section);
  });

  return panel as unknown as BUI.Panel;
}
