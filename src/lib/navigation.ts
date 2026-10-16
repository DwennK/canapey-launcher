import type { Action } from "./types";
export function navigate(
  index: number,
  count: number,
  columns: number,
  view: "carousel" | "grid",
  action: Action,
): { index: number; view: "carousel" | "grid" } {
  const last = Math.max(0, count - 1);
  index = Math.min(last, Math.max(0, index));
  columns = Math.max(1, columns);
  if (action === "back") return { index, view: "carousel" };
  if (view === "carousel") {
    if (action === "down") return { index, view: "grid" };
    if (action === "left") index = Math.max(0, index - 1);
    if (action === "right") index = Math.min(last, index + 1);
  } else {
    if (action === "up" && index < columns) return { index, view: "carousel" };
    if (action === "up") index = Math.max(0, index - columns);
    if (action === "down") index = Math.min(last, index + columns);
    if (action === "left" && index % columns > 0) index--;
    if (action === "right" && index % columns < columns - 1)
      index = Math.min(last, index + 1);
  }
  return { index, view };
}
export function reconcileSelection(
  ids: string[],
  selected: string | null,
): number {
  return Math.max(0, ids.indexOf(selected ?? ""));
}
// Spatial navigation also covers import lists, forms, confirmations and settings.
export function focusDirection(root: HTMLElement, direction: Action) {
  const items = [
    ...root.querySelectorAll<HTMLElement>(
      'button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex="0"]',
    ),
  ].filter((e) => e.getClientRects().length > 0 && !e.closest("[inert]"));
  const current = document.activeElement as HTMLElement;
  if (!items.includes(current)) {
    items[0]?.focus();
    return;
  }
  const r = current.getBoundingClientRect(),
    x = r.x + r.width / 2,
    y = r.y + r.height / 2;
  const horizontal = direction === "left" || direction === "right",
    sign = direction === "left" || direction === "up" ? -1 : 1;
  const next = items
    .filter((e) => e !== current)
    .map((e) => {
      const b = e.getBoundingClientRect();
      const dx = b.x + b.width / 2 - x,
        dy = b.y + b.height / 2 - y;
      const primary = (horizontal ? dx : dy) * sign;
      const cross = Math.abs(horizontal ? dy : dx);
      return { e, primary, score: primary + cross * 3 };
    })
    .filter((e) => e.primary > 8)
    .sort((a, b) => a.score - b.score)[0];
  next?.e.focus();
  next?.e.scrollIntoView({ block: "nearest", inline: "nearest" });
}
