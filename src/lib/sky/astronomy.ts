/** Where the sun and moon actually are, and what phase the moon wears. */

/** Civil day boundaries. Fixed rather than latitude-derived — see docs. */
import { clamp01, type Body } from "./base.ts";

export const SUNRISE = 6;
export const SUNSET = 18;

/** Hours past midnight, as a fraction. */
export function hourOf(date: Date): number {
  const h = date.getHours() + date.getMinutes() / 60;
  return Number.isFinite(h) ? h : 0;
}

/**
 * A body traces a half-sine from its rise to its set: on the horizon at both
 * ends, highest in the middle. That is what makes a low evening sun sit low
 * rather than blazing overhead at 19:00, which is what it used to do.
 */
function arc(t: number): Body {
  const x = clamp01(t);
  return { x, altitude: clamp01(Math.sin(Math.PI * x)), up: true };
}

const BELOW: Body = { x: 0, altitude: 0, up: false };

export function skyBodies(date: Date): { sun: Body; moon: Body } {
  const h = hourOf(date);
  const dayLength = SUNSET - SUNRISE;
  const nightLength = 24 - dayLength;

  const sunUp = h >= SUNRISE && h < SUNSET;
  const sun = sunUp ? arc((h - SUNRISE) / dayLength) : BELOW;

  // The moon holds the sky whenever the sun does not, rising in the east as the
  // sun sets and crossing through the night.
  const sinceSunset = h >= SUNSET ? h - SUNSET : h + (24 - SUNSET);
  const moon = sunUp ? BELOW : arc(sinceSunset / nightLength);

  return { sun, moon };
}

// --------------------------------------------------------------- the drawing

/** Mean length of a lunation, in days. */
export const SYNODIC_MONTH = 29.530588853;

/** A known new moon: 2000-01-06 18:14 UTC. */
const KNOWN_NEW_MOON = Date.UTC(2000, 0, 6, 18, 14);

/** Position in the current lunation: 0 and 1 are new, 0.5 is full. */
export function moonPhase(date: Date): number {
  const t = date.getTime();
  if (!Number.isFinite(t)) return 0;
  const days = (t - KNOWN_NEW_MOON) / 86_400_000;
  const cycles = days / SYNODIC_MONTH;
  return ((cycles % 1) + 1) % 1;
}

/** Fraction of the disc that is lit: 0 at new, 1 at full. */
export function illumination(phase: number): number {
  return clamp01((1 - Math.cos(2 * Math.PI * phase)) / 2);
}

export const MOON_NAMES = [
  "New moon",
  "Waxing crescent",
  "First quarter",
  "Waxing gibbous",
  "Full moon",
  "Waning gibbous",
  "Last quarter",
  "Waning crescent",
] as const;

/** The eighth of the cycle this date falls in, named. */
export function moonName(phase: number): (typeof MOON_NAMES)[number] {
  const i = Math.round((((phase % 1) + 1) % 1) * 8) % 8;
  return MOON_NAMES[i];
}

/**
 * The shadow laid over a full disc to leave the right shape behind.
 *
 * The terminator — the line between lit and unlit — is the projection of a
 * circle, so it reads as an ellipse whose width shrinks to nothing at the
 * quarters and grows back to a full circle at new and full. Building the shadow
 * from one semicircle plus that ellipse gives every phase from one path.
 *
 * Returns null at full moon, when there is no shadow to draw.
 */
export function moonShadowPath(radius: number, phase: number): string | null {
  if (!Number.isFinite(radius) || radius <= 0) return null;
  const r = radius;

  const p = (((phase % 1) + 1) % 1);
  const lit = illumination(p);
  if (lit >= 0.999) return null;

  // Waxing means light on the right, so the shadow sits on the left.
  const waxing = p < 0.5;
  // Rounded, because float noise otherwise writes the quarter-moon terminator as
  // `1.1e-14` — legal SVG, but an exponent no path parser should have to meet.
  // At exactly 0 the arc degenerates to a straight line, which is the truth.
  const rx = round(Math.abs(1 - 2 * lit) * r);

  // Outer edge: the dark limb, swept the long way round.
  const outerSweep = waxing ? 0 : 1;
  // Terminator: bulges away from the lit side before the quarter, towards it after.
  const innerSweep = lit < 0.5 ? outerSweep : 1 - outerSweep;

  return (
    `M 0 ${-r} ` +
    `A ${r} ${r} 0 0 ${outerSweep} 0 ${r} ` +
    `A ${rx} ${r} 0 0 ${innerSweep} 0 ${-r} Z`
  );
}

const round = (n: number) => Math.round(n * 1000) / 1000;
