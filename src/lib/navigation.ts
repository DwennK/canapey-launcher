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
      'button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex="0"]',
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
// Spatial navigation also covers import lists, forms, confirmations and settings.
export function focusDirection(
  root: HTMLElement,
  direction: Action,
  candidates = focusableItems(root),
) {
  const items = candidates;
  const current = document.activeElement as HTMLElement;
  if (!items.includes(current)) {
    focusElement(items[0]);
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
  focusElement(next?.e);
}
