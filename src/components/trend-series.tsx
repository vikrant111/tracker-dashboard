"use client";

/**
 * The two curves themselves: a gradient area under each line, and the line.
 *
 * Lifted out of `trend-chart` when the chart gained its own filter row. Pure
 * marks — the geometry is handed in, so this knows nothing about windows,
 * slices or hover.
 */
import { motion } from "framer-motion";
import { TREND_COLOR } from "@/lib/palette";
import type { TrendPoint } from "@/lib/metrics";

const SERIES = ["raised", "closed"] as const;

export function TrendSeries({
  points,
  x,
  y,
  baseline,
}: {
  points: TrendPoint[];
  x: (i: number) => number;
  y: (v: number) => number;
  /** The y of the plot floor, where each area closes. */
  baseline: number;
}) {
  const path = (key: (typeof SERIES)[number]) =>
    points.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p[key]).toFixed(1)}`).join(" ");

  return (
    <>
      <defs>
        {SERIES.map((key) => (
          <linearGradient key={key} id={`fill-${key}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={TREND_COLOR[key]} stopOpacity={0.32} />
            <stop offset="100%" stopColor={TREND_COLOR[key]} stopOpacity={0} />
          </linearGradient>
        ))}
      </defs>

      {/* Area under each line, so the chart carries weight rather than two hairlines. */}
      {SERIES.map((key, si) => (
        <motion.path
          key={`area-${key}`}
          d={`${path(key)} L${x(points.length - 1).toFixed(1)},${baseline.toFixed(1)} L${x(0).toFixed(1)},${baseline.toFixed(1)} Z`}
          fill={`url(#fill-${key})`}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.9, delay: 0.5 + si * 0.15 }}
        />
      ))}

      {SERIES.map((key, si) => (
        <motion.path
          key={key}
          d={path(key)}
          fill="none"
          stroke={TREND_COLOR[key]}
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          initial={{ pathLength: 0, opacity: 0 }}
          animate={{ pathLength: 1, opacity: 1 }}
          transition={{ duration: 1.1, delay: si * 0.15, ease: [0.22, 1, 0.36, 1] }}
        />
      ))}
    </>
  );
}
