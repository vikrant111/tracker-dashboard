"use client";

import { TrendingUp } from "lucide-react";
import { useState } from "react";
import { TrendReadout } from "./trend-readout";
import { endLabelPositions } from "./trend-end-labels";
import { TrendAxis } from "./trend-axis";
import { useWidth } from "./use-width";
import type { TrendPoint } from "@/lib/metrics";
import { TrendControls } from "./trend-controls";
import { grainFor, splitFacet, trendTitle } from "@/lib/contracts/trend-view";
import { TREND_COLOR } from "@/lib/palette";
import { useDrill } from "./drill-drawer";
import { Empty, Panel, PanelHeader } from "./ui";
import { TrendLegend, TrendTooltip } from "./trend-tooltip";
import { TrendSeries } from "./trend-series";
import { TrendHeadline } from "./trend-headline";
import { TrendNet } from "./trend-net";
import { TrendWeekends } from "./trend-weekends";
import { trendStats } from "@/lib/metrics/trend-stats";
const fmtDay = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });

const PAD = { top: 18, right: 56, bottom: 26, left: 34 };
const HEIGHT = 250;

/**
 * Raised vs closed over time. One y-axis — never two — so the two counts stay
 * directly comparable. Both series carry a direct end-label as well as the
 * legend, so identity never rests on colour alone.
 */
export function TrendChart({
  daily,
  weekly,
  window: plotted,
  controls,
}: {
  daily: TrendPoint[];
  weekly: TrendPoint[];
  /** The window the server actually plotted, after clamping. */
  window: { from: string; to: string; clipped: boolean };
  controls: React.ComponentProps<typeof TrendControls>;
}) {
  /*
   * The grain follows the window rather than a toggle. A Daily/Weekly control
   * asked the reader to answer a question the dates already answer — nine
   * months of daily points is a smear, and a fortnight of weekly ones is two
   * columns.
   */
  const grain = grainFor(plotted);
  const [hover, setHover] = useState<number | null>(null);
  const [ref, width] = useWidth<HTMLDivElement>();
  const drill = useDrill();

  const points = grain === "daily" ? daily : weekly;
  const innerW = Math.max(120, width - PAD.left - PAD.right);
  const innerH = HEIGHT - PAD.top - PAD.bottom;

  const max = Math.max(4, ...points.flatMap((p) => [p.raised, p.closed]));
  const niceMax = Math.ceil(max / 4) * 4;

  const x = (i: number) => PAD.left + (points.length <= 1 ? innerW / 2 : (i / (points.length - 1)) * innerW);
  const y = (v: number) => PAD.top + innerH - (v / niceMax) * innerH;
  const endLabels = endLabelPositions({ points, y, top: PAD.top + 4, bottom: PAD.top + innerH });

  const ticks = [0, niceMax / 4, niceMax / 2, (niceMax * 3) / 4, niceMax];
  /* Derived from the points on screen, so the headline cannot disagree with
     the curve under it. */
  const stats = trendStats(points);
  const { raised: totalRaised, closed: totalClosed, net } = stats;
  const unit = grain === "daily" ? "day" : "week";

  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const rel = e.clientX - rect.left - PAD.left;
    const i = Math.round((rel / innerW) * (points.length - 1));
    setHover(i >= 0 && i < points.length ? i : null);
  };

  return (
    <Panel className="p-4 sm:p-6" delay={0.1} hue="var(--series-1)">
      <PanelHeader
        eyebrow="Closure trend"
        title={trendTitle(grain, Boolean(controls.period), plotted, controls.facet)}
        icon={<TrendingUp size={16} strokeWidth={2.2} />}
        hue="var(--series-1)"
        action={<TrendControls {...controls} />}
      />

      <TrendHeadline
        stats={stats}
        unit={unit}
        clipped={plotted.clipped}
        fmtDay={fmtDay}
        empty={points.length === 0}
      />

      {points.length === 0 ? (
        <Empty title="No trend yet" hint="Once items have created and closed dates, the curve appears here." />
      ) : (
        <div ref={ref} className="relative">
          {hover != null && points[hover] && (
            <TrendReadout
              point={points[hover]}
              x={x(hover)}
              flip={hover > points.length / 2}
              width={width}
              top={PAD.top + innerH / 2}
              fmtDay={fmtDay}
            />
          )}
          <svg
            width="100%"
            height={HEIGHT}
            onPointerMove={onMove}
            onPointerLeave={() => setHover(null)}
            role="img"
            aria-label={`Raised versus closed, ${grain}. ${totalRaised} raised and ${totalClosed} closed in the window.`}
          >
            {/* Behind everything: nothing is raised at the weekend, and the
                sawtooth that causes looks like a problem until it is shaded. */}
            <TrendWeekends points={points} x={x} top={PAD.top} height={innerH} grain={grain} />

            <TrendAxis ticks={ticks} y={y} padLeft={PAD.left} innerW={innerW} />

            <TrendSeries points={points} x={x} y={y} baseline={PAD.top + innerH} />

            {/*
              * Direct end-labels: identity without reading the legend.
              *
              * Nudged apart when the two series finish at the same value —
              * which is common, because a quiet week ends both at zero. Left
              * alone they printed on top of each other and neither was legible.
              */}
            {endLabels.map(({ key, y: labelY }) => {
              return (
                <text
                  key={key}
                  x={x(points.length - 1) + 8}
                  y={labelY}
                  fontSize={11}
                  fill={TREND_COLOR[key]}
                  className="font-medium"
                >
                  {key === "raised" ? "Raised" : "Closed"}
                </text>
              );
            })}

            {/* The newest point keeps a soft pulse, so the eye lands on "now". */}
            {points.length > 0 &&
              (["raised", "closed"] as const).map((key) => (
                <circle
                  key={`live-${key}`}
                  cx={x(points.length - 1)}
                  cy={y(points[points.length - 1][key])}
                  r={4}
                  fill={TREND_COLOR[key]}
                  stroke="var(--surface)"
                  strokeWidth={2}
                  style={{ animation: "pulse-ring 2.8s ease-in-out infinite", transformOrigin: "center" }}
                />
              ))}

            {hover != null && (
              <g>
                <line
                  x1={x(hover)}
                  x2={x(hover)}
                  y1={PAD.top}
                  y2={PAD.top + innerH}
                  stroke="var(--ink-muted)"
                  strokeWidth={1}
                  strokeDasharray="3 3"
                />
                {(["raised", "closed"] as const).map((key) => (
                  <circle
                    key={key}
                    cx={x(hover)}
                    cy={y(points[hover][key])}
                    r={5}
                    fill={TREND_COLOR[key]}
                    stroke="var(--surface)"
                    strokeWidth={2}
                  />
                ))}
              </g>
            )}

            {/* One hit target per point, so any day or week opens its items. */}
            {points.map((p, i) => (
              <rect
                key={`hit-${p.date}`}
                x={x(i) - innerW / Math.max(1, points.length - 1) / 2}
                y={PAD.top}
                width={innerW / Math.max(1, points.length - 1)}
                height={innerH}
                fill="transparent"
                className="cursor-pointer"
                onClick={() => {
                  // Exact bucket bounds, so the drawer returns precisely the
                  // number this point plots. The list is what was *raised* in
                  // the window, which is why the subtitle says only that.
                  const start = new Date(p.date);
                  const end = new Date(start.getTime() + (grain === "daily" ? 1 : 7) * 86400000);
                  drill({
                    title: `Raised on ${fmtDay(p.date)}`,
                    subtitle: `${p.raised} raised · ${p.closed} closed that ${grain === "daily" ? "day" : "week"}`,
                    /*
                     * The chart's slice, re-stated as a real filter. The trend
                     * narrows itself without touching the board, so without
                     * this the drawer would list every environment's bugs for
                     * that day while the point plotted only one.
                     */
                    query: {
                      ...splitFacet(controls.facet),
                      createdFrom: start.toISOString(),
                      createdTo: end.toISOString(),
                    },
                  });
                }}
              />
            ))}

            {points.map((p, i) =>
              i % Math.ceil(points.length / 6) === 0 ? (
                <text
                  key={p.date}
                  x={x(i)}
                  y={HEIGHT - 6}
                  textAnchor="middle"
                  fontSize={10}
                  fill="var(--ink-muted)"
                  className="font-[family-name:var(--font-mono)] tnum"
                >
                  {fmtDay(p.date)}
                </text>
              ) : null,
            )}
          </svg>

          {/*
            * Net per bucket, under the curves and on the same x scale. The two
            * lines say how many in and how many out; whether the backlog grew
            * is the difference, and reading that off two curves is work the
            * chart should do.
            */}
          <TrendNet points={points} x={x} width={width} hover={hover} />
          <p className="mt-0.5 text-[10px] text-[var(--ink-muted)]">Net closed − raised, per {unit}</p>

          {hover != null && (
            <TrendTooltip
              point={points[hover]}
              label={fmtDay(points[hover].date)}
              left={Math.min(Math.max(x(hover) - 60, 0), Math.max(0, width - 130))}
              top={PAD.top}
            />
          )}
        </div>
      )}

      <TrendLegend />
    </Panel>
  );
}
