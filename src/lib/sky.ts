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
export * from "./sky/base.ts";
export * from "./sky/geometry.ts";
export * from "./sky/astronomy.ts";
