"use client";

import { motion, useMotionValue, useReducedMotion, useScroll, useSpring, useTransform } from "framer-motion";
import { useEffect, useLayoutEffect, useState } from "react";
import { phaseFor, type Phase } from "@/lib/greeting";
import {
  anchorIsUsable,
  clipPathAt,
  maskImageAt,
  parallaxAt,
  takeoverProgress,
  veilAt,
  zoomAt,
  type Anchor,
} from "@/lib/takeover";
import type { Weather } from "@/lib/weather";
import { Sky } from "./greeting";

/**
 * The greeting card's sky, taking over the page as you scroll.
 *
 * This layer is the *same* scene the card draws, held `fixed` behind the board
 * and masked to exactly the card's rectangle. At rest it is therefore entirely
 * hidden behind the card — you see the card's own sky. As you scroll, the window
 * opens outward and the scene pushes in, so the sky appears to grow out of the
 * card until it owns the whole page.
 *
 * Because the window starts *at* the card and the layer sits behind it, there is
 * never a moment where two skies are visible at once. Nothing cross-fades.
 *
 * The window is a **mask, not a clip**. A clip is a binary test per pixel, so
 * the sky met the page in a razor-sharp rectangle that read as a rendering
 * fault rather than as a card growing. A mask carries alpha, so the edge fades.
 * The clip is still applied underneath, purely as containment.
 *
 * Only `mask-image`, `clip-path`, `transform` and `opacity` change — no layout,
 * no scroll handler. The maths lives in [`lib/takeover.ts`](../lib/takeover.ts)
 * so it can be checked without a browser.
 */
export function SkyBackdrop({ anchor, weather }: { anchor: HTMLElement | null; weather: Weather | null }) {
  const reduced = useReducedMotion();
  const { scrollY } = useScroll();

  const [now, setNow] = useState<Date | null>(null);
  const [phase, setPhase] = useState<Phase | null>(null);
  const [rect, setRect] = useState<Anchor | null>(null);
  const [viewport, setViewport] = useState<{ width: number; height: number } | null>(null);

  // The hour is only knowable on the client; rendering it during SSR would
  // hydrate into a different sky. Same rule as the card itself.
  useEffect(() => {
    const read = () => {
      const d = new Date();
      setNow(d);
      setPhase(phaseFor(d.getHours()));
    };
    read();
    const id = setInterval(read, 60_000);
    return () => clearInterval(id);
  }, []);

  // Measure the card in *document* space, so scrolling needs no re-measure.
  // Re-runs whenever the card mounts, unmounts, or changes size — it does not
  // exist during loading, and it reflows when a POD is switched.
  useLayoutEffect(() => {
    if (typeof window === "undefined") return;

    const measure = () => {
      // `documentElement.clientWidth`, not `window.innerWidth`: innerWidth
      // includes the scrollbar, and this layer is `fixed inset-0`, which does
      // not. On desktop that is ~15px of permanent error down the right edge —
      // the window would compute a right inset that never quite reaches zero.
      const root = document.documentElement;
      setViewport({ width: root.clientWidth, height: root.clientHeight });
      if (!anchor?.isConnected) {
        setRect(null);
        return;
      }
      const r = anchor.getBoundingClientRect();
      setRect({ docTop: r.top + window.scrollY, left: r.left, width: r.width, height: r.height });
    };

    measure();

    const observer = new ResizeObserver(measure);
    if (anchor) observer.observe(anchor);
    window.addEventListener("resize", measure);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [anchor]);

  // Hooks cannot be called conditionally, so the motion values are always
  // created and a missing anchor is handled after them. `usable` keeps the
  // scroll maths from ever seeing a zero-sized or unmeasured card.
  const usable = anchorIsUsable(rect) && !!viewport;
  const safeRect: Anchor = usable ? (rect as Anchor) : { docTop: 0, left: 0, width: 1, height: 1 };
  const safeViewport = viewport ?? { width: 1, height: 1 };

  const rawProgress = useTransform(scrollY, (y) => takeoverProgress(y, safeRect));
  // Springing the *progress* rather than the clip string: a spring cannot
  // interpolate `inset(…)`, and springing scroll directly makes the window lag
  // the card it is supposed to be glued to.
  const progress = useSpring(rawProgress, { stiffness: 70, damping: 26, restDelta: 0.0005 });

  const still = useMotionValue(0);
  const live = reduced ? still : progress;

  const maskImage = useTransform([live, scrollY], ([p, y]) =>
    maskImageAt(safeRect, safeViewport, y as number, p as number) ?? "none",
  );
  const clipPath = useTransform([live, scrollY], ([p, y]) =>
    clipPathAt(safeRect, safeViewport, y as number, p as number),
  );
  const scale = useTransform(live, (p) => zoomAt(p as number));
  const y = useTransform(scrollY, (v) => (reduced ? 0 : parallaxAt(v as number)));
  // Scaled by viewport: on a narrow screen the gutters collapse and the sky is
  // only visible through the glass, so the veil has to get out of its way.
  const veil = useTransform(live, (p) => veilAt(p as number, safeViewport.width));

  if (!phase || !now || !usable) return null;

  return (
    <motion.div
      aria-hidden
      className="pointer-events-none fixed inset-0 -z-[9] overflow-hidden"
      style={{
        maskImage,
        WebkitMaskImage: maskImage,
        // Four gradients, one per edge — they have to be ANDed, not stacked.
        maskComposite: "intersect",
        WebkitMaskComposite: "source-in",
        // Containment, in case that intersect is not honoured. The feather fades
        // inward from this exact edge, so the clip lands where alpha is already
        // zero and never shows a seam of its own.
        clipPath,
        willChange: "mask-image, clip-path, transform",
      }}
    >
      <motion.div className="absolute inset-0" style={{ scale, y }}>
        <div
          className="absolute inset-0"
          style={{
            background: `linear-gradient(to bottom, var(--sky-${phase}-1), var(--sky-${phase}-2))`,
            transition: "background 1200ms var(--ease)",
          }}
        />

        {/*
         * The scene fills the whole layer — not a band across the top.
         *
         * It used to be a band 30% of the width with flat meadow colour painted
         * beneath it, which put the horizon halfway down a tall screen and left
         * the grass stranded in the middle. Given the full height, `adapt`
         * stretches the sky and `meadowBands` deepens the ground, so the grass
         * ends up at the bottom by construction and there is no join to see.
         *
         * `fit="adapt"` grows the viewBox upward by however much open sky the
         * shape needs, so **100% of the scene width is on screen at every
         * size**. Cropping a 10:3 strip into a portrait frame threw away 70% of
         * it, sun included.
         *
         * The cast is on. The "giant cat" that took it off was an artefact of
         * `slice` scaling by *height* — `adapt` scales by width, so the animals
         * come out at roughly the size they are in the card.
         */}
        <div className="absolute inset-0">
          <Sky now={now} phase={phase} weather={weather} reduced={!!reduced} fit="adapt" />
        </div>
      </motion.div>

      {/* Sits above the sky, below the panels. Without it the board loses its
          contrast the moment the sky fills the screen. */}
      <motion.div className="absolute inset-0" style={{ background: "var(--plane)", opacity: veil }} />
    </motion.div>
  );
}
