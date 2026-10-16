"use client";

/**
 * Saturdays and Sundays, shaded behind the curves.
 *
 * The daily series has a sawtooth in it that looks like a problem and is not:
 * nothing is raised at the weekend. Without the bands a reader spends the
 * first look explaining the dips to themselves, and ageing on this board is
 * counted Mon–Fri for the same reason.
 *
 * Only on the daily grain. A weekly bucket contains a weekend by definition,
 * so shading there would mean nothing.
 */
const WEEKEND = new Set([0, 6]);

export function TrendWeekends({
  points,
  x,
  top,
  height,
  grain,
}: {
  points: { date: string }[];
  x: (i: number) => number;
  top: number;
  height: number;
  grain: "daily" | "weekly";
}) {
  if (grain !== "daily" || points.length < 2) return null;

  const step = (x(points.length - 1) - x(0)) / (points.length - 1);

  return (
    <>
      {points.map((p, i) => {
        const at = new Date(`${p.date}T00:00:00Z`);
        if (Number.isNaN(at.getTime()) || !WEEKEND.has(at.getUTCDay())) return null;
        return (
          <rect
            key={`we-${p.date}`}
            x={x(i) - step / 2}
            y={top}
            width={step}
            height={height}
            fill="var(--ink)"
            opacity={0.04}
          />
        );
      })}
    </>
  );
}
