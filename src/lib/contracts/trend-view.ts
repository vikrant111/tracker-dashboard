/**
 * What the closure-trend chart may be sliced by, and over what window.
 *
 * The trend answers a narrower question than the rest of the board: *"how is
 * one kind of bug flowing, over these dates"*. So it carries its own window and
 * its own slice, and neither touches the tiles beside it — picking `Production`
 * here must not quietly re-scope the severity donut.
 *
 * The slices are **derived from `VOCABULARY`**, not written again here. A value
 * added to the board's vocabulary appears in this dropdown with no edit, and a
 * value removed cannot linger as a dead option that returns an empty chart.
 */
import { ENVIRONMENTS, STATUSES } from "../types.ts";

/**
 * The values the board can actually hold, which is the vocabulary **plus
 * `Unknown`** — items whose field did not resolve are kept, not dropped.
 *
 * Built from the raw vocabulary at first, which left a gap: a bug with an
 * unresolved environment appeared in the donut but could not be picked in the
 * chart, and asking for it fell through to "everything". The slices then summed
 * to nearly twice the unsliced chart.
 */
const VALUES: Record<TrendSlice, readonly string[]> = {
  environment: ENVIRONMENTS,
  status: STATUSES,
};

/** The dimensions the trend can be sliced by. Both live in `VOCABULARY`. */
export const TREND_SLICES = ["environment", "status"] as const;
export type TrendSlice = (typeof TREND_SLICES)[number];

/** How far back the chart looks when nobody has picked dates. */
export const TREND_WINDOW = {
  dailyDays: 30,
  weeklyDays: 84,
  /**
   * The widest span still drawn a day at a time.
   *
   * Above this the chart switches to weeks on its own. It used to be a
   * Daily/Weekly toggle, which asked the reader to answer a question the window
   * already answers — 300 daily points is a smear whatever anybody picks, and
   * a fortnight plotted weekly is two columns.
   */
  dailyMaxDays: 60,
  /**
   * The longest stretch the chart will plot, in days.
   *
   * The series builder has its own hard stop at 512 points; this is the honest
   * limit, matching the year of data the board fetches. A wider pick is clamped
   * rather than silently truncated to whatever the guard allowed.
   */
  maxDays: 365,
} as const;

export type TrendFacet = { key: string; label: string; slice: TrendSlice; value: string };

/** The `<select>`'s groups: one per slice, options in the vocabulary's order. */
export function trendFacetGroups(): { slice: TrendSlice; label: string; options: TrendFacet[] }[] {
  return TREND_SLICES.map((slice) => ({
    slice,
    label: slice === "environment" ? "Environment" : "Status",
    options: VALUES[slice].map((value) => ({ key: `${slice}:${value}`, label: value, slice, value })),
  }));
}

/** Every option, flat — what a check iterates and what `splitFacet` is tested against. */
export const trendFacets = (): TrendFacet[] => trendFacetGroups().flatMap((g) => g.options);

/**
 * A facet key back into the query params the server reads.
 *
 * Unknown or malformed keys resolve to `{}` — everything. A key is a round trip
 * through a URL and a `<select>`, and a typo must widen the chart rather than
 * filter it to nothing, which would read as "no bugs" instead of "bad filter".
 */
export function splitFacet(key: string | undefined | null): { environment?: string; status?: string } {
  if (!key) return {};
  const at = String(key).indexOf(":");
  if (at < 1) return {};
  const slice = key.slice(0, at);
  const value = key.slice(at + 1);
  if (!TREND_SLICES.includes(slice as TrendSlice)) return {};
  /*
   * Checked against the vocabulary, not merely parsed. `?trendStatus=<script>`
   * reaching the filter would be harmless to the query but would print in the
   * chart's own subtitle, which is where a reflected value becomes a problem.
   */
  const known = VALUES[slice as TrendSlice].includes(value);
  return known ? { [slice]: value } : {};
}

/** And back the other way, so the control can show what the URL asked for. */
export const facetKey = (f: { environment?: string; status?: string }): string =>
  f.environment ? `environment:${f.environment}` : f.status ? `status:${f.status}` : "";

/** What the chart's subtitle calls the current slice. */
export const facetLabel = (key: string): string =>
  trendFacets().find((f) => f.key === key)?.label ?? "";

/**
 * What the card calls itself.
 *
 * Built here rather than in the component so the chart's claim and the window
 * it actually plotted come from one place — a title still reading "last 30
 * days" over a picked range is the kind of quiet lie a dashboard does not
 * recover from.
 */
export function trendTitle(
  grain: "daily" | "weekly",
  picked: boolean,
  window: { from: string; to: string },
  facetKeyIn: string,
): string {
  /*
   * The *label*, not the key. A key the vocabulary does not know resolves to an
   * empty label, and reading the key for truthiness printed a title that opened
   * with a space where the slice should have been — the unsliced title is what
   * the chart is actually showing in that case, so that is what it says.
   */
  const slice = facetLabel(facetKeyIn);
  const what = slice ? `${slice} raised vs closed` : "Raised vs closed";
  if (picked) return `${what}, ${window.from} to ${window.to}`;
  const days = grain === "daily" ? TREND_WINDOW.dailyDays : TREND_WINDOW.weeklyDays;
  return `${what}, last ${grain === "daily" ? `${days} days` : `${Math.round(days / 7)} weeks`}`;
}

/**
 * Days a week at a time, or a day at a time?
 *
 * Decided from the window rather than asked. A reader choosing "daily" over
 * nine months gets an unreadable smear, and the chart knows the span.
 */
export function grainFor(window: { from: string; to: string }): "daily" | "weekly" {
  const from = Date.parse(`${window?.from}T00:00:00Z`);
  const to = Date.parse(`${window?.to}T00:00:00Z`);
  if (!Number.isFinite(from) || !Number.isFinite(to) || to < from) return "daily";
  return (to - from) / 86_400_000 > TREND_WINDOW.dailyMaxDays ? "weekly" : "daily";
}
