import { listRecentFiles, getRecentFileData } from "../ifc/recent-files";

export interface WelcomeScreenOptions {
  onLoadIfc: () => void;
  onLoadBytes: (bytes: Uint8Array, name: string) => Promise<void>;
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

/** Pantalla de bienvenida mostrada una vez, al terminar de cargar la app. */
export function showWelcomeScreen({ onLoadIfc, onLoadBytes }: WelcomeScreenOptions): void {
  const overlay = document.createElement("div");
  overlay.id = "welcome-screen";
  overlay.innerHTML = `
    <div class="welcome-card">
      <button class="welcome-close" type="button" aria-label="Cerrar">
        <iconify-icon icon="material-symbols:close"></iconify-icon>
      </button>

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
  };

  const loadAndClose = async (bytes: Uint8Array, name: string) => {
    close();
    await onLoadBytes(bytes, name);
  };

  // — Proyectos —
  const projectsEl = overlay.querySelector(".welcome-projects") as HTMLElement;
  for (const project of PROJECTS) {
    const btn = document.createElement("button");
    btn.className = "welcome-action";
    btn.type = "button";
    btn.innerHTML = `<iconify-icon icon="material-symbols:home-work-outline"></iconify-icon> ${project.label}`;
    btn.addEventListener("click", async () => {
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
        const btn = document.createElement("button");
        btn.className = "welcome-action welcome-action-recent";
        btn.type = "button";
        btn.innerHTML = `
          <iconify-icon icon="material-symbols:history"></iconify-icon>
          <span class="welcome-recent-name">${entry.name}</span>
          <span class="welcome-recent-size">${formatSize(entry.size)}</span>
        `;
        btn.addEventListener("click", async () => {
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
