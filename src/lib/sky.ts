/**
 * Where the sun and moon actually are, and what shape the moon actually is.
 *
 * All pure and all client-safe, so `scripts/check-ui.mjs` can exercise it
 * without a browser. Nothing here fetches anything: the positions come from the
 * clock and the moon's phase from the calendar.
 */

export type Body = {
  /** 0 at the eastern horizon, 1 at the western. */
  x: number;
  /** 0 on the horizon, 1 at the zenith. */
  altitude: number;
  up: boolean;
};

/** Civil day boundaries. Fixed rather than latitude-derived — see docs. */
export const SUNRISE = 6;
export const SUNSET = 18;

const clamp01 = (n: number) => (Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0);

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

/** Scene geometry. Lives here, with the maths, so the checks can import it. */
export const VIEW_W = 400;
export const VIEW_H = 120;
export const GROUND = 110;

/**
 * The vertical line the sun and moon rise and set on.
 *
 * Not the centre: a little right of it, clear of the greeting text on the left,
 * and well inside the crop (see below).
 */
export const BODY_X = 224;

/** Where a body sits on the horizon, and at its zenith. */
export const HORIZON_Y = 92;
export const ZENITH_Y = 26;

/** How deep the meadow is in the scene's own frame, ground line to far edge. */
export const MEADOW_DEPTH = 22;

/**
 * The scene stretches when a tall frame adds open sky above it.
 *
 * Everything below scales off `above`, and every one of them is written as
 * `base + above × factor` so that **at `above = 0` the numbers are exactly the
 * card's own**. The card is the reference; only frames that would otherwise
 * leave the scene stranded get changed.
 *
 * Without this the meadow keeps its 22-unit depth however tall the frame gets,
 * so on a full-height background it becomes a thin strip floating in the middle
 * of the screen with flat colour under it — which is what it looked like.
 */
export function meadowDepthFor(above: number): number {
  return MEADOW_DEPTH + Math.max(0, finiteOr(above, 0)) * 0.3;
}

/**
 * Where a body rises and sets, and how high it climbs.
 *
 * Both track the added sky. A fixed zenith would leave the sun stuck near the
 * ground on a tall frame with a screenful of empty sky above it.
 *
 * The low end rises **faster than the meadow does** (0.45 against the ground's
 * 0.30), so the arc's bottom clears the horizon instead of grazing it. Matching
 * the ground exactly is astronomically right and reads wrong: an hour after
 * sunset the moon sat down among the grass.
 */
export function arcBounds(above: number): { horizon: number; zenith: number } {
  const a = Math.max(0, finiteOr(above, 0));
  return { horizon: HORIZON_Y - a * 0.45, zenith: ZENITH_Y - a * 0.88 };
}

/**
 * How far a flyer lifts into the added sky.
 *
 * Bats, the crane and the clouds all carry a fixed `y` authored for a 120-tall
 * scene. Left alone in a 240- or 865-tall frame they cluster in the bottom
 * fifth — which is bats skimming the grass. `depth` is their share of the new
 * sky: 1 puts a flyer near the top, 0 leaves it where it was drawn.
 */
export function liftBy(y: number, above: number, depth: number): number {
  const a = Math.max(0, finiteOr(above, 0));
  return finiteOr(y, 0) - a * clamp01(depth);
}

/**
 * How much of the scene's width survives `preserveAspectRatio="slice"` in a box
 * of the given size, centred on the middle.
 *
 * This is the constraint that drives `BODY_X`. The card is roughly square, and
 * slice fills it by scaling on the *height* — so only the middle strip of a
 * 400-wide scene is ever on screen. On a square card that is x ∈ [140, 260];
 * anything outside is drawn and then cropped away.
 */
/**
 * How much empty sky to add **above** the scene so it fills a box without
 * cropping anything.
 *
 * The scene is a 10:3 strip. Dropped into a tall box you get one of two bad
 * outcomes: `slice` fills it but throws away most of the width — on a 400×398
 * phone band that is 70% of the scene gone, sun included — and `meet` keeps
 * everything but leaves the sky a 120px sliver over 700px of grass.
 *
 * Extending the viewBox upward solves both. The scene keeps its proportions and
 * its full width; the extra is open sky, which is exactly what a portrait
 * landscape has more of. At the card's own aspect this returns 0, so nothing
 * changes where nothing needed changing.
 */
export function skyAbove(width: number, height: number): number {
  const w = Math.max(0, finiteOr(width, 0));
  const h = Math.max(0, finiteOr(height, 0));
  if (w === 0 || h === 0) return 0;
  // The viewBox height that would make the box's aspect match exactly.
  const needed = (VIEW_W * h) / w;
  return Math.max(0, needed - VIEW_H);
}

export function visibleXRange(width: number, height: number): [number, number] {
  const w = Math.max(0, finiteOr(width, 0));
  const h = Math.max(0, finiteOr(height, 0));
  if (w === 0 || h === 0) return [VIEW_W / 2, VIEW_W / 2];
  const scale = Math.max(w / VIEW_W, h / VIEW_H);
  const half = w / scale / 2;
  return [VIEW_W / 2 - half, VIEW_W / 2 + half];
}

const finiteOr = (n: number, fallback: number) => (Number.isFinite(n) ? n : fallback);

/**
 * How much room to leave between a body and the edge of the crop.
 *
 * The disc is r=14 and its glow reaches r=40, so a body sitting on the crop
 * boundary is visibly sliced. This is in scene units, and the crop shrinks fast
 * on a narrow card, so it is also capped as a fraction of what is left.
 */
const BODY_MARGIN = 34;

/**
 * A body's position in the scene.
 *
 * **Only the height changes.** A real sun tracks east to west, and drawing it
 * that way is what put the moon half off the left edge of the page — for most
 * of its time up, a body sweeping the full width is outside the crop entirely.
 *
 * It rises and sets vertically instead, on a fixed line: low at rise and set,
 * high at midday or midnight. That still reads as "early / midday / late",
 * which is the whole job, and it is on screen the entire time.
 *
 * Pass the box the scene is drawn into and the line is pulled inside that box's
 * crop. A fixed `BODY_X` is fine on a desktop card, where 62 units of margin
 * survive — but a phone's card is tall and narrow, `slice` crops it to a strip
 * barely 58 units wide, and 224 lands 4.6 units from the edge with the disc
 * hanging over it. Without a box it falls back to `BODY_X`, which is correct
 * for anything uncropped.
 */
export function placeBody(
  body: Body,
  box?: { width: number; height: number } | null,
  above = 0,
): { cx: number; cy: number } {
  const altitude = clamp01(body?.altitude ?? 0);
  const { horizon, zenith } = arcBounds(above);
  const cy = horizon - altitude * (horizon - zenith);

  if (!box) return { cx: BODY_X, cy };

  const [lo, hi] = visibleXRange(box.width, box.height);
  const span = hi - lo;
  if (!(span > 0)) return { cx: BODY_X, cy };

  // Never eat more than a fifth of the strip from each side, or a very narrow
  // crop would clamp both ways at once and pin the body to dead centre.
  const margin = Math.min(BODY_MARGIN, span * 0.2);
  return { cx: Math.min(hi - margin, Math.max(lo + margin, BODY_X)), cy };
}

// ------------------------------------------------------------------ the moon

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
