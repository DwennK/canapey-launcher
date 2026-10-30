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
export function focusableItems(root: HTMLElement) {
  return [
    ...root.querySelectorAll<HTMLElement>(
      'button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),summary,[tabindex="0"]',
    ),
  ].filter(
    (e) =>
      e.getClientRects().length > 0 &&
      !e.closest("[inert], [hidden]") &&
      !e.matches(":disabled"),
  );
}
export function focusElement(element: HTMLElement | undefined) {
  element?.focus({ preventScroll: true });
  element?.scrollIntoView({ block: "nearest", inline: "nearest" });
}
export function isTextControl(
  element: Element | null,
): element is HTMLInputElement | HTMLTextAreaElement {
  return (
    element instanceof HTMLTextAreaElement ||
    (element instanceof HTMLInputElement &&
      !["checkbox", "range", "button", "submit"].includes(element.type))
  );
}
export interface FocusBookmark {
  key: string;
  index: number;
}
function focusKey(element: HTMLElement) {
  return (
    element.dataset.focusKey ??
    element.getAttribute("aria-label") ??
    (element instanceof HTMLInputElement ||
    element instanceof HTMLSelectElement ||
    element instanceof HTMLTextAreaElement
      ? (element.labels?.[0]?.textContent?.trim() ??
        element.getAttribute("placeholder") ??
        element.type)
      : (element.textContent?.trim() ?? ""))
  );
}
export function rememberFocus(root: HTMLElement): FocusBookmark {
  const items = focusableItems(root),
    index = items.indexOf(document.activeElement as HTMLElement);
  return {
    key: index < 0 ? "" : focusKey(items[index]!),
    index: Math.max(0, index),
  };
}
export function restoreFocus(root: HTMLElement, bookmark: FocusBookmark) {
  const items = focusableItems(root);
  focusElement(
    items.find((e) => focusKey(e) === bookmark.key) ??
      items[Math.min(bookmark.index, items.length - 1)],
  );
}
export interface FocusRect { x: number; y: number; width: number; height: number }
/** Move through the nearest visual row, then choose its closest column. Never wrap. */
export function directionalTarget(rects: FocusRect[], current: number, direction: Action): number {
  const r = rects[current];
  if (!r || !['up', 'down', 'left', 'right'].includes(direction)) return current;
  const horizontal = direction === 'left' || direction === 'right';
  const sign = direction === 'left' || direction === 'up' ? -1 : 1;
  const cx = r.x + r.width / 2, cy = r.y + r.height / 2;
  const candidates = rects.flatMap((b, index) => {
    if (index === current) return [];
    const dx = b.x + b.width / 2 - cx, dy = b.y + b.height / 2 - cy;
    const primary = (horizontal ? dx : dy) * sign;
    const overlapY = Math.min(r.y + r.height, b.y + b.height) - Math.max(r.y, b.y);
    if (primary <= 8) return [];
    // Left/right stays on the same row; up/down cannot drift across that row.
    if (horizontal ? overlapY <= 0 : overlapY > Math.min(r.height, b.height) / 2) return [];
    const gap = horizontal
      ? Math.max(0, sign > 0 ? b.x - r.x - r.width : r.x - b.x - b.width)
      : Math.max(0, sign > 0 ? b.y - r.y - r.height : r.y - b.y - b.height);
    return [{ index, gap, primary, cross: Math.abs(horizontal ? dy : dx) }];
  });
  const nearest = Math.min(...candidates.map(c => c.gap));
  return candidates.filter(c => c.gap <= nearest + 8)
    .sort((a, b) => a.cross - b.cross || a.primary - b.primary)[0]?.index ?? current;
}
// Shared by dialogs and keyboards. A scope keeps independent regions isolated.
export function focusDirection(root: HTMLElement, direction: Action, candidates = focusableItems(root)) {
  const current = document.activeElement as HTMLElement;
  const scope = current?.closest<HTMLElement>('[data-nav-scope]');
  const items = scope && root.contains(scope) ? candidates.filter(item => scope.contains(item)) : [...candidates];
  let index = items.indexOf(current);
  if (index < 0) {
    // Async results can announce a focused heading before the next actionable row.
    if (current !== root && root.contains(current) && current.getClientRects().length) {
      index = items.push(current) - 1;
    } else { focusElement(items[0]); return; }
  }
  const rects = items.map(item => {
    const row = item.closest<HTMLElement>('.setting-row');
    // A single-control label is one full-width navigation row.
    return (row && focusableItems(row).length === 1 ? row : item).getBoundingClientRect();
  });
  const next = directionalTarget(rects, index, direction);
  if (next !== index) focusElement(items[next]);
}
