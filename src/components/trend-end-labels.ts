import type { TrendPoint } from "@/lib/metrics";

/** A line of text, so two labels never touch. */
const MIN_GAP = 13;

/**
 * Where each series' name goes at the right-hand end of the chart.
 *
 * Both sit on their own last value, unless that would put them within a line of
 * each other — then they are pushed apart. Left alone they printed on top of
 * one another, which happens often: a quiet week ends both series at zero.
 *
 * The pair is moved **as a unit** when it would leave the plot. Clamping each
 * label separately looked right and was not: with both series at zero, the
 * lower one hit the floor while the upper one stayed put, and the gap the nudge
 * had just opened collapsed back to a few pixels.
 */
export function endLabelPositions({
  points,
  y,
  top,
  bottom,
}: {
  points: TrendPoint[];
  y: (value: number) => number;
  /** The highest a label may sit, in SVG units. */
  top: number;
  /** The lowest. */
  bottom: number;
}): { key: "raised" | "closed"; y: number }[] {
  const last = points[points.length - 1];
  if (!last) return [];

  const rows = (["raised", "closed"] as const)
    .map((key) => ({ key, y: y(last[key]) + 3.5 }))
    .sort((a, b) => a.y - b.y);

  if (rows.length === 2 && rows[1].y - rows[0].y < MIN_GAP) {
    const middle = (rows[0].y + rows[1].y) / 2;
    rows[0].y = middle - MIN_GAP / 2;
    rows[1].y = middle + MIN_GAP / 2;
  }

  /*
   * Slide the whole group back inside, keeping the spacing. Only if the group
   * is taller than the plot does anything get squashed, and then there is no
   * arrangement that would have worked anyway.
   */
  const highest = rows[0].y;
  const lowest = rows[rows.length - 1].y;
  const shift = highest < top ? top - highest : lowest > bottom ? bottom - lowest : 0;
  for (const row of rows) row.y += shift;

  // A last resort, for a plot too short to hold both.
  for (const row of rows) row.y = Math.max(top, Math.min(row.y, bottom));

  return rows;
}
