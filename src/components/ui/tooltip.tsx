"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

/**
 * A small label that appears beside whatever you point at.
 *
 * This replaces the browser's own `title=` attribute, which looked like nothing
 * else in the product, took about a second to appear, could not be styled, and
 * never showed up on a touch screen at all.
 *
 * Three things make it worth writing rather than reaching for a library:
 *
 * 1. **It escapes the panel.** Every panel is `overflow: hidden` so its glass
 *    edge stays crisp, which clips anything a child draws outside its box. A
 *    tooltip on the top row of a chart would be sliced in half. This one renders
 *    into `document.body` through a portal and positions itself with `fixed`,
 *    so no ancestor can clip it.
 * 2. **It stays on screen.** The bubble is nudged back inside the viewport, and
 *    flips below the target when there is no room above.
 * 3. **Keyboard and pointer both.** It shows on focus as well as hover, so the
 *    same information is available without a mouse.
 */
export function Tooltip({
  label,
  children,
  className = "",
}: {
  /** What to say. Keep it to a phrase — this is a label, not a paragraph. */
  label: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  const anchor = useRef<HTMLSpanElement>(null);
  const bubble = useRef<HTMLDivElement>(null);
  const [at, setAt] = useState<{ x: number; y: number; below: boolean } | null>(null);
  const reduced = useReducedMotion();

  /*
   * Measured after the bubble exists but before the browser paints it, so it is
   * never seen at the wrong coordinates first. `useLayoutEffect` rather than
   * `useEffect` for exactly that reason.
   */
  useLayoutEffect(() => {
    if (!at) return;

    const place = () => {
      const target = anchor.current?.getBoundingClientRect();
      const self = bubble.current?.getBoundingClientRect();
      if (!target || !self) return;

      const margin = 8;
      const gap = 8;
      // `clientWidth`, not `innerWidth`: the scrollbar is not usable space.
      const viewportW = document.documentElement.clientWidth;
      const viewportH = document.documentElement.clientHeight;

      // Above by default, below when the top of the screen is in the way.
      const below = target.top - self.height - gap < margin;
      const y = below ? target.bottom + gap : target.top - self.height - gap;

      // Centred on the target, then pulled back inside either edge.
      let x = target.left + target.width / 2 - self.width / 2;
      x = Math.max(margin, Math.min(x, viewportW - self.width - margin));

      setAt((current) => {
        if (!current) return current;
        const next = { x, y: Math.max(margin, Math.min(y, viewportH - self.height - margin)), below };
        // Only re-render on a real move, or this loops forever.
        const same = Math.abs(next.x - current.x) < 0.5 && Math.abs(next.y - current.y) < 0.5 && next.below === current.below;
        return same ? current : next;
      });
    };

    place();
    // A scroll moves the target out from under the bubble; close rather than
    // chase it, which is what every native tooltip does too.
    const dismiss = () => setAt(null);
    window.addEventListener("scroll", dismiss, true);
    window.addEventListener("resize", place);
    return () => {
      window.removeEventListener("scroll", dismiss, true);
      window.removeEventListener("resize", place);
    };
  }, [at]);

  // Escape closes it, matching every other transient surface in the product.
  useEffect(() => {
    if (!at) return;
    const onKeyDown = (e: KeyboardEvent) => e.key === "Escape" && setAt(null);
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [at]);

  // Start at the anchor's own position; the layout effect corrects it before paint.
  const open = () => {
    const rect = anchor.current?.getBoundingClientRect();
    if (rect) setAt({ x: rect.left, y: rect.top, below: false });
  };
  const close = () => setAt(null);

  if (!label) return <>{children}</>;

  return (
    <span
      ref={anchor}
      className={`contents ${className}`}
      onPointerEnter={(e) => e.pointerType !== "touch" && open()}
      onPointerLeave={close}
      onFocusCapture={open}
      onBlurCapture={close}
    >
      {children}
      {at &&
        typeof document !== "undefined" &&
        createPortal(
          <AnimatePresence>
            <motion.div
              ref={bubble}
              role="tooltip"
              initial={reduced ? false : { opacity: 0, y: at.below ? -4 : 4, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={reduced ? { duration: 0 } : { type: "spring", stiffness: 460, damping: 30 }}
              style={{ left: at.x, top: at.y }}
              className="pointer-events-none fixed z-[100] max-w-[16rem] rounded-lg border border-[var(--hairline)] bg-[var(--panel)] px-2.5 py-1.5 text-xs leading-snug font-medium text-[var(--ink)] shadow-lg"
            >
              {label}
            </motion.div>
          </AnimatePresence>,
          document.body,
        )}
    </span>
  );
}
