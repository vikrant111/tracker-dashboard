"use client";

import { useEffect, useState } from "react";

/**
 * Measures an element, so a scene knows how much of itself is on screen.
 *
 * The sun is placed in viewBox units, but a `preserveAspectRatio="slice"` frame
 * shows only a strip of those units — so without the real pixel size the sun is
 * drawn with its disc hanging over the edge.
 */
/**
 * Measures an element, so the scene knows how much of itself is actually on
 * screen. `slice` crops a tall narrow card to a strip barely 58 units wide, and
 * the sun has to be pulled inside that strip or it is drawn with its disc
 * hanging over the edge.
 */
export function useBox(ref: React.RefObject<SVGSVGElement | null>) {
  const [box, setBox] = useState<{ width: number; height: number } | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const measure = () => {
      const r = el.getBoundingClientRect();
      setBox(r.width > 0 && r.height > 0 ? { width: r.width, height: r.height } : null);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref]);

  return box;
}
