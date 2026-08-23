"use client";

import { useReducedMotion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { GREETING, displayName, phaseFor, type Phase } from "@/lib/greeting";
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

/**
 * A small sky above the reader's name, filling the gap the health card used to
 * leave empty.
 *
 * The sun and moon are placed from the actual clock — a half-sine from rise to
 * set — so a 19:00 sun sits low on the western horizon instead of blazing
 * overhead, and the moon takes over when the sun is down wearing tonight's real
 * phase. Weather is drawn only when configured; it is never invented.
 */
export function Greeting({ name, weather }: { name: string; weather: Weather | null }) {
  const reduced = useReducedMotion();
  // The clock is only knowable on the client. Rendering it during SSR would give
  // a server-time sky that then hydrated into a different one, so it starts null.
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    const read = () => setNow(new Date());
    read();
    const id = setInterval(read, 60_000);
    return () => clearInterval(id);
  }, []);

  const phase = now ? phaseFor(now.getHours()) : null;
  const who = displayName(name);

  /*
   * Ink follows the **sky**, not the app theme.
   *
   * The scene is theme-independent — an afternoon card is bright in dark mode
   * too — so text colour cannot come from the theme either, or pale dark-mode
   * ink would sit on a pale afternoon sky and vanish. Night is the one phase
   * whose gradient is dark enough to need it.
   */
  const ink = phase === "night" ? "var(--sky-ink-night)" : "var(--sky-ink)";
  const ink2 = phase === "night" ? "var(--sky-ink-night-2)" : "var(--sky-ink-2)";

  return (
    <section
      aria-label={`${phase ? GREETING[phase] : "Hello"}, ${who}`}
      className="relative shrink-0 overflow-hidden rounded-2xl border border-[var(--hairline)]"
      style={{
        background: phase
          ? `linear-gradient(to bottom, var(--sky-${phase}-1), var(--sky-${phase}-2))`
          : "linear-gradient(to bottom, var(--sky-morning-1), var(--sky-morning-2))",
        minHeight: "clamp(8rem, 26vw, 10.5rem)",
        transition: "background 1200ms var(--ease)",
      }}
    >
      <Sky now={now} phase={phase} weather={weather} reduced={!!reduced} />

      {/* Anything crossing behind the text is dimmed by this, so a walking cat
          never reads as scribble through the greeting. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-[5]"
        style={{
          background: `linear-gradient(to right, var(--sky-${phase ?? "morning"}-2) 12%, transparent 62%)`,
          opacity: 0.82,
        }}
      />

      {/* Centred, not bottom-aligned. Pinned to the floor of the card the text
          sat under the horizon and read as an afterthought; the greeting is the
          point of the card, so it holds the middle of it. */}
      <div className="relative z-10 flex h-full flex-col justify-center p-4 sm:p-5">
        <p className="eyebrow" style={{ color: ink2 }}>
          {phase ? GREETING[phase] : " "}
        </p>
        <p
          className="mt-1 font-[family-name:var(--font-display)] text-[clamp(1.25rem,5.5vw,1.5rem)] leading-tight font-bold tracking-tight"
          style={{ color: ink }}
        >
          Hi, {who}
        </p>
        <p className="mt-1 text-xs" style={{ color: ink2 }}>
          {now ? caption(phase, weather, now) : " "}
        </p>
      </div>
    </section>
  );
}

/** What the line under the name says. Weather only appears when it is real. */
function caption(phase: Phase | null, weather: Weather | null, now: Date): string {
  if (weather) {
    const moon = phase === "night" || phase === "evening" ? ` · ${moonName(moonPhase(now)).toLowerCase()}` : "";
    return `${weather.label}, ${weather.temperature}°${moon}`;
  }
  if (phase === "night") return `${moonName(moonPhase(now))} tonight.`;
  if (phase === "evening") return "Winding down — here is where things stand.";
  return "Here is where the board stands today.";
}

/** Who is out at which hour — tune it in `SCENE.cast`, not here. */
const CAST: Record<Phase, { crane: boolean; gull: boolean; squirrel: boolean; cat: boolean; bat: boolean }> = SCENE.cast;

/**
 * The bats' choreography: three distances, slow crossings, and a continuous
 * unhurried beat — no glide holds, because a bat does not soar.
 *
 * This is animation, not a number anybody tunes; **how many** of these to use
 * is `SCENE.bats`. Clamped to what is defined here, so raising that past the
 * choreography draws fewer bats rather than crashing on an undefined entry.
 */
const CHOREOGRAPHY = [
  { y: 30, scale: 1, cross: "72s", delay: "-6s", flap: "2.2s", opacity: 0.92, restX: 110, depth: 0.7 },
  { y: 50, scale: 0.76, cross: "88s", delay: "-38s", flap: "2.7s", opacity: 0.76, restX: 232, depth: 0.6 },
  { y: 20, scale: 0.58, cross: "104s", delay: "-70s", flap: "3.2s", opacity: 0.6, restX: 318, depth: 0.8 },
];

const BATS = CHOREOGRAPHY.slice(0, Math.max(0, Math.min(SCENE.bats, CHOREOGRAPHY.length)));

/**
 * The gulls' choreography: distance, crossing time and wingbeat.
 *
 * Two of them at different depths, crossing at different speeds, because a
 * single bird in an empty sky reads as a mistake and two read as weather. The
 * further one is smaller, slower to cross and slower to beat — the same
 * perspective rule the bats follow.
 *
 * **How many** of these to use is `SCENE.gulls`.
 */
const GULL_PATHS = [
  { y: 30, scale: 0.62, cross: "94s", delay: "-12s", flap: "3.4s", opacity: 0.95, depth: 0.74 },
  { y: 20, scale: 0.46, cross: "106s", delay: "-64s", flap: "4.1s", opacity: 0.8, depth: 0.82 },
];

const GULLS = GULL_PATHS.slice(0, Math.max(0, Math.min(SCENE.gulls, GULL_PATHS.length)));

/** How high the crane rides in a frame that gained open sky. */
const CRANE_DEPTH = 0.72;

/** How much cloud each condition puts in the sky — tune it in `SCENE.clouds`. */
const CLOUD_COUNT: Record<string, number> = SCENE.clouds;
const CLOUDS_UNKNOWN = SCENE.clouds.unknown;

/**
 * Measures an element, so the scene knows how much of itself is actually on
 * screen. `slice` crops a tall narrow card to a strip barely 58 units wide, and
 * the sun has to be pulled inside that strip or it is drawn with its disc
 * hanging over the edge.
 */
function useBox(ref: React.RefObject<SVGSVGElement | null>) {
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

      {cast && phase && CAST[phase].crane && (
        <g style={reduced ? { transform: "translateX(250px)" } : { animation: "sky-fly 78s linear -30s infinite" }}>
          <g style={{ transform: `translate(0px, ${liftBy(26, above, CRANE_DEPTH)}px) scale(0.8)` }}>
            <g style={{ animation: reduced ? undefined : "sky-bob 4.6s ease-in-out infinite" }}>
              <Crane reduced={reduced} />
            </g>
          </g>
        </g>
      )}

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
