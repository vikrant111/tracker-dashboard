"use client";

/**
 * Net per bucket — closed minus raised — as a strip under the curves.
 *
 * The two lines say how many came in and how many went out. Whether the
 * backlog *grew* is the difference between them, and reading that off two
 * curves across thirty points is work a chart should do for the reader.
 *
 * A strip of its own rather than a third line: net is a signed quantity around
 * zero, and drawing it against the same axis as two counts would put the
 * zero-line in a different place for every window. It shares the x scale, so a
 * column here sits exactly under the day it belongs to — the small-multiple
 * answer to "two measures, one timeline", never a second y-axis.
 */
import { STATUS } from "@/lib/palette";
import type { TrendPoint } from "@/lib/metrics";

/** Tall enough to read a direction, short enough not to rival the chart. */
const H = 42;
const MID = H / 2;

export function TrendNet({
  points,
  x,
  width,
  hover,
}: {
  points: TrendPoint[];
  x: (i: number) => number;
  width: number;
  hover: number | null;
}) {
  if (!points.length || width <= 0) return null;

  const worst = Math.max(1, ...points.map((p) => Math.abs(p.closed - p.raised)));
  /* Half the strip per direction, with a pixel kept so a net of ±1 is visible. */
  const h = (net: number) => Math.max(1, (Math.abs(net) / worst) * (MID - 3));
  const step = points.length > 1 ? (x(points.length - 1) - x(0)) / (points.length - 1) : 8;
  const barW = Math.max(1.5, Math.min(14, step * 0.6));

  return (
    <svg width="100%" height={H} role="img" aria-label="Net closed minus raised, per bucket" className="block">
      {/* Zero: the line the whole strip is read against. */}
      <line x1={x(0)} x2={x(points.length - 1)} y1={MID} y2={MID} stroke="var(--hairline)" strokeWidth={1} />

      {points.map((p, i) => {
        const net = p.closed - p.raised;
        if (net === 0) return null;
        const height = h(net);
        return (
          <rect
            key={p.date}
            x={x(i) - barW / 2}
            y={net > 0 ? MID - height : MID}
            width={barW}
            height={height}
            rx={1.5}
            fill={net > 0 ? STATUS.good : STATUS.serious}
            opacity={hover == null || hover === i ? 0.85 : 0.35}
          />
        );
      })}
    </svg>
  );
}
