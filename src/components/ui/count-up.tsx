"use client";

/** A number that animates to its value the first time it scrolls into view. */
import { useInView, useReducedMotion } from "framer-motion";
import { useEffect, useRef, useState } from "react";

/** Counts up when scrolled into view. Reduced motion gets the final value immediately. */
export function CountUp({
  value,
  decimals = 0,
  duration = 900,
  className = "",
  style,
}: {
  value: number;
  decimals?: number;
  duration?: number;
  className?: string;
  style?: React.CSSProperties;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: "-40px" });
  const reduced = useReducedMotion();
  const [shown, setShown] = useState(0);
  // Where the next run starts. The dashboard refetches every 30s, and counting
  // up from zero on each refresh would flash the whole board back to 0.
  const from = useRef(0);

  useEffect(() => {
    if (!inView) return;
    if (reduced) {
      from.current = value;
      setShown(value);
      return;
    }

    let raf = 0;
    const start = performance.now();
    const origin = from.current;
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setShown(origin + (value - origin) * eased);
      if (t < 1) raf = requestAnimationFrame(step);
      else from.current = value;
    };
    raf = requestAnimationFrame(step);
    return () => {
      cancelAnimationFrame(raf);
      from.current = value;
    };
  }, [inView, value, duration, reduced]);

  return (
    <span ref={ref} className={className} style={style}>
      {shown.toFixed(decimals)}
    </span>
  );
}
