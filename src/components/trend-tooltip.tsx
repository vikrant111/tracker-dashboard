"use client";

/**
 * The hover card on the closure trend, and the legend under it.
 *
 * Lifted out of `trend-chart` when the chart gained its own filter row. Both
 * pieces are pure presentation of one point, and the chart was long before
 * they were in it.
 */
import type { TrendPoint } from "@/lib/metrics";
import { STATUS_INK, TREND_COLOR } from "@/lib/palette";

const SERIES = ["raised", "closed"] as const;

/** A swatch and a word — identity never rests on colour alone. */
const Swatch = ({ series }: { series: (typeof SERIES)[number] }) => (
  <span aria-hidden className="h-2 w-2 rounded-full" style={{ background: TREND_COLOR[series] }} />
);

export function TrendTooltip({
  point,
  left,
  top,
  label,
}: {
  point: TrendPoint;
  left: number;
  top: number;
  label: string;
}) {
  return (
    <div
      className="pointer-events-none absolute z-10 rounded-xl border border-[var(--hairline)] bg-[var(--panel)]/95 px-3 py-2 text-xs shadow-xl backdrop-blur-md"
      style={{ left, top }}
    >
      <p className="font-medium text-[var(--ink)]">{label}</p>
      {SERIES.map((key) => (
        <p key={key} className="mt-1 flex items-center gap-2 text-[var(--ink-2)]">
          <Swatch series={key} />
          <span className="capitalize">{key}</span>
          <span className="ml-auto font-[family-name:var(--font-mono)] tnum">{point[key]}</span>
        </p>
      ))}
      {/*
        * The net, said rather than left to be subtracted. It is the number the
        * card is really about, and two counts side by side do not give it
        * without arithmetic the reader should not have to do.
        */}
      <p
        className="mt-1.5 flex items-center gap-2 border-t border-[var(--hairline)] pt-1.5"
        style={{ color: point.closed - point.raised >= 0 ? STATUS_INK.good : STATUS_INK.serious }}
      >
        <span>Net</span>
        <span className="ml-auto font-[family-name:var(--font-mono)] tnum">
          {point.closed - point.raised > 0 ? "+" : ""}
          {point.closed - point.raised}
        </span>
      </p>
    </div>
  );
}

export function TrendLegend() {
  return (
    <div className="mt-3 flex items-center gap-4 border-t border-[var(--hairline)] pt-3">
      {SERIES.map((key) => (
        <span key={key} className="inline-flex items-center gap-1.5 text-[11px] text-[var(--ink-2)] capitalize">
          <Swatch series={key} />
          {key}
        </span>
      ))}
    </div>
  );
}
