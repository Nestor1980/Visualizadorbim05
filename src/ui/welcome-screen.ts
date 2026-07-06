import * as BUI from "@thatopen/ui";
import { listRecentFiles, getRecentFileData, getThumbnail } from "../ifc/recent-files";

export interface WelcomeScreenOptions {
  onLoadIfc: () => void;
  onLoadBytes: (bytes: Uint8Array, name: string) => Promise<void>;
  onClose?: () => void;
}

interface Project {
  name: string;
  label: string;
  url: string;
}

const PROJECTS: Project[] = [
  { name: "prototipo_iapv.ifc", label: "Prototipo IAPV", url: "/model_ifc/prototipo_iapv.ifc" },
];

const formatSize = (bytes: number): string => `${(bytes / (1024 * 1024)).toFixed(1)} MB`;

const isLightTheme = (): boolean => {
  const html = document.documentElement;
  if (html.classList.contains("bim-ui-light")) return true;
  if (html.classList.contains("bim-ui-dark")) return false;
  return window.matchMedia("(prefers-color-scheme: light)").matches;
};

/** Botón de archivo con miniatura: reserva el espacio de la imagen y muestra un ícono por defecto hasta que haya una en caché. */
function createFileItem(
  name: string,
  label: string,
  subtitle: string | null,
  onSelect: (button: HTMLButtonElement) => Promise<void>,
): HTMLButtonElement {
  const btn = document.createElement("button");
  btn.className = "welcome-file-item";
  btn.type = "button";
  btn.innerHTML = `
    <span class="welcome-thumb">
      <img class="welcome-thumb-img" alt="" />
      <iconify-icon class="welcome-thumb-placeholder" icon="material-symbols:image-outline"></iconify-icon>
    </span>
    <span class="welcome-file-text">
      <span class="welcome-file-label">${label}</span>
      ${subtitle ? `<span class="welcome-file-subtitle">${subtitle}</span>` : ""}
    </span>
  `;
  btn.addEventListener("click", () => onSelect(btn));

  getThumbnail(name)
    .then((dataUrl) => {
      if (!dataUrl) return;
      const img = btn.querySelector(".welcome-thumb-img") as HTMLImageElement;
      img.src = dataUrl;
      img.classList.add("loaded");
    })
    .catch((error) => console.error(`No se pudo leer la miniatura de "${name}":`, error));

  return btn;
}

/** Pantalla de bienvenida mostrada una vez, al terminar de cargar la app. */
export function showWelcomeScreen({ onLoadIfc, onLoadBytes, onClose }: WelcomeScreenOptions): void {
  const overlay = document.createElement("div");
  overlay.id = "welcome-screen";
  overlay.innerHTML = `
    <div class="welcome-card">
      <div class="welcome-top-actions">
        <button class="welcome-theme-toggle" type="button" aria-label="Cambiar tema">
          <iconify-icon icon="material-symbols:dark-mode"></iconify-icon>
        </button>
        <button class="welcome-close" type="button" aria-label="Cerrar">
          <iconify-icon icon="material-symbols:close"></iconify-icon>
        </button>
      </div>

      <div class="welcome-hero">
        <img class="welcome-logo" src="/img/visualizador_bim_withe.png" alt="Instituto Autárquico de Planeamiento y Vivienda" />
        <span class="welcome-version">v1.0.0</span>
      </div>

      <div class="welcome-body">
        <div class="welcome-col">
          <h3>Comenzar</h3>
          <button class="welcome-action welcome-action-primary" type="button" data-action="load">
            <iconify-icon icon="mage:box-3d-fill"></iconify-icon>
            Cargar modelo IFC…
          </button>
          <button class="welcome-action" type="button" data-action="dismiss">
            <iconify-icon icon="material-symbols:note-add-outline"></iconify-icon>
            Nuevo Proyecto
          </button>
        </div>

        <div class="welcome-col">
          <h3>Proyectos</h3>
          <div class="welcome-projects"></div>

          <h3 class="welcome-subheading">Recientes</h3>
          <div class="welcome-recents">
            <span class="welcome-empty">Cargando…</span>
          </div>
        </div>
      </div>

      <div class="welcome-footer">Instituto Autárquico de Planeamiento y Vivienda — Entre Ríos</div>
    </div>
  `;

  document.body.appendChild(overlay);

  const close = () => {
    overlay.classList.add("hidden");
    overlay.addEventListener("transitionend", () => overlay.remove(), { once: true });
    onClose?.();
  };

  const loadAndClose = async (bytes: Uint8Array, name: string) => {
    close();
    await onLoadBytes(bytes, name);
  };

  // — Proyectos —
  const projectsEl = overlay.querySelector(".welcome-projects") as HTMLElement;
  for (const project of PROJECTS) {
    const btn = createFileItem(project.name, project.label, null, async () => {
      btn.disabled = true;
      try {
        const response = await fetch(project.url);
        if (!response.ok) throw new Error(`No se pudo cargar ${project.name}`);
        const bytes = new Uint8Array(await response.arrayBuffer());
        await loadAndClose(bytes, project.name);
      } catch (error) {
        console.error("Error al cargar el proyecto:", error);
        btn.disabled = false;
      }
    });
    projectsEl.appendChild(btn);
  }

  // — Recientes —
  const recentsEl = overlay.querySelector(".welcome-recents") as HTMLElement;
  listRecentFiles()
    .then((entries) => {
      if (entries.length === 0) {
        recentsEl.innerHTML = `<span class="welcome-empty">No hay archivos recientes</span>`;
        return;
      }
      recentsEl.innerHTML = "";
      for (const entry of entries) {
        const btn = createFileItem(entry.name, entry.name, formatSize(entry.size), async () => {
          btn.disabled = true;
          try {
            const bytes = await getRecentFileData(entry.name);
            if (!bytes) throw new Error(`No se encontró "${entry.name}" en caché`);
            await loadAndClose(bytes, entry.name);
          } catch (error) {
            console.error("Error al cargar archivo reciente:", error);
            btn.disabled = false;
          }
        });
        recentsEl.appendChild(btn);
      }
    })
    .catch((error) => {
      console.error("No se pudieron leer los archivos recientes:", error);
      recentsEl.innerHTML = `<span class="welcome-empty">No hay archivos recientes</span>`;
    });

  // — Alternar tema claro/oscuro —
  const themeToggleBtn = overlay.querySelector(".welcome-theme-toggle") as HTMLButtonElement;
  const themeToggleIcon = themeToggleBtn.querySelector("iconify-icon") as HTMLElement;
  const applyThemeIcon = (light: boolean): void => {
    themeToggleIcon.setAttribute("icon", light ? "material-symbols:dark-mode" : "material-symbols:light-mode");
    themeToggleBtn.setAttribute("aria-label", light ? "Cambiar a modo oscuro" : "Cambiar a modo claro");
  };
  applyThemeIcon(isLightTheme());
  themeToggleBtn.addEventListener("click", () => {
    const nextLight = !isLightTheme();
    BUI.Manager.toggleTheme();
    applyThemeIcon(nextLight);
  });

  overlay.addEventListener("click", (event) => {
    if (event.target === overlay) close();
  });
  overlay.querySelector(".welcome-close")?.addEventListener("click", close);
  overlay.querySelector('[data-action="dismiss"]')?.addEventListener("click", close);
  overlay.querySelector('[data-action="load"]')?.addEventListener("click", () => {
    close();
    onLoadIfc();
  });
}
