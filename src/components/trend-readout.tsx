"use client";

import { TREND_COLOR } from "@/lib/palette";
import type { TrendPoint } from "@/lib/metrics";

/**
 * What the crosshair is pointing at.
 *
 * Not the shared `Tooltip`: that one wraps a DOM element and follows the
 * pointer into it, while this tracks a *computed* x inside an SVG that has no
 * element per point. It stays inside the chart's own box, so the panel's
 * `overflow: hidden` never clips it.
 */
export function TrendReadout({
  point,
  x,
  flip,
  width,
  top,
  fmtDay,
}: {
  point: TrendPoint;
  x: number;
  /** True once the crosshair is right of centre and the card would overhang. */
  flip: boolean;
  width: number;
  top: number;
  fmtDay: (iso: string) => string;
}) {
  return (
    <div
      role="tooltip"
      aria-live="polite"
      className="pointer-events-none absolute z-20 -translate-y-1/2 rounded-lg border border-[var(--hairline)] bg-[var(--panel)] px-2.5 py-1.5 text-xs shadow-lg"
      style={{
        left: flip ? undefined : x + 12,
        right: flip ? Math.max(0, width - x + 12) : undefined,
        top,
      }}
    >
      <p className="font-semibold text-[var(--ink)]">{fmtDay(point.date)}</p>
      <p className="mt-0.5 flex items-center gap-1.5 text-[var(--ink-2)]">
        <span aria-hidden className="h-2 w-2 rounded-full" style={{ background: TREND_COLOR.raised }} />
        <span className="tnum font-medium">{point.raised}</span> raised
      </p>
      <p className="flex items-center gap-1.5 text-[var(--ink-2)]">
        <span aria-hidden className="h-2 w-2 rounded-full" style={{ background: TREND_COLOR.closed }} />
        <span className="tnum font-medium">{point.closed}</span> closed
      </p>
      <p className="mt-1 text-[10px] text-[var(--ink-muted)]">Click to list what was raised</p>
    </div>
  );
}
