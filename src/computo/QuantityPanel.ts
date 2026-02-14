// src/computo/QuantityPanel.ts
import * as BUI from "@thatopen/ui";
import { ResumenTipo } from "./tipos";

export function createQuantityPanel(resumen: ResumenTipo[]) {
  // Función para exportar a CSV
  function exportToCSV() {
    const header = ["Tipo", "Unidades", "Área (m²)", "Volumen (m³)"];
    const rows = resumen
      .filter(r => r.tipo.toLowerCase().includes("wall") || r.tipo.toLowerCase().includes("slab") || r.tipo.toLowerCase().includes("floor"))
      .map(r => [r.tipo, r.cantidad, r.areaTotal.toFixed(2), r.volumenTotal.toFixed(2)]);
    const csvContent = [header, ...rows].map(e => e.join(",")).join("\n");
    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "cantidades.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  // Función para exportar a JSON
  function exportToJSON() {
    const filtered = resumen.filter(r => r.tipo.toLowerCase().includes("wall") || r.tipo.toLowerCase().includes("slab") || r.tipo.toLowerCase().includes("floor"));
    const jsonContent = JSON.stringify(filtered, null, 2);
    const blob = new Blob([jsonContent], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "cantidades.json";
    a.click();
    URL.revokeObjectURL(url);
  }

  return BUI.Component.create<BUI.PanelSection>(() => {
    return BUI.html`
      <bim-panel active label="Cómputo de Cantidades" class="options-menu options-menu-visible">
        <bim-panel-section label="Resumen de Elementos">
          <table style="width:100%;color:#fff;font-size:14px;">
            <thead>
              <tr>
                <th style="text-align:left;">Tipo</th>
                <th>Unidades</th>
                <th>Área (m²)</th>
                <th>Volumen (m³)</th>
              </tr>
            </thead>
            <tbody>
              ${resumen
                .filter(r => r.tipo.toLowerCase().includes("wall") || r.tipo.toLowerCase().includes("slab") || r.tipo.toLowerCase().includes("floor"))
                .map(r => BUI.html`
                  <tr>
                    <td>${r.tipo}</td>
                    <td>${r.cantidad}</td>
                    <td>${r.areaTotal.toFixed(2)}</td>
                    <td>${r.volumenTotal.toFixed(2)}</td>
                  </tr>
                `)}
            </tbody>
          </table>
          <div style="margin-top:12px;display:flex;gap:8px;">
            <bim-button label="Exportar CSV" @click=${exportToCSV}></bim-button>
            <bim-button label="Exportar JSON" @click=${exportToJSON}></bim-button>
          </div>
        </bim-panel-section>
      </bim-panel>
    `;
  });
}
