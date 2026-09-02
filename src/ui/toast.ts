/**
 * Toasts de la app: notificaciones apiladas abajo a la derecha, fuera de los
 * shadow roots de @thatopen/ui (usan las clases .toast-* de global.css, que
 * consumen el mismo contrato de variables de tema que el resto del DOM "de
 * luz"). Un toast puede llevar barra de progreso — determinada (0..1) o
 * indeterminada — para operaciones largas como la carga de un modelo IFC.
 */

export type ToastVariant = "info" | "success" | "warning" | "error" | "loading";

export interface ToastOptions {
  /** Título en negrita (opcional). */
  title?: string;
  /** Cuerpo del mensaje. */
  message?: string;
  variant?: ToastVariant;
  /**
   * Milisegundos hasta el auto-cierre. `0` (o cualquier valor <= 0) lo deja
   * fijo hasta que se lo descarte por código o click. Por defecto: 4000ms
   * para variantes finales, y fijo para `loading`.
   */
  duration?: number;
  /** Muestra la "X" de cierre manual. Por defecto: true salvo en `loading`. */
  dismissible?: boolean;
  /**
   * Progreso inicial: `number` en 0..1 dibuja la barra determinada,
   * `"indeterminate"` la anima sin porcentaje, `undefined` la oculta.
   */
  progress?: number | "indeterminate";
}

export interface ToastHandle {
  /** ID interno, por si hace falta descartarlo desde otro lado. */
  readonly id: number;
  /** Actualiza texto / variante / progreso in-place, sin recrear el nodo. */
  update(opts: Partial<ToastOptions>): void;
  /** Atajo para la barra de progreso: 0..1, o `"indeterminate"`, o `null` para ocultarla. */
  setProgress(value: number | "indeterminate" | null): void;
  /**
   * Convierte el toast a un estado final (success/error/…), reinicia el
   * temporizador de auto-cierre y oculta la barra de progreso salvo que se
   * pase una nueva.
   */
  resolve(opts: Partial<ToastOptions> & { variant: ToastVariant }): void;
  /** Cierra el toast con su animación de salida. */
  dismiss(): void;
}

const VARIANT_ICON: Record<ToastVariant, string> = {
  info: "material-symbols:info-outline-rounded",
  success: "material-symbols:check-circle-outline-rounded",
  warning: "material-symbols:warning-outline-rounded",
  error: "material-symbols:error-outline-rounded",
  loading: "material-symbols:progress-activity",
};

const DEFAULT_DURATION = 4000;

let seq = 0;
let containerEl: HTMLElement | null = null;
let mountTarget: HTMLElement | null = null;

/**
 * Ancla la pila de toasts a un elemento (típicamente el `<bim-viewport>`, que
 * ya es `position: relative`), en vez del `<body>`. Llamar una vez al arrancar
 * la app; el nodo de destino puede reubicarse en el DOM sin re-anclar, porque
 * el contenedor viaja con él.
 */
export function mountToasts(target: HTMLElement): void {
  mountTarget = target;
  if (containerEl && containerEl.parentElement !== target) {
    target.appendChild(containerEl);
  }
}

function getContainer(): HTMLElement {
  const host = mountTarget ?? document.body;
  if (containerEl && containerEl.isConnected && containerEl.parentElement === host) {
    return containerEl;
  }
  if (!containerEl) {
    containerEl = document.createElement("div");
    containerEl.className = "toast-container";
    containerEl.setAttribute("role", "region");
    containerEl.setAttribute("aria-label", "Notificaciones");
  }
  host.appendChild(containerEl);
  return containerEl;
}

function clampFraction(value: number): number {
  if (Number.isNaN(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function showToast(options: ToastOptions): ToastHandle {
  const id = ++seq;
  const container = getContainer();

  const el = document.createElement("div");
  el.className = "toast";
  el.dataset.toastId = String(id);
  el.setAttribute("role", "status");
  el.innerHTML = `
    <iconify-icon class="toast-icon"></iconify-icon>
    <div class="toast-content">
      <div class="toast-title"></div>
      <div class="toast-message"></div>
      <div class="toast-progress" hidden>
        <div class="toast-progress-bar"></div>
        <span class="toast-progress-pct"></span>
      </div>
    </div>
    <button class="toast-close" type="button" aria-label="Cerrar">
      <iconify-icon icon="material-symbols:close-rounded"></iconify-icon>
    </button>
  `;

  const iconEl = el.querySelector(".toast-icon") as HTMLElement;
  const titleEl = el.querySelector(".toast-title") as HTMLElement;
  const messageEl = el.querySelector(".toast-message") as HTMLElement;
  const progressEl = el.querySelector(".toast-progress") as HTMLElement;
  const progressBarEl = el.querySelector(".toast-progress-bar") as HTMLElement;
  const progressPctEl = el.querySelector(".toast-progress-pct") as HTMLElement;
  const closeEl = el.querySelector(".toast-close") as HTMLButtonElement;

  let currentVariant: ToastVariant = "info";
  let dismissTimer: number | undefined;
  let removed = false;

  const clearTimer = () => {
    if (dismissTimer !== undefined) {
      window.clearTimeout(dismissTimer);
      dismissTimer = undefined;
    }
  };

  const dismiss = () => {
    if (removed) return;
    removed = true;
    clearTimer();
    el.classList.add("toast--leaving");
    const finish = () => {
      el.remove();
      if (containerEl && containerEl.childElementCount === 0) {
        containerEl.remove();
        containerEl = null;
      }
    };
    el.addEventListener("transitionend", finish, { once: true });
    window.setTimeout(finish, 400); // fallback si no dispara transitionend
  };

  const scheduleDismiss = (duration: number | undefined, variant: ToastVariant) => {
    clearTimer();
    const ms = duration ?? (variant === "loading" ? 0 : DEFAULT_DURATION);
    if (ms > 0) dismissTimer = window.setTimeout(dismiss, ms);
  };

  const applyProgress = (value: ToastOptions["progress"] | null) => {
    if (value === null || value === undefined) {
      progressEl.hidden = true;
      progressEl.classList.remove("toast-progress--indeterminate");
      return;
    }
    progressEl.hidden = false;
    if (value === "indeterminate") {
      progressEl.classList.add("toast-progress--indeterminate");
      progressBarEl.style.width = "";
      progressPctEl.textContent = "";
    } else {
      const pct = Math.round(clampFraction(value) * 100);
      progressEl.classList.remove("toast-progress--indeterminate");
      progressBarEl.style.width = `${pct}%`;
      progressPctEl.textContent = `${pct}%`;
    }
  };

  const applyVariant = (variant: ToastVariant) => {
    el.classList.remove(`toast--${currentVariant}`);
    currentVariant = variant;
    el.classList.add(`toast--${variant}`);
    iconEl.setAttribute("icon", VARIANT_ICON[variant]);
    iconEl.classList.toggle("toast-icon--spin", variant === "loading");
  };

  const applyText = (opts: Partial<ToastOptions>) => {
    if ("title" in opts) {
      titleEl.textContent = opts.title ?? "";
      titleEl.hidden = !opts.title;
    }
    if ("message" in opts) {
      messageEl.textContent = opts.message ?? "";
      messageEl.hidden = !opts.message;
    }
  };

  const update = (opts: Partial<ToastOptions>) => {
    if (removed) return;
    if (opts.variant) applyVariant(opts.variant);
    applyText(opts);
    if ("progress" in opts) applyProgress(opts.progress ?? null);
    if (opts.dismissible !== undefined) closeEl.hidden = !opts.dismissible;
    if ("duration" in opts) scheduleDismiss(opts.duration, currentVariant);
  };

  const resolve: ToastHandle["resolve"] = (opts) => {
    if (removed) return;
    applyVariant(opts.variant);
    applyText(opts);
    applyProgress("progress" in opts ? opts.progress ?? null : null);
    closeEl.hidden = opts.dismissible === false;
    scheduleDismiss(opts.duration, opts.variant);
  };

  closeEl.addEventListener("click", dismiss);
  // Pausar el auto-cierre mientras el puntero está encima.
  el.addEventListener("mouseenter", clearTimer);
  el.addEventListener("mouseleave", () => {
    if (!removed && currentVariant !== "loading") scheduleDismiss(undefined, currentVariant);
  });

  // — Estado inicial —
  const initialVariant = options.variant ?? "info";
  applyVariant(initialVariant);
  applyText({ title: options.title, message: options.message });
  applyProgress(options.progress ?? (initialVariant === "loading" ? "indeterminate" : null));
  const dismissible = options.dismissible ?? initialVariant !== "loading";
  closeEl.hidden = !dismissible;

  container.appendChild(el);
  // Fuerza reflow para que la transición de entrada corra desde el estado inicial.
  void el.offsetWidth;
  el.classList.add("toast--visible");

  scheduleDismiss(options.duration, initialVariant);

  return {
    id,
    update,
    setProgress: (value) => applyProgress(value),
    resolve,
    dismiss,
  };
}

export const toast = {
  show: showToast,
  info: (message: string, opts: Partial<ToastOptions> = {}) =>
    showToast({ ...opts, message, variant: "info" }),
  success: (message: string, opts: Partial<ToastOptions> = {}) =>
    showToast({ ...opts, message, variant: "success" }),
  warning: (message: string, opts: Partial<ToastOptions> = {}) =>
    showToast({ ...opts, message, variant: "warning" }),
  error: (message: string, opts: Partial<ToastOptions> = {}) =>
    showToast({ ...opts, message, variant: "error", duration: opts.duration ?? 6000 }),
  /** Toast fijo con barra de progreso, pensado para operaciones largas. */
  loading: (message: string, opts: Partial<ToastOptions> = {}) =>
    showToast({ ...opts, message, variant: "loading" }),
};
