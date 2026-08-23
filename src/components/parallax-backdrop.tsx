"use client";

import { motion, useMotionValue, useReducedMotion, useScroll, useSpring, useTransform } from "framer-motion";
import { useEffect } from "react";

/**
 * Ambient depth. This is what makes the glass read as glass — panels sitting on
 * a flat plane look like plain boxes, so the mesh underneath is doing real work
 * rather than decorating.
 *
 * Fixed and pointer-events-none, so it never intercepts a click.
 */
const ORBS = [
  { color: "var(--orb-1)", size: 680, top: "-14%", left: "-10%", depth: 1, scroll: 240, drift: 26 },
  { color: "var(--orb-2)", size: 560, top: "18%", left: "68%", depth: -0.75, scroll: -180, drift: 32 },
  { color: "var(--orb-3)", size: 520, top: "62%", left: "6%", depth: 0.5, scroll: 140, drift: 38 },
  { color: "var(--orb-4)", size: 420, top: "84%", left: "62%", depth: -0.4, scroll: -110, drift: 29 },
];

/** Static film grain, so the large flat washes do not band. */
const GRAIN =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3'/%3E%3C/filter%3E%3Crect width='140' height='140' filter='url(%23n)'/%3E%3C/svg%3E\")";

export function ParallaxBackdrop() {
  const reduced = useReducedMotion();
  const { scrollY } = useScroll();

  const mx = useMotionValue(0);
  const my = useMotionValue(0);
  const px = useSpring(mx, { stiffness: 38, damping: 24, mass: 0.9 });
  const py = useSpring(my, { stiffness: 38, damping: 24, mass: 0.9 });

  useEffect(() => {
    if (reduced) return;
    const onMove = (e: PointerEvent) => {
      mx.set((e.clientX / window.innerWidth - 0.5) * 2);
      my.set((e.clientY / window.innerHeight - 0.5) * 2);
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => window.removeEventListener("pointermove", onMove);
  }, [mx, my, reduced]);

  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      {/* Mesh wash, painted straight onto the plane so colour reaches the edges. */}
      <div
        className="absolute inset-0"
        style={{
          background: `
            radial-gradient(60% 45% at 12% 8%, var(--mesh-1), transparent 62%),
            radial-gradient(52% 42% at 88% 22%, var(--mesh-2), transparent 60%),
            radial-gradient(58% 50% at 24% 88%, var(--mesh-3), transparent 62%),
            radial-gradient(40% 34% at 78% 92%, var(--mesh-4), transparent 60%)`,
          opacity: 0.55,
        }}
      />

      {ORBS.map((orb, i) => (
        <Orb key={i} orb={orb} px={px} py={py} scrollY={scrollY} reduced={!!reduced} />
      ))}

      {/* Instrumentation grid — reads as a control surface, not decoration. */}
      <div
        className="absolute inset-0 opacity-[0.5]"
        style={{
          backgroundImage:
            "linear-gradient(var(--grid) 1px, transparent 1px), linear-gradient(90deg, var(--grid) 1px, transparent 1px)",
          backgroundSize: "72px 72px",
          maskImage: "radial-gradient(ellipse 110% 80% at 50% 0%, #000 30%, transparent 100%)",
          WebkitMaskImage: "radial-gradient(ellipse 110% 80% at 50% 0%, #000 30%, transparent 100%)",
        }}
      />

      <div
        className="absolute inset-0"
        style={{ backgroundImage: GRAIN, opacity: "var(--grain)", mixBlendMode: "overlay" }}
      />
    </div>
  );
}

type MV = ReturnType<typeof useMotionValue<number>>;

function Orb({
  orb,
  px,
  py,
  scrollY,
  reduced,
}: {
  orb: (typeof ORBS)[number];
  px: MV;
  py: MV;
  scrollY: MV;
  reduced: boolean;
}) {
  const scrollShift = useTransform(scrollY, [0, 1600], [0, reduced ? 0 : orb.scroll]);
  const x = useTransform(px, (v) => (reduced ? 0 : v * 48 * orb.depth));
  const pointerY = useTransform(py, (v) => (reduced ? 0 : v * 48 * orb.depth));
  const y = useTransform([scrollShift, pointerY], ([a, b]: number[]) => a + b);

  return (
    <motion.div
      style={{
        x,
        y,
        width: orb.size,
        height: orb.size,
        top: orb.top,
        left: orb.left,
        // Gradient only — no `filter: blur()`. The alpha already reaches zero
        // inside the element, so there is no edge to clip, and four 100px
        // blurs was a real per-frame cost while they drift.
        background: `radial-gradient(circle at 42% 40%, ${orb.color} 0%, color-mix(in srgb, ${orb.color} 45%, transparent) 38%, transparent 72%)`,
        opacity: "var(--orb-opacity)",
        // Autonomous drift keeps the field alive when the pointer is still.
        animation: reduced ? undefined : `drift ${orb.drift}s ease-in-out infinite`,
        animationDelay: `${-orb.drift / 3}s`,
      }}
      className="absolute rounded-full"
    />
  );
}
