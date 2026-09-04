"use client";

/**
 * Changing POD sends the reader back to the top.
 *
 * "Open this POD's dashboard" sits at the bottom of an expanded roll-up row.
 * Clicking it swapped the whole board but left the scroll position alone, and
 * the roll-up only renders for "All PODs" — so it unmounted, the page got
 * shorter, and the reader was left staring at whatever landed under their
 * cursor. It looked like nothing had happened.
 *
 * Covers every way the scope changes: the roll-up link, the POD picker, and the
 * search following a name into another POD. All three replace every number on
 * screen, so all three should start at the top.
 */
import { useEffect, useRef } from "react";
import { useReducedMotion } from "framer-motion";

/**
 * Is this a scope change worth scrolling for?
 *
 * Pure, so the rule is checked without a browser. Two cases do nothing: the
 * scope did not really change (React can run an effect again without the value
 * moving), and the reader is already at the top, where scrolling would be a
 * pointless animation.
 */
export function shouldScrollToTop(previous: string, next: string, scrollY: number): boolean {
  if (previous === next) return false;
  return typeof scrollY === "number" && scrollY > 0;
}

/** Scroll to the top whenever `scope` changes. Does nothing on first render. */
export function useScrollToTopOnScopeChange(scope: string) {
  const previous = useRef(scope);
  const reduced = useReducedMotion();

  useEffect(() => {
    const from = previous.current;
    previous.current = scope;

    if (typeof window === "undefined") return;
    if (!shouldScrollToTop(from, scope, window.scrollY)) return;

    // Smooth, so the reader sees they were moved. An instant jump is as
    // disorienting as not moving at all. Reduced motion gets the jump.
    window.scrollTo({ top: 0, behavior: reduced ? "auto" : "smooth" });
  }, [scope, reduced]);
}
