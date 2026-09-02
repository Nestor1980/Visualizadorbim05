import * as OBC from "@thatopen/components";

/**
 * Un paso deshacible. `undo` y `redo` dejan el proyecto exactamente como
 * estaba antes/después del gesto que representó este comando — en la práctica
 * (ver `project-history.ts`) restaurando un snapshot serializado completo de
 * las capas de datos.
 */
export interface Command {
  /** Etiqueta corta para el tooltip / toast ("Agregar cota"). */
  label: string;
  undo: () => void | Promise<void>;
  redo: () => void | Promise<void>;
}

/**
 * Pila genérica de undo/redo. No sabe nada del dominio: recibe `Command`s ya
 * armados y los aplica en orden. `isApplying` está en `true` mientras corre un
 * `undo`/`redo` (o un bloque `suspendWhile`) para que quien genera los
 * comandos no registre como "cambios nuevos" las mutaciones que dispara el
 * propio undo.
 */
export class HistoryManager {
  private undoStack: Command[] = [];
  private redoStack: Command[] = [];
  private applying = false;
  private readonly maxDepth: number;

  /** Se dispara ante cualquier cambio de estado de la pila (push/undo/redo/clear). */
  readonly onChange = new OBC.Event<void>();

  constructor(maxDepth = 60) {
    this.maxDepth = maxDepth;
  }

  get isApplying(): boolean {
    return this.applying;
  }

  get canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  get canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  get undoLabel(): string | null {
    return this.undoStack.at(-1)?.label ?? null;
  }

  get redoLabel(): string | null {
    return this.redoStack.at(-1)?.label ?? null;
  }

  push(cmd: Command): void {
    if (this.applying) return;
    this.undoStack.push(cmd);
    while (this.undoStack.length > this.maxDepth) this.undoStack.shift();
    this.redoStack.length = 0;
    this.onChange.trigger();
  }

  async undo(): Promise<void> {
    const cmd = this.undoStack.pop();
    if (!cmd) return;
    this.applying = true;
    try {
      await cmd.undo();
    } finally {
      this.applying = false;
    }
    this.redoStack.push(cmd);
    this.onChange.trigger();
  }

  async redo(): Promise<void> {
    const cmd = this.redoStack.pop();
    if (!cmd) return;
    this.applying = true;
    try {
      await cmd.redo();
    } finally {
      this.applying = false;
    }
    this.undoStack.push(cmd);
    this.onChange.trigger();
  }

  clear(): void {
    this.undoStack.length = 0;
    this.redoStack.length = 0;
    this.onChange.trigger();
  }

  /**
   * Corre `fn` con la grabación suspendida (`isApplying === true`) — para la
   * carga / "nuevo proyecto", que reconstruye toda la escena y no debe quedar
   * como un único paso gigante en el historial.
   */
  async suspendWhile<T>(fn: () => Promise<T> | T): Promise<T> {
    const prev = this.applying;
    this.applying = true;
    try {
      return await fn();
    } finally {
      this.applying = prev;
    }
  }
}
