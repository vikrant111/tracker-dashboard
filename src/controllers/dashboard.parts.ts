/**
 * The pieces the board is assembled from.
 *
 * Split out so `dashboard.aggregate.ts` reads as a list of what the board shows
 * rather than a wall of loops — and so both stay a length a person reads in one
 * sitting. Everything here is pure.
 */
import { floorDay, floorWeek } from "../lib/metrics/dates.ts";
import type { Bucket } from "../lib/metrics/types.ts";
import type { ItemDoc } from "../db/models/index.ts";
import { AGEING_KEYS } from "../db/query/stages.ts";
import { isoDay } from "./dashboard.shape.ts";

/** A date on a document, as epoch millis, or null when it is unusable. */
export const at = (d: Date | string | null | undefined): number | null => {
  if (!d) return null;
  const date = d instanceof Date ? d : new Date(d);
  const t = date.getTime();
  return Number.isNaN(t) ? null : t;
};

/** Count by a key, biggest first — the shape every breakdown panel takes. */
export function tally(items: ItemDoc[], pick: (i: ItemDoc) => string): Bucket[] {
  const counts = new Map<string, number>();
  for (const item of items) {
    const key = pick(item) || "Unknown";
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
}

/** Which ageing bar an open item falls in. Lower inclusive, upper exclusive. */
export function ageingKey(created: number, bounds: { d3: number; d7: number; d14: number; d30: number }): string {
  if (created >= bounds.d3) return AGEING_KEYS[0];
  if (created >= bounds.d7) return AGEING_KEYS[1];
  if (created >= bounds.d14) return AGEING_KEYS[2];
  if (created >= bounds.d30) return AGEING_KEYS[3];
  return AGEING_KEYS[4];
}

/** Monday-start weeks, matching what the charts have always drawn. */
export const truncate = (t: number, unit: "day" | "week") => (unit === "day" ? floorDay(t) : floorWeek(t));

export function histogram(items: ItemDoc[], field: "createdDate" | "closedDate", unit: "day" | "week", from: number): Bucket[] {
  const counts = new Map<string, number>();
  for (const item of items) {
    const t = at(item[field]);
    if (t === null || t < from) continue;
    const key = isoDay(new Date(truncate(t, unit)));
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()].map(([key, count]) => ({ key, count }));
}

