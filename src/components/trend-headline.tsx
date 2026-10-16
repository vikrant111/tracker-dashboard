"use client";

/**
 * What the closure trend adds up to, in words, above the curves.
 *
 * Two lines say how many came in and how many went out. They do not answer the
 * question the card is opened with — *are we keeping up?* — and a reader was
 * left to eyeball which line sat higher across thirty points.
 *
 * Every number here comes from the points actually plotted, so the headline
 * cannot disagree with the curve under it.
 */
import { STATUS, STATUS_INK } from "@/lib/palette";
import type { TrendStats } from "@/lib/metrics/trend-stats";

export function TrendHeadline({
  stats,
  unit,
  clipped,
  fmtDay,
  empty,
}: {
  stats: TrendStats;
  /** "day" or "week" — the grain the chart settled on. */
  unit: string;
  /** The board's own range is hiding part of the period that was asked for. */
  clipped: boolean;
  fmtDay: (iso: string) => string;
  empty: boolean;
}) {
  const { raised, closed, net } = stats;

  return (
    <>
      <p className="-mt-3 mb-3 text-xs text-[var(--ink-muted)]">
        {raised} raised, {closed} closed —{" "}
        <span style={{ color: net >= 0 ? STATUS.good : STATUS.serious }}>
          {net >= 0 ? `net ${net} ahead` : `net ${Math.abs(net)} behind`}
        </span>
      </p>

      {/*
        * What the two curves add up to. "Are we keeping up" is the question
        * this card is opened with, and it was left to be read off two lines.
        */}
      {!empty && (
        <p className="-mt-2 mb-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[var(--ink-muted)]">
          <span>
            {stats.perBucket} raised a {unit} on average
          </span>
          {stats.busiest && (
            <span>
              · busiest {fmtDay(stats.busiest.date)} ({stats.busiest.raised})
            </span>
          )}
          {stats.streak > 1 && (
            <span style={{ color: STATUS_INK.good }}>
              · {stats.streak} {unit}s running where closing kept up
            </span>
          )}
        </p>
      )}

      {/*
        * Two filters, one of them invisible.
        *
        * The board's own date range narrows the items before this chart ever
        * sees them, so a period outside the chosen quarter draws a flat line —
        * which reads as "no bugs" rather than "you are looking outside the
        * quarter". The counts are right; only the reason for them was missing.
        */}
      {clipped && (
        <p className="-mt-2 mb-3 text-xs" style={{ color: STATUS_INK.warning }}>
          Part of this period sits outside the board&rsquo;s date range, so it is not shown. Widen the range at
          the top of the page to see all of it.
        </p>
      )}

    </>
  );
}
