"use client";

/**
 * The world the greeting card looks out on: ground, weather, sun and moon.
 *
 * Split out of `greeting.tsx` because that file had grown to hold three
 * unrelated jobs — the card, the world, and the animals in it — and a reader
 * looking for the grass had to scroll past a cat's leg joints to find it.
 *
 * Everything here is **drawn**, never measured: nothing in this file talks to
 * the API. What it needs to know about the clock arrives as props.
 *
 * Nothing here varies at random. `Math.random()` would give the server one
 * field and the client another, and the scene would visibly rearrange itself on
 * hydration — so every variation is derived from an index instead.
 */
import {
  GROUND,
  MEADOW_DEPTH,
  VIEW_H,
  VIEW_W,
  liftBy,
  meadowDepthFor,
  moonName,
  moonPhase,
  moonShadowPath,
  placeBody,
  type Body,
} from "@/lib/sky";
import type { Phase } from "@/lib/greeting";
import { SCENE } from "@/lib/constants";

/** The measured pixel size of the box a scene is drawn into, when known. */
export type Box = { width: number; height: number } | null;
export { Meadow } from "./greeting-ground";

/**
 * A cloud: overlapping rounded humps on a flat base, not a row of ellipses.
 *
 * Flat-bottomed and lumpy is what a cumulus silhouette reads as; three ellipses
 * in a line read as three ellipses in a line.
 */
export function Cloud() {
  return (
    <g fill="var(--sky-cloud)">
      <rect x="26" y="-2" width="70" height="10" rx="5" />
      <circle cx="42" cy="-2" r="9" />
      <circle cx="56" cy="-8" r="13" />
      <circle cx="72" cy="-4" r="10" />
      <circle cx="86" cy="0" r="7.5" />
      <circle cx="32" cy="1" r="6" />
    </g>
  );
}

export function Sun({ body, box, above = 0 }: { body: Body; box: Box; above?: number }) {
  const { cx, cy } = placeBody(body, box, above);
  // Low sun reads warm and dim; high sun reads bright. Same disc, different hue.
  const low = body.altitude < 0.35;
  return (
    <g style={{ transform: `translate(${cx}px, ${cy}px)`, transition: "transform 1200ms var(--ease)" }}>
      <circle r="40" fill="url(#sunGlow)" style={{ animation: "sky-pulse 7s linear infinite" }} />
      {Array.from({ length: 8 }).map((_, i) => (
        <line
          key={i}
          x1="0"
          y1="-22"
          x2="0"
          y2="-28"
          stroke={low ? "var(--sky-sun-low)" : "var(--sky-sun)"}
          strokeWidth="2"
          strokeLinecap="round"
          opacity={low ? 0.35 : 0.55}
          style={{ transform: `rotate(${i * 45}deg)` }}
        />
      ))}
      <circle r="14" fill={low ? "var(--sky-sun-low)" : "var(--sky-sun)"} />
    </g>
  );
}

/**
 * The moon, wearing tonight's actual phase. The shadow path comes from
 * `moonShadowPath`, so what is on screen is the real shape for the date.
 */
export function Moon({ body, date, box, above = 0 }: { body: Body; date: Date; box: Box; above?: number }) {
  const { cx, cy } = placeBody(body, box, above);
  const phase = moonPhase(date);
  const shadow = moonShadowPath(13, phase);
  return (
    <g
      style={{ transform: `translate(${cx}px, ${cy}px)`, transition: "transform 1200ms var(--ease)" }}
      role="img"
      aria-label={moonName(phase)}
    >
      <circle r="34" fill="url(#moonGlow)" style={{ animation: "sky-pulse 9s linear infinite" }} />
      <circle r="13" fill="var(--sky-moon)" />
      {/* craters, faint enough to read as texture rather than spots */}
      <circle cx="-4" cy="-3" r="2.6" fill="var(--sky-moon-crater)" opacity="0.5" />
      <circle cx="3.5" cy="2.5" r="1.8" fill="var(--sky-moon-crater)" opacity="0.4" />
      <circle cx="-1" cy="6" r="1.2" fill="var(--sky-moon-crater)" opacity="0.35" />
      {shadow && <path d={shadow} fill="var(--sky-moon-shadow)" />}
    </g>
  );
}
