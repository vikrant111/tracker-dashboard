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
