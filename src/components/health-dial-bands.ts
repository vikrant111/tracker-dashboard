import { STATUS } from "@/lib/palette";

/**
 * What each score means, and the geometry of the ring that shows it.
 *
 * Worst first, so `find` returns the band a score actually falls in rather
 * than the first one it is merely above.
 */
export const SIZE = 200;
export const STROKE = 16;
export const R = (SIZE - STROKE) / 2;
export const C = 2 * Math.PI * R;

/**
 * Ignore pointer maths within this fraction of the radius — the angle near the
 * centre is pure noise. A fraction rather than a pixel count, because the dial
 * is fluid and a fixed 28px would swallow most of it on a phone.
 */
export const DEAD_ZONE_RATIO = 0.28;

export type Band = { min: number; label: string; color: string };

/** Worst first, so the first match wins. */
export const BANDS: Band[] = [
  { min: 85, label: "Holding steady", color: STATUS.good },
  { min: 65, label: "Some drag", color: STATUS.warning },
  { min: 40, label: "Falling behind", color: STATUS.serious },
  { min: 0, label: "Needs a triage day", color: STATUS.critical },
];

export const bandFor = (score: number): Band => BANDS.find((b) => score >= b.min)!;

export const clamp = (n: number) => (Number.isFinite(n) ? Math.min(100, Math.max(0, n)) : 0);
