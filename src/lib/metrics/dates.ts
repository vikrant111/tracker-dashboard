/**
 * Date windows, resolved to absolute epoch millis.
 *
 * Never `now-7d` date math. OpenSearch wraps a range containing `now` in a
 * query that throws inside a filter aggregation — intermittently, depending on
 * segment state — and it took the whole dashboard down when it hit. Absolute
 * bounds sidestep it, and are cacheable besides.
 */
export const DAY_MS = 86_400_000;

/**
 * Date windows are resolved to absolute epoch millis here rather than sent as
 * `now-7d` date math.
 *
 * OpenSearch wraps a range containing `now` in DateRangeIncludingNowQuery, which
 * does not implement createWeight — inside a filter aggregation that throws
 * `unsupported_operation_exception`, intermittently, depending on segment state.
 * It took down the whole dashboard when it hit. Absolute bounds sidestep it, and
 * are cacheable besides.
 */
export const daysAgo = (now: number, days: number) => now - days * DAY_MS;

/** Equivalent of date math's `/d` rounding: floor to UTC midnight. */
export const floorDay = (ms: number) => Math.floor(ms / DAY_MS) * DAY_MS;

/** Equivalent of `/w`: floor to Monday UTC, matching calendar_interval week buckets. */
export const floorWeek = (ms: number) => {
  const day = Math.floor(ms / DAY_MS);
  return (day - ((day + 3) % 7)) * DAY_MS; // epoch day 0 was a Thursday
};

/**
 * Age in days of an open item, evaluated at query time so it never goes stale.
 * Floored at zero: a future-dated item (a bad import, a clock skew) would
 * otherwise contribute a negative age and drag the average below reality.
 */
export const ageScript = (now: number) => ({
  source:
    "if (doc['createdDate'].size() == 0) { return 0; } " +
    "double d = (params.now - doc['createdDate'].value.toInstant().toEpochMilli()) / 86400000.0; " +
    "return d < 0 ? 0 : d;",
  params: { now },
});

/* ------------------------------------------------------- working days ----
 *
 * Ageing is counted in working days, Monday to Friday. A bug raised on a
 * Friday afternoon is one working day old on Monday, not three — and a
 * turnaround of "1 day" for a Critical means nothing otherwise.
 *
 * Everything below works in whole UTC days, and `businessDaysAgo` and
 * `businessDaysBetween` are **exact inverses by construction**: an item
 * created at `businessDaysAgo(now, n)` is `n` working days old at `now`. That
 * is not a nicety. A bar and the drawer it opens are the same question asked
 * through a cutoff and through a count, and if the two disagree by a day the
 * drawer holds a row the bar did not.
 */

/** 1970-01-01 was a Thursday; 0 = Sunday … 6 = Saturday. */
const EPOCH_DOW = 4;

const dayNumber = (ms: number) => Math.floor(ms / DAY_MS);
const isWeekend = (day: number) => {
  const dow = ((day + EPOCH_DOW) % 7 + 7) % 7;
  return dow === 0 || dow === 6;
};

/** Working days in `[0, day)`. Closed form for the weeks, a short loop for the rest. */
function workdaysBefore(day: number): number {
  const weeks = Math.floor(day / 7);
  let count = weeks * 5;
  for (let d = weeks * 7; d < day; d++) if (!isWeekend(d)) count++;
  return count;
}

/**
 * Working days between two instants, counting the start day and not the end
 * one — so Friday to Monday is 1, and any Saturday to the Sunday after it is 0.
 */
export function businessDaysBetween(start: number, end: number): number {
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return 0;
  return Math.max(0, workdaysBefore(dayNumber(end)) - workdaysBefore(dayNumber(start)));
}

/**
 * The instant `n` working days before `now`, keeping the time of day.
 *
 * Steps back a day at a time and only counts the ones that are not a weekend,
 * which is what makes it the exact inverse of the count above. `n` is capped,
 * because a hand-edited threshold of a million would otherwise spin here.
 */
export function businessDaysAgo(now: number, n: number): number {
  const wanted = Math.min(Math.max(0, Math.trunc(Number(n) || 0)), 20_000);
  const timeOfDay = now - dayNumber(now) * DAY_MS;
  let day = dayNumber(now);
  for (let left = wanted; left > 0; ) {
    day -= 1;
    if (!isWeekend(day)) left -= 1;
  }
  return day * DAY_MS + timeOfDay;
}
