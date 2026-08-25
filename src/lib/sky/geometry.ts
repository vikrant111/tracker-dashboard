/**
 * The scene's coordinate system, and how it stretches into a taller frame.
 *
 * A viewBox of 400×120 whatever the element's real size, so everything below is
 * in those units. A frame taller than the card gains sky above the horizon —
 * `above` — and the meadow, the arc and everything that flies each rise into it
 * by their own fraction, which is what keeps the depth from flattening.
 */
/** Scene geometry. Lives here, with the maths, so the checks can import it. */
import { clamp01, finiteOr, type Body } from "./base.ts";

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
