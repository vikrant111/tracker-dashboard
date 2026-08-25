"use client";

import { useEffect, type RefObject } from "react";

/**
 * Keeps Tab inside an open dialog, and closes it on Escape.
 *
 * Without the trap, Tab walks out onto the page behind — which is both
 * disorienting and a way to leave a half-typed password focused under an
 * overlay. A dialog you cannot leave with the keyboard is a trap in the other
 * sense, so Escape always works.
 */
export function useFocusTrap(open: boolean, panel: RefObject<HTMLElement | null>, onClose: () => void) {
  useEffect(() => {
    if (!open) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key !== "Tab") return;
      const focusable = panel.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
      );
      if (!focusable?.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, panel, onClose]);
}
