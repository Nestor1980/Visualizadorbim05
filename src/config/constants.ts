import * as THREE from "three";

export const IFC_FALLBACK_COLORS: Record<
  string,
  { hex: number; opacity?: number; transparent?: boolean }
> = {
  IFCWALL:              { hex: 0xf0ebe0 },
  IFCWALLSTANDARDCASE: { hex: 0xf0ebe0 },
  IFCSLAB:              { hex: 0xc8c0b0 },
  IFCCOLUMN:            { hex: 0xb8b0a0 },
  IFCBEAM:              { hex: 0xa8a090 },
  IFCROOF:              { hex: 0x606060 },
  IFCDOOR:              { hex: 0x9b7b4a },
  IFCWINDOW:            { hex: 0x88bbdd, opacity: 0.35, transparent: true },
  IFCSTAIR:             { hex: 0xd4c5a9 },
  IFCCOVERING:          { hex: 0xddd0b8 },
  IFCFURNISHINGELEMENT: { hex: 0xc0a882 },
  IFCPLATE:             { hex: 0xb0a898 },
  IFCMEMBER:            { hex: 0x909888 },
  IFCFOOTING:           { hex: 0xa8a090 },
  IFCPILE:              { hex: 0xa8a090 },
  IFCFLOWSEGMENT:       { hex: 0xff6b35 },
  IFCFLOWFITTING:       { hex: 0xff6b35 },
  IFCFLOWTERMINAL:      { hex: 0xff9500 },
  IFCPIPESEGMENT:       { hex: 0xff6b35 },
  IFCPIPEFITTING:       { hex: 0xff6b35 },
  IFCDUCTSEGMENT:       { hex: 0x7ec8e3 },
  IFCDUCTFITTING:       { hex: 0x7ec8e3 },
  IFCCURTAINWALL:       { hex: 0x99ccee, opacity: 0.4, transparent: true },
  IFCSPACE:             { hex: 0x88ccaa, opacity: 0.15, transparent: true },
};

export const SECTION_FILL_CATEGORIES: RegExp[] = [
  /IFCWALL/i, /IFCWALLSTANDARDCASE/i,
  /IFCSLAB/i,
  /IFCCOLUMN/i, /IFCBEAM/i,
  /IFCFOOTING/i, /IFCPILE/i,
  /IFCROOF/i,
];

export const IFC_LABEL: Record<string, string> = {
  IFCWALL: "Muro",                IFCWALLSTANDARDCASE: "Muro",
  IFCSLAB: "Losa",               IFCCOLUMN: "Columna",
  IFCBEAM: "Viga",               IFCDOOR: "Puerta",
  IFCWINDOW: "Ventana",          IFCSTAIR: "Escalera",
  IFCROOF: "Cubierta",           IFCOPENINGELEMENT: "Hueco",
  IFCFOOTING: "Zapata",          IFCPILE: "Pilote",
  IFCFURNISHINGELEMENT: "Mobiliario", IFCPLATE: "Placa",
  IFCMEMBER: "Perfil",           IFCSPACE: "Espacio",
  IFCPIPESEGMENT: "Tubería",     IFCPIPEFITTING: "Accesorio tubería",
  IFCDUCTSEGMENT: "Conducto",    IFCDUCTFITTING: "Accesorio conducto",
  IFCFLOWSEGMENT: "Segmento de flujo", IFCFLOWTERMINAL: "Terminal",
  IFCFLOWFITTING: "Accesorio de flujo", IFCCURTAINWALL: "Muro cortina",
  IFCCOVERING: "Revestimiento",  IFCRAILING: "Barandilla",
};

export const IFC_ICON: Record<string, string> = {
  model:               "material-symbols:folder",
  IFCSITE:             "material-symbols:location-on",
  IFCBUILDING:         "material-symbols:apartment",
  IFCBUILDINGSTOREY:   "material-symbols:layers",
  IFCWALL:             "mdi:wall",
  IFCWALLSTANDARDCASE: "mdi:wall",
  IFCCOLUMN:           "material-symbols:view-column",
  IFCBEAM:             "material-symbols:horizontal-rule",
  IFCSLAB:             "material-symbols:table-rows-narrow",
  IFCDOOR:             "material-symbols:door-front",
  IFCWINDOW:           "material-symbols:window",
  IFCSTAIR:            "material-symbols:stairs",
  IFCROOF:             "material-symbols:roofing",
  IFCOPENINGELEMENT:   "material-symbols:border-outer",
  IFCFURNISHINGELEMENT:"material-symbols:chair",
  IFCSPACE:            "material-symbols:space-dashboard",
  IFCPIPESEGMENT:      "material-symbols:plumbing",
  IFCDUCTSEGMENT:      "material-symbols:air",
  IFCFOOTING:          "material-symbols:foundation",
  IFCMEMBER:           "material-symbols:horizontal-distribute",
  IFCCURTAINWALL:      "material-symbols:grid-view",
};

// Color de acento único de la app. Debe coincidir con --accent en global.css
// y con el --bim-ui_main-base por defecto de @thatopen/ui.
export const ACCENT_HEX = 0x6528d7;
export const HIGHLIGHT_COLOR = new THREE.Color(ACCENT_HEX);

export function injectCompactTableCSS(): void {
  const s = document.createElement("style");
  s.textContent = `
    bim-table {
      --bim-ui--gap: 2px;
      --bim-ui--size-xs: 14px;
      --bim-ui--size-sm: 18px;
      line-height: 1.2;
    }
    bim-table-row, bim-table-row * {
      min-height: unset !important;
      padding-top: 1px !important;
      padding-bottom: 1px !important;
      line-height: 1.25 !important;
    }
    bim-label {
      line-height: 1.2 !important;
      padding: 1px 2px !important;
    }
  `;
  document.head.appendChild(s);
}
