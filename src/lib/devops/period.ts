/**
 * Filtering and deleting by day, month or year.
 *
 * Every date on this board is stored as `YYYY-MM-DD`, which makes all three the
 * same operation: a string prefix. `2026` is a year, `2026-09` is a month,
 * `2026-09-04` is a day, and none of them needs date arithmetic or a timezone.
 *
 * Pure, so the checks exercise the rule the API and the calendar both use.
 */

export const PERIOD_GRAINS = ["year", "month", "day"] as const;
export type PeriodGrain = (typeof PERIOD_GRAINS)[number];

/**
 * The longest a period or a range can be, before anything looks at it.
 *
 * A period is 10 characters and a range is 22. Everything here arrives from a
 * query string, so the cap is applied **before** the trim rather than after —
 * the point is to not walk a megabyte of somebody else's text at all, and
 * `String(value).trim()` has already walked it by the time a later check could
 * refuse it.
 */
export const MAX_PERIOD_CHARS = 32;

/**
 * What separates the two ends of a range: `2026-09-01..2026-09-30`.
 *
 * `..` rather than a dash, because every date on this board already contains
 * dashes and `2026-09-01-2026-09-30` is not something anybody can read — or
 * parse without guessing where the middle is.
 */
export const RANGE_SEP = "..";

export type DayRange = { from: string; to: string };

/**
 * A `from..to` range of days, or null when the value is not one.
 *
 * Both ends are **days**. A range of months would be two ways of saying the
 * same thing — `2026-09..2026-10` is `2026-09-01..2026-10-31` — and two
 * spellings of one filter is how a screen and a download start disagreeing.
 *
 * A backwards range is **swapped, not refused**. Somebody who clicks the 30th
 * and then the 1st has said what they mean perfectly clearly, and answering
 * that with nothing reads as "there is no data" rather than "you clicked in an
 * order I did not like".
 */
export function cleanRange(value: unknown): DayRange | null {
  const raw = String(value ?? "").slice(0, MAX_PERIOD_CHARS).trim();
  const at = raw.indexOf(RANGE_SEP);
  if (at < 0) return null;

  const day = (part: string) => {
    const clean = cleanPeriod(part.trim());
    // Days only — a month on one end would make the range mean two things.
    return clean.length === 10 ? clean : "";
  };

  const a = day(raw.slice(0, at));
  const b = day(raw.slice(at + RANGE_SEP.length));
  if (!a || !b) return null;

  return a <= b ? { from: a, to: b } : { from: b, to: a };
}

/** A range, as it is stored and put in a URL. */
export const rangeToSpan = (range: DayRange): string => `${range.from}${RANGE_SEP}${range.to}`;

/**
 * A **span**: a period prefix or a day range, cleaned. `""` when neither.
 *
 * The one function every caller that accepts either should use. `cleanPeriod`
 * stays exactly what it was — a prefix, strictly — because widening it would
 * quietly widen `grainOf` and everything built on it.
 */
export function cleanSpan(value: unknown): string {
  const range = cleanRange(value);
  return range ? rangeToSpan(range) : cleanPeriod(value);
}

/**
 * A period prefix, or "" when the input is not one.
 *
 * Deliberately strict. This value decides what a **delete** matches, and a
 * loose parse there is the difference between clearing September and clearing
 * everything — `2026-9` must not quietly become `2026`, matching a whole year.
 */
export function cleanPeriod(value: unknown): string {
  const raw = String(value ?? "").slice(0, MAX_PERIOD_CHARS).trim();
  if (/^\d{4}$/.test(raw)) return raw;
  if (/^\d{4}-\d{2}$/.test(raw)) return Number(raw.slice(5, 7)) >= 1 && Number(raw.slice(5, 7)) <= 12 ? raw : "";

  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    // Shape is not enough: 2026-02-31 matches and is not a day.
    const at = new Date(`${raw}T00:00:00Z`);
    return Number.isNaN(at.getTime()) || at.toISOString().slice(0, 10) !== raw ? "" : raw;
  }
  return "";
}

/** Which grain a period is. `null` when it is not a period at all. */
export function grainOf(period: unknown): PeriodGrain | null {
  const clean = cleanPeriod(period);
  if (clean.length === 4) return "year";
  if (clean.length === 7) return "month";
  if (clean.length === 10) return "day";
  return null;
}

/**
 * Does this date fall in this period?
 *
 * An **empty period matches nothing**, not everything. That asymmetry is
 * deliberate and it is a safety rule: this function backs a delete, and a blank
 * filter meaning "all" would turn a missing parameter into "delete the lot".
 * Callers that want everything say so themselves.
 */
export function inPeriod(date: unknown, period: unknown): boolean {
  const day = String(date ?? "").slice(0, 10);
  if (!day) return false;

  /*
   * A range first, because a range is not a prefix and `cleanPeriod` would
   * answer "" for one — which, under the rule above, means "matches nothing".
   * Every caller gets ranges from this one branch: the report's filter, the
   * calendar's highlighting and the purge all ask this same question.
   */
  const range = cleanRange(period);
  if (range) return day >= range.from && day <= range.to;

  const clean = cleanPeriod(period);
  if (!clean) return false;

  // A prefix has to end on a boundary, or `2026-0` would match `2026-09`.
  return day === clean || day.startsWith(`${clean}-`);
}

/** How a period reads to a person, for a confirmation nobody should misread. */
export function describePeriod(period: unknown): string {
  /*
   * A range reads as its two ends. One day at both ends is written once —
   * "8 September 2026 – 8 September 2026" is a sentence nobody says.
   */
  const range = cleanRange(period);
  if (range) {
    return range.from === range.to
      ? describePeriod(range.from)
      : `${describePeriod(range.from)} – ${describePeriod(range.to)}`;
  }

  const clean = cleanPeriod(period);
  const grain = grainOf(clean);
  if (!grain) return "";

  if (grain === "year") return clean;
  const at = new Date(`${grain === "month" ? `${clean}-01` : clean}T00:00:00Z`);
  return grain === "month"
    ? at.toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" })
    : at.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
}

/**
 * The periods present in a set of dates, newest first.
 *
 * What the calendar highlights and what the "clear a month" list offers, so
 * nobody is shown a month that holds nothing.
 */
export function periodsPresent(dates: (string | undefined)[], grain: PeriodGrain): string[] {
  const width = grain === "year" ? 4 : grain === "month" ? 7 : 10;
  const seen = new Set<string>();

  for (const d of dates) {
    const day = String(d ?? "").slice(0, 10);
    if (cleanPeriod(day)) seen.add(day.slice(0, width));
  }
  return [...seen].sort((a, b) => b.localeCompare(a));
}
