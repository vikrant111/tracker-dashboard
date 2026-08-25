/**
 * What both halves of the sky need: where a body is, and two clamps.
 *
 * Its own module because neither half owns these — the geometry does not depend
 * on the astronomy, nor the reverse, so making one the owner would invent a
 * dependency that is not there.
 */

/** Where the sun or moon is, in fractions rather than pixels. */
export type Body = {
  /** 0 at the eastern horizon, 1 at the western. */
  x: number;
  /** 0 on the horizon, 1 at the zenith. */
  altitude: number;
  up: boolean;
};

/**
 * Anything not finite becomes 0.
 *
 * A NaN reaching a coordinate does not throw — it renders an invisible element
 * and leaves nothing to debug, which is worse than a crash.
 */
export const clamp01 = (n: number) => (Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0);

/** The same idea where zero is not the right floor. */
export const finiteOr = (n: number, fallback: number) => (Number.isFinite(n) ? n : fallback);
