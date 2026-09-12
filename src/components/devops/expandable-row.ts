"use client";

/**
 * The props that make a whole table row open when it is clicked.
 *
 * The chevron alone was a small target in a wide row, and every person who used
 * this board tried clicking the row itself first. So the row is the target and
 * the chevron stays as the thing that *says* it opens — the affordance and the
 * hit area are not the same problem.
 *
 * Shared rather than written twice, because a row that expands on one table and
 * not on the other is worse than neither doing it.
 */
import type { KeyboardEvent, MouseEvent } from "react";

/**
 * Controls inside the row keep their own clicks.
 *
 * A row full of links, sign-off toggles and a Remove button would otherwise
 * open every time somebody pressed one of them — and the Remove flow, which
 * asks for a reason in an input sitting in the row, would fight the row for
 * every keystroke.
 */
const OWN_CLICK = "a, button, input, select, textarea, label, [role='button'], [contenteditable='true']";

/**
 * `row` is the element the handler is bound to, and it has to be passed.
 *
 * The row calls itself `role="button"`, so a naive `closest(OWN_CLICK)` finds
 * the row itself for every click landing on a plain cell — and the row then
 * politely refuses to open, for any click at all. It is only somebody else's
 * click if the control found is somebody else.
 */
export function isOwnClick(target: EventTarget | null, row: Element | null): boolean {
  if (!(target instanceof Element)) return false;
  const control = target.closest(OWN_CLICK);
  return Boolean(control) && control !== row;
}

/**
 * Spread onto a `<tr>`. `open` is what the row currently is, `onToggle` what to
 * do about it.
 *
 * A row is a button in every way that matters here, so it says so: `button`
 * takes Enter and Space, and `aria-expanded` is what a screen reader reads to
 * know the row opens at all. The chevron inside keeps its own label, which is
 * why this one is `aria-hidden` to the accessibility tree's naming — the row's
 * own cells are the name.
 */
export function expandableRow(open: boolean, onToggle: () => void) {
  return {
    role: "button" as const,
    tabIndex: 0,
    "aria-expanded": open,
    onClick: (e: MouseEvent) => {
      if (isOwnClick(e.target, e.currentTarget as Element)) return;
      onToggle();
    },
    onKeyDown: (e: KeyboardEvent) => {
      if (e.key !== "Enter" && e.key !== " ") return;
      if (isOwnClick(e.target, e.currentTarget as Element)) return;
      // Space scrolls the page otherwise, which is not what pressing a row means.
      e.preventDefault();
      onToggle();
    },
  };
}
