import * as OBC from "@thatopen/components";
import * as OBF from "@thatopen/components-front";

/**
 * Rebuilds `highlighter.selectable.select` from each model's real visibility
 * flag (`model.getItemsByVisibility(true)`). Click-to-select uses a GPU
 * id-buffer picker that ignores per-item visibility set via
 * `model.setVisible()`, so this is the only way to keep a hidden element
 * from being selectable. Call it after any `setVisible` call, regardless of
 * which UI path (isolate, per-model toggle, per-element tree toggle)
 * triggered it, so all of them behave the same way.
 */
export async function syncPickableWithVisibility(
  fragments: OBC.FragmentsManager,
  highlighter: OBF.Highlighter,
): Promise<void> {
  const selectable: OBC.ModelIdMap = {};
  for (const [modelId, model] of fragments.list) {
    const visibleIds = await model.getItemsByVisibility(true);
    if (visibleIds.length > 0) selectable[modelId] = new Set(visibleIds);
  }
  highlighter.selectable.select = selectable;
}

/** Hoverer's own GPU pick (`getItemAt`) ignores per-item visibility too, and
 *  unlike Highlighter it has no `selectable`-style restriction to configure.
 *  There's no public API to filter what it hovers, so we react right after it
 *  attaches a hover visualization: if the item it just picked isn't in the
 *  current `highlighter.selectable.select` allow-list, tear the hover back
 *  down immediately (before the next paint) so a hidden element never shows
 *  a hover highlight or reads as "hoverable" to the user.
 *
 *  `_current` isn't part of Hoverer's public type — it's the only way to
 *  learn what was just hovered, since onHoverStarted only passes the
 *  Hoverer instance itself. */
export function guardHovererVisibility(
  hoverer: OBF.Hoverer,
  highlighter: OBF.Highlighter,
): void {
  hoverer.onHoverStarted.add(() => {
    const current = (hoverer as unknown as { _current: { modelId: string; localId: number } | null })._current;
    if (!current) return;
    const restriction = highlighter.selectable.select;
    if (!restriction) return;
    const isVisible = restriction[current.modelId]?.has(current.localId) ?? false;
    if (!isVisible) hoverer.clear();
  });
}
