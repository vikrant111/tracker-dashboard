"use client";

import { useReducedMotion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import type { Phase } from "@/lib/greeting";
import {
  GROUND,
  VIEW_H,
  VIEW_W,
  moonName,
  moonPhase,
  MEADOW_DEPTH,
  meadowDepthFor,
  liftBy,
  moonShadowPath,
  placeBody,
  skyAbove,
  skyBodies,
  type Body,
} from "@/lib/sky";
import type { Weather } from "@/lib/weather";
import { SCENE } from "@/lib/constants";
import { Bat, Cat, Crane, Gull, Squirrel } from "./greeting-cast";
import { Cloud, Meadow, Moon, Sun, type Box } from "./greeting-scene";

// Scene geometry lives in lib/sky.ts, re-exported here for the scene itself.
export { GROUND, VIEW_H, VIEW_W };

export { Greeting } from "./greeting-card";
import {
  BATS,
  CAST,
  CLOUD_COUNT,
  CLOUDS_UNKNOWN,
  CRANES,
  GULLS,
} from "./greeting-choreography";
import { useBox } from "./use-box";

/**
 * Exported so the scroll takeover draws the **same** scene the card draws.
 * Two hand-kept copies would drift, and a background that disagrees with the
 * card it grew out of is worse than no background at all.
 */
export function Sky({
  now,
  phase,
  weather,
  reduced,
  grounded = true,
  cast = true,
  fit = "slice",
}: {
  now: Date | null;
  phase: Phase | null;
  weather: Weather | null;
  reduced: boolean;
  /**
   * Whether to draw the meadow.
   *
   * On by default. The takeover wants this too — a background that is only sky
   * while the card it grew out of has a whole landscape is the thing that made
   * the two stop matching.
   */
  grounded?: boolean;
  /**
   * Whether the animals are out.
   *
   * Separate from `grounded` on purpose. At full-bleed the cat is several feet
   * tall, which is why the takeover turns the cast off — but it still wants the
   * ground the cat would have walked on. One component, two framings; when
   * these were a single flag, turning off the giant cat also deleted the
   * meadow, and the background silently stayed on the old design.
   */
  cast?: boolean;
  /**
   * `slice` fills the box and crops — right for the card, which must have no
   * empty corners.
   *
   * `adapt` is for the full-bleed takeover: it grows the viewBox *upward* by
   * however much open sky the box needs, so the scene fills any shape at full
   * width with **nothing cropped**. On a 400×398 phone band, `slice` throws away
   * 70% of the scene — sun included — and plain `meet` leaves a 120px sky over
   * 700px of grass. Extending the sky gives a portrait landscape instead, which
   * is what a tall frame actually looks like.
   */
  fit?: "slice" | "adapt";
}) {
  const svg = useRef<SVGSVGElement>(null);
  const measured = useBox(svg);
  // Only a cropping fit needs the body pulled inside the visible strip.
  const box = fit === "slice" ? measured : null;
  // Extra sky above the scene, so a tall box is filled by sky rather than by
  // cropping. Zero at the scene's own aspect, so the card is untouched.
  const above = fit === "adapt" && measured ? skyAbove(measured.width, measured.height) : 0;

  const anim = (name: string, dur: string, delay = "0s") =>
    reduced ? undefined : `${name} ${dur} linear ${delay} infinite`;

  const bodies = now ? skyBodies(now) : null;
  const clouds = weather ? (CLOUD_COUNT[weather.sky] ?? 1) : CLOUDS_UNKNOWN;
  const precipitating = weather?.sky === "rain" || weather?.sky === "snow" || weather?.sky === "storm";

  return (
    <svg
      ref={svg}
      aria-hidden
      viewBox={`0 ${-above} ${VIEW_W} ${VIEW_H + above}`}
      preserveAspectRatio={fit === "slice" ? "xMidYMid slice" : "xMidYMid meet"}
      className="absolute inset-0 h-full w-full"
    >
      <defs>
        <radialGradient id="sunGlow">
          <stop offset="0%" stopColor="var(--sky-sun)" stopOpacity="0.85" />
          <stop offset="45%" stopColor="var(--sky-sun)" stopOpacity="0.28" />
          <stop offset="100%" stopColor="var(--sky-sun)" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="moonGlow">
          <stop offset="0%" stopColor="var(--sky-moon)" stopOpacity="0.55" />
          <stop offset="55%" stopColor="var(--sky-moon)" stopOpacity="0.16" />
          <stop offset="100%" stopColor="var(--sky-moon)" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/*
       * Stars, only once the sun is properly down.
       *
       * `above` is the open sky a tall frame added, and these spread up into it
       * rather than staying clumped along the bottom — an empty upper half is
       * the tell that a scene was drawn for a different shape.
       */}
      {phase === "night" &&
        [
          [40, 22, 0.15],
          [96, 14, 0.62],
          [150, 30, 0.34],
          [214, 18, 0.88],
          [268, 26, 0.05],
          [318, 12, 0.5],
          [362, 28, 0.74],
          [70, 18, 0.42],
          [188, 24, 0.95],
          [300, 20, 0.22],
        ].map(([x, y, depth], i) => (
          <circle
            key={i}
            cx={x}
            cy={liftBy(y, above, depth)}
            r={i % 3 === 0 ? 1.2 : 0.8}
            fill="var(--sky-star)"
            style={{ animation: reduced ? undefined : `sky-twinkle ${3 + (i % 4)}s ease-in-out ${-i * 0.7}s infinite` }}
          />
        ))}

      {bodies?.sun.up && <Sun body={bodies.sun} box={box} above={above} />}
      {bodies?.moon.up && now && <Moon body={bodies.moon} date={now} box={box} above={above} />}

      {/*
       * Cloud cover follows the weather when there is weather to follow.
       *
       * `depth` lifts each one into the extra sky a tall frame added, so the
       * cover spreads over the whole frame instead of banding along the bottom.
       */}
      {[
        { y: 26, s: 0.9, dur: "150s", delay: "0s", o: 0.5, depth: 0.5 },
        { y: 52, s: 0.62, dur: "115s", delay: "-40s", o: 0.32, depth: 0.65 },
        { y: 16, s: 0.75, dur: "132s", delay: "-70s", o: 0.4, depth: 0.85 },
        { y: 40, s: 1.05, dur: "168s", delay: "-20s", o: 0.45, depth: 0.58 },
        { y: 64, s: 0.85, dur: "142s", delay: "-95s", o: 0.34, depth: 0.95 },
      ]
        .slice(0, clouds)
        .map((c, i) => (
          <g key={i} opacity={c.o} style={{ animation: anim("sky-drift", c.dur, c.delay) }}>
            <g style={{ transform: `translate(0px, ${liftBy(c.y, above, c.depth)}px) scale(${c.s})` }}>
              <Cloud />
            </g>
          </g>
        ))}

      {precipitating &&
        Array.from({ length: 26 }).map((_, i) => (
          <line
            key={i}
            x1={(i * 37) % VIEW_W}
            y1={liftBy(0, above, (i % 7) / 7)}
            x2={(i * 37) % VIEW_W - (weather?.sky === "snow" ? 0 : 3)}
            y2={liftBy(weather?.sky === "snow" ? 3 : 9, above, (i % 7) / 7)}
            stroke="var(--sky-rain)"
            strokeWidth={weather?.sky === "snow" ? 1.6 : 1}
            strokeLinecap="round"
            opacity="0.5"
            style={{
              animation: reduced
                ? undefined
                : `sky-fall ${weather?.sky === "snow" ? 6 : 1.6}s linear ${-(i % 9) * 0.4}s infinite`,
            }}
          />
        ))}

      {/* The far grass, behind everything that walks through it. */}
      {grounded && <Meadow layer="back" phase={phase} reduced={reduced} above={above} />}

      {cast &&
        phase &&
        CAST[phase].bat &&
        BATS.map((b, i) => (
          <g
            key={i}
            opacity={b.opacity}
            style={
              reduced
                ? { transform: `translateX(${b.restX}px)` }
                : { animation: `sky-bat-path ${b.cross} linear ${b.delay} infinite` }
            }
          >
            <g style={{ transform: `translate(0px, ${liftBy(b.y, above, b.depth)}px) scale(${b.scale})` }}>
              <Bat flap={b.flap} reduced={reduced} />
            </g>
          </g>
        ))}

      {cast &&
        phase &&
        CAST[phase].gull &&
        GULLS.map((g, i) => (
          <g
            key={`gull-${i}`}
            style={
              reduced
                ? { transform: `translateX(${180 + i * 90}px)` }
                : { animation: `sky-fly ${g.cross} linear ${g.delay} infinite` }
            }
            opacity={g.opacity}
          >
            <g style={{ transform: `translate(0px, ${liftBy(g.y, above, g.depth)}px) scale(${g.scale})` }}>
              <g style={{ animation: reduced ? undefined : `sky-bob ${g.flap} ease-in-out infinite` }}>
                <Gull reduced={reduced} flap={g.flap} />
              </g>
            </g>
          </g>
        ))}

      {cast &&
        phase &&
        CAST[phase].crane &&
        CRANES.map((c, i) => (
          <g
            key={`crane-${i}`}
            style={
              reduced
                ? { transform: `translateX(${c.restX}px)` }
                : { animation: `sky-fly ${c.cross} linear ${c.delay} infinite` }
            }
            opacity={c.opacity}
          >
            <g style={{ transform: `translate(0px, ${liftBy(c.y, above, c.depth)}px) scale(${c.scale})` }}>
              <g style={{ animation: reduced ? undefined : `sky-bob ${c.flap} ease-in-out infinite` }}>
                <Crane reduced={reduced} />
              </g>
            </g>
          </g>
        ))}

      {cast && phase && CAST[phase].squirrel && (
        <g style={{ transform: "translate(322px, 104px) scale(0.85)" }}>
          <Squirrel reduced={reduced} />
        </g>
      )}

      {/* The cat's feet reach y+7 at 0.8 scale, which is why the ground sits at
          110 in a 120-tall viewBox — a taller box cropped its legs. */}
      {cast && phase && CAST[phase].cat && (
        <g style={reduced ? { transform: "translateX(200px)" } : { animation: "sky-walk 96s linear infinite" }}>
          <g style={{ transform: "translate(0px, 101px) scale(0.8)" }}>
            <Cat reduced={reduced} />
          </g>
        </g>
      )}

      {/*
       * The near grass, in front of the cast.
       *
       * This replaces the hard 1px ground line that used to run edge to edge.
       * A ruled line is the one thing in the scene that could not exist outside
       * a diagram — it read as a border, not as ground. A fringe of grass hides
       * the horizon and gives the walkers something to walk through.
       */}
      {grounded && <Meadow layer="front" phase={phase} reduced={reduced} above={above} />}
    </svg>
  );
}
