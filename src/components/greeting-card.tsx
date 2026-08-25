"use client";

import { useReducedMotion } from "framer-motion";
import { useEffect, useState } from "react";
import { GREETING, displayName, phaseFor, type Phase } from "@/lib/greeting";
import { moonName, moonPhase } from "@/lib/sky";
import type { Weather } from "@/lib/weather";
import { Sky } from "./greeting";

/**
 * The reader's name over a sky that matches the hour.
 *
 * Separated from `Sky` because they are two components, not one: this owns the
 * clock and the words, that owns the scene. The only thing they share is the
 * phase, which is passed.
 */
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
