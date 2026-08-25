"use client";

import { useEffect, useRef, useState } from "react";

/**
 * The measured width of an element, for charts that draw in pixels.
 *
 * A chart cannot lay itself out until it knows how wide it is, and a server
 * render knows nothing — so this starts at zero and the chart draws once the
 * observer reports.
 */
export function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(720);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}

const fmtDay = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
