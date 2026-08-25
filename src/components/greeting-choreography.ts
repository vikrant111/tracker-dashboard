import { SCENE } from "@/lib/constants";
import type { Phase } from "@/lib/greeting";

/**
 * Who is out, and how each of them moves.
 *
 * The *schedule* is `SCENE.cast` in `lib/constants.ts` — a product decision
 * somebody might want to change. The choreography here is animation: how high
 * a bat rides, how long a gull takes to cross, how fast either beats. Both
 * counts are clamped to what is defined, so asking for more draws fewer rather
 * than crashing on an undefined entry.
 */
/** Who is out at which hour — tune it in `SCENE.cast`, not here. */
export const CAST: Record<Phase, { crane: boolean; gull: boolean; squirrel: boolean; cat: boolean; bat: boolean }> = SCENE.cast;

/**
 * The bats' choreography: three distances, slow crossings, and a continuous
 * unhurried beat — no glide holds, because a bat does not soar.
 *
 * This is animation, not a number anybody tunes; **how many** of these to use
 * is `SCENE.bats`. Clamped to what is defined here, so raising that past the
 * choreography draws fewer bats rather than crashing on an undefined entry.
 */
export const CHOREOGRAPHY = [
  { y: 30, scale: 1, cross: "72s", delay: "-6s", flap: "2.2s", opacity: 0.92, restX: 110, depth: 0.7 },
  { y: 50, scale: 0.76, cross: "88s", delay: "-38s", flap: "2.7s", opacity: 0.76, restX: 232, depth: 0.6 },
  { y: 20, scale: 0.58, cross: "104s", delay: "-70s", flap: "3.2s", opacity: 0.6, restX: 318, depth: 0.8 },
];

export const BATS = CHOREOGRAPHY.slice(0, Math.max(0, Math.min(SCENE.bats, CHOREOGRAPHY.length)));

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
export const GULL_PATHS = [
  { y: 30, scale: 0.62, cross: "94s", delay: "-12s", flap: "3.4s", opacity: 0.95, depth: 0.74 },
  { y: 20, scale: 0.46, cross: "106s", delay: "-64s", flap: "4.1s", opacity: 0.8, depth: 0.82 },
];

export const GULLS = GULL_PATHS.slice(0, Math.max(0, Math.min(SCENE.gulls, GULL_PATHS.length)));

/**
 * The cranes' choreography: how high each rides, how fast it crosses, how it beats.
 *
 * A crane is slower and higher than a gull — it does not soar, it works, with a
 * steady beat and a neck held straight out. The second flies further off and
 * therefore smaller, slower to cross and slower to beat, which is the same
 * perspective rule the bats and gulls follow.
 *
 * **How many** of these to use is `SCENE.cranes`.
 */
export const CRANE_PATHS = [
  { y: 26, scale: 0.8, cross: "78s", delay: "-30s", flap: "4.6s", opacity: 1, restX: 250, depth: 0.72 },
  { y: 16, scale: 0.58, cross: "92s", delay: "-58s", flap: "5.4s", opacity: 0.82, restX: 96, depth: 0.8 },
];

export const CRANES = CRANE_PATHS.slice(0, Math.max(0, Math.min(SCENE.cranes, CRANE_PATHS.length)));

/**
 * How high a single crane rides in a frame that gained open sky.
 *
 * Kept because the checks measure it by name; the same number now leads
 * `CRANE_PATHS`, and that is the one the scene reads.
 */
export const CRANE_DEPTH = CRANE_PATHS[0].depth;

/** How much cloud each condition puts in the sky — tune it in `SCENE.clouds`. */
export const CLOUD_COUNT: Record<string, number> = SCENE.clouds;
export const CLOUDS_UNKNOWN = SCENE.clouds.unknown;
