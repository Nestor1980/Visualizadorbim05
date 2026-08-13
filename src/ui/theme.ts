import * as BUI from "@thatopen/ui";

type ThemeListener = (light: boolean) => void;
const listeners = new Set<ThemeListener>();

export function isLightTheme(): boolean {
  const html = document.documentElement;
  if (html.classList.contains("bim-ui-light")) return true;
  if (html.classList.contains("bim-ui-dark")) return false;
  return window.matchMedia("(prefers-color-scheme: light)").matches;
}

// BUI.Manager.toggleTheme() decide el próximo tema mirando únicamente si
// <html> ya tiene la clase "bim-ui-light" o "bim-ui-dark": si no tiene
// ninguna (estado inicial, antes del primer toggle), agrega "bim-ui-light"
// sin mirar el tema ambiente real. Fijar la clase explícita una vez al
// iniciar hace que el primer toggle (y todos los siguientes) sean predecibles.
export function ensureExplicitThemeClass(): void {
  const html = document.documentElement;
  if (html.classList.contains("bim-ui-light") || html.classList.contains("bim-ui-dark")) return;
  html.classList.add(isLightTheme() ? "bim-ui-light" : "bim-ui-dark");
}

// animate=false evita el overlay de "wipe" circular que aplica @thatopen/ui
// por defecto; el cambio de variables CSS ya se transiciona de forma suave
// vía global.css. Los botones creados con createThemeToggleButton() se
// suscriben acá para mantenerse sincronizados sin importar cuál disparó el toggle.
export function toggleTheme(): void {
  const nextLight = !isLightTheme();
  BUI.Manager.toggleTheme(false);
  for (const listener of listeners) listener(nextLight);
}

export function createThemeToggleButton(): BUI.Button {
  const applyTheme = (light: boolean): void => {
    btn.icon  = light ? "material-symbols:dark-mode" : "material-symbols:light-mode";
    btn.label = light ? "Modo oscuro" : "Modo claro";
  };

  const btn = BUI.Component.create<BUI.Button>(() => {
    return BUI.html`<bim-button @click=${() => toggleTheme()}></bim-button>`;
  });

  listeners.add(applyTheme);
  applyTheme(isLightTheme());

  return btn;
}
