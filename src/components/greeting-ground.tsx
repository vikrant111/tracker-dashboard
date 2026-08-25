"use client";

/**
 * The ground: three depth bands of meadow, and the grass growing out of them.
 *
 * Depth comes from **value**, not outline — three greens, far to near, with the
 * near edge level with `GROUND` whatever the frame. Grass is drawn in tufts
 * rather than blades: one animation per clump instead of one per blade, which
 * is the difference between forty animations and a hundred and forty.
 */
import { GROUND, VIEW_H, VIEW_W, MEADOW_DEPTH, meadowDepthFor, liftBy } from "@/lib/sky";
import type { Phase } from "@/lib/greeting";
import { SCENE } from "@/lib/constants";
import { GRASS_BACK, GRASS_FRONT, type Tuft } from "./greeting-grass";

/**
 * The three depth bands of the meadow, far to near.
 *
 * The cast walks on the near band, so the near edge stays level with `GROUND`
 * whatever the frame. The two behind it roll upward into the distance, which is
 * what gives the scene ground rather than a floor line.
 *
 * Their depth scales with the open sky a tall frame added. Held at a fixed 22
 * units, the meadow on a full-height background is a thin strip stranded in the
 * middle of the screen with flat colour beneath it — which is exactly how it
 * looked. Scaled, the ground sits at the bottom at every size.
 */
export function meadowBands(above: number) {
  const depth = meadowDepthFor(above);
  return {
    depth,
    far: GROUND - depth,
    mid: GROUND - depth * 0.55,
    near: GROUND,
    // Blade height grows far more slowly than the meadow does. Linear, the
    // foreground grass on a phone would stand taller than the cat walking in it.
    blade: (depth / MEADOW_DEPTH) ** 0.35,
  };
}

/**
 * A rolling band top, filled to the bottom of the frame.
 *
 * Varied by index, never at random — the field has to be identical on the
 * server and the client or it visibly rearranges itself on hydration.
 */
export function bandPath(topY: number, amplitude: number, seed: number): string {
  const steps = 7;
  let d = `M 0 ${topY}`;
  for (let i = 1; i <= steps; i++) {
    const n = i * 7 + seed * 13;
    const x = (i / steps) * VIEW_W;
    const ctrlX = x - VIEW_W / steps / 2;
    const ctrlY = topY - (((n % 5) + 1) / 5) * amplitude;
    const endY = topY - (((n * 3) % 4) / 4) * amplitude * 0.5;
    d += ` Q ${ctrlX.toFixed(1)} ${ctrlY.toFixed(1)} ${x.toFixed(1)} ${endY.toFixed(1)}`;
  }
  return `${d} L ${VIEW_W} ${VIEW_H} L 0 ${VIEW_H} Z`;
}

/**
 * How much of the phase's own sky colour is washed over the meadow.
 *
 * Grass is green at noon and near-black at midnight, and the meadow tokens are
 * theme-scoped, not phase-scoped. Rather than four sets of greens per theme,
 * the phase tints the ground with its own horizon colour — which is what
 * atmosphere actually does, and it is one number instead of twelve tokens.
 */
export const MEADOW_TINT: Record<Phase, number> = {
  morning: 0.2,
  afternoon: 0.06,
  evening: 0.38,
  night: 0.62,
};

/**
 * The meadow: layered ground with tufts of grass along each band's edge.
 *
 * `back` is everything behind the cast, `front` the near band it walks on top
 * of. Splitting it in two is what lets the cat walk *through* the field rather
 * than on it.
 */
export function Meadow({
  layer,
  phase,
  reduced,
  above = 0,
}: {
  layer: "back" | "front";
  phase: Phase | null;
  reduced: boolean;
  above?: number;
}) {
  const back = layer === "back";
  const clumps = back ? GRASS_BACK : GRASS_FRONT;
  const tint = MEADOW_TINT[phase ?? "afternoon"];
  const band = meadowBands(above);

  // The front fringe is deliberately short. The cat's paws land at y≈107, and
  // the reader asked for its legs not to be hidden — so the near grass reaches
  // its ankles and no further.
  const scale = (back ? 1 : 0.45) * band.blade;
  const baseline = back ? band.far : band.near;

  const blades = (
    <g
      fill="none"
      stroke={back ? "var(--sky-grass)" : "var(--sky-grass-2)"}
      strokeWidth={back ? 0.9 : 0.8}
      strokeLinecap="round"
      opacity={back ? 0.85 : 1}
    >
      {clumps.map((t: Tuft, i: number) => {
        const h = t.height * scale;
        return (
          <g
            key={i}
            style={{
              transformOrigin: `${t.x}px ${baseline}px`,
              animation: reduced ? undefined : `sky-grass-sway ${t.dur} ease-in-out ${t.delay} infinite`,
            }}
          >
            {/* Three blades per tuft, splaying out and curling at the tip. */}
            <path d={`M ${t.x} ${baseline} Q ${t.x - 1.5 + t.lean} ${baseline - h * 0.6} ${t.x - 2.8 + t.lean} ${baseline - h}`} />
            <path d={`M ${t.x} ${baseline} Q ${t.x + 0.5 + t.lean} ${baseline - h * 0.7} ${t.x + 1.1 + t.lean} ${baseline - h * 1.25}`} />
            <path d={`M ${t.x} ${baseline} Q ${t.x + 2.1 + t.lean} ${baseline - h * 0.55} ${t.x + 3.6 + t.lean} ${baseline - h * 0.85}`} />
          </g>
        );
      })}
    </g>
  );

  return (
    <g>
      {back ? (
        <>
          {/* A pale band along the horizon: distance washes colour out. */}
          <rect
            x="0"
            y={band.far - band.depth}
            width={VIEW_W}
            height={band.depth * 1.2}
            fill="var(--sky-haze)"
            opacity="0.35"
          />
          <path d={bandPath(band.far, band.depth * 0.23, 1)} fill="var(--sky-meadow-1)" />
          {blades}
          <path d={bandPath(band.mid, band.depth * 0.18, 5)} fill="var(--sky-meadow-2)" />
        </>
      ) : (
        <>
          <path d={bandPath(band.near, band.depth * 0.14, 9)} fill="var(--sky-meadow-3)" />
          {blades}
          {/*
           * The phase, washed over the whole meadow — drawn **once**, here, in
           * the near layer.
           *
           * It used to be drawn in both layers, so everything below y=102 got
           * it twice while the page-level meadow beneath the band got it once.
           * That mismatch was a hard horizontal line across the background,
           * exactly where the two met.
           */}
          <rect
            x="0"
            y={band.far - band.depth * 0.4}
            width={VIEW_W}
            height={VIEW_H + band.depth}
            fill={`var(--sky-${phase ?? "afternoon"}-2)`}
            opacity={tint}
            style={{ transition: "opacity 1200ms var(--ease)" }}
          />
        </>
      )}
    </g>
  );
}
