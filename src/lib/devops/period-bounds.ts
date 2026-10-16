/**
 * A period, as the two days it covers.
 *
 * `period.ts` holds the rules — what a period is, and whether a date is inside
 * one. This is the one conversion the other direction, for callers that need
 * the ends rather than a test: the closure trend builds its histogram by
 * stepping from the first day to the last.
 *
 * Its own module only because `period.ts` is at the line cap. It is the
 * *only* place the month-end arithmetic is written; doing it again at a call
 * site is how a chart ends up a day short of the filter beside it.
 */
import { cleanPeriod, cleanRange, type DayRange } from "./period.ts";

/**
 * The first and last **day** a period covers, or null for "everything".
 *
 * A period is a prefix (`2026`, `2026-09`, `2026-09-04`) or an explicit
 * range, and `inPeriod` knows how to test a date against either. Some callers
 * need the two ends instead — the closure trend asks its window as a pair of
 * dates, because a histogram is built by stepping from one to the other.
 *
 * This is the only place that turns one into the other. Writing the month-end
 * arithmetic a second time at the call site is how a chart ends up a day short
 * of the filter beside it.
 */
export function periodBounds(period: unknown): DayRange | null {
  const range = cleanRange(period);
  if (range) return range;

  const clean = cleanPeriod(period);
  if (!clean) return null;

  if (clean.length === 10) return { from: clean, to: clean };
  if (clean.length === 7) {
    const [y, m] = clean.split("-").map(Number);
    /* Day 0 of the next month is the last of this one, leap years included. */
    const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
    return { from: `${clean}-01`, to: `${clean}-${String(last).padStart(2, "0")}` };
  }
  return { from: `${clean}-01-01`, to: `${clean}-12-31` };
}
