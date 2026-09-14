"use client";

/**
 * Hold the page still while something is open over it.
 *
 * A modal `<dialog>` takes the top layer and makes the page inert, but it does
 * **not** stop the page scrolling behind it — the browser leaves that to you.
 * So the reader opens a dialog, spins the wheel out of habit, and the board
 * slides around underneath while the dialog stays put.
 *
 * The padding is the other half. Removing the scrollbar gives the page back its
 * width, so everything on it jumps sideways at the moment the dialog appears
 * and jumps back when it closes. Replacing the scrollbar with padding of the
 * same width means nothing moves at all.
 *
 * Counted rather than a boolean: two things open at once must not have the
 * first one to close hand the page back while the second is still up. The count
 * lives at module scope because the page is shared and the components are not.
 */
import { useEffect } from "react";

let locks = 0;
let restore: (() => void) | null = null;

function lock(): void {
  locks += 1;
  if (locks > 1 || typeof document === "undefined") return;

  const el = document.documentElement;
  const { overflow, paddingRight } = el.style;

  /* What the scrollbar was taking. Zero on an overlay-scrollbar platform, which
     is why it is measured rather than assumed. */
  const width = window.innerWidth - el.clientWidth;

  el.style.overflow = "hidden";
  if (width > 0) el.style.paddingRight = `${width}px`;

  restore = () => {
    el.style.overflow = overflow;
    el.style.paddingRight = paddingRight;
  };
}

function unlock(): void {
  locks = Math.max(0, locks - 1);
  if (locks > 0) return;

  restore?.();
  restore = null;
}

/** Lock while `active`, and always give the page back on unmount. */
export function useScrollLock(active: boolean): void {
  useEffect(() => {
    if (!active) return;

    lock();
    /*
     * The cleanup runs on unmount as well as on close, which is the case that
     * matters: a dialog whose row is filtered away while open would otherwise
     * leave the page locked with nothing on screen to explain why.
     */
    return unlock;
  }, [active]);
}
