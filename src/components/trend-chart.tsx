"use client";

import { motion } from "framer-motion";
import { TrendingUp } from "lucide-react";
import { useState } from "react";
import { TrendReadout } from "./trend-readout";
import { endLabelPositions } from "./trend-end-labels";
import { TrendAxis } from "./trend-axis";
import { useWidth } from "./use-width";
import type { TrendPoint } from "@/lib/metrics";
import { STATUS, TREND_COLOR } from "@/lib/palette";
import { useDrill } from "./drill-drawer";
import { Empty, Panel, PanelHeader, SegmentedControl } from "./ui";
const fmtDay = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });

const PAD = { top: 18, right: 56, bottom: 26, left: 34 };
const HEIGHT = 250;

/**
 * Raised vs closed over time. One y-axis — never two — so the two counts stay
 * directly comparable. Both series carry a direct end-label as well as the
 * legend, so identity never rests on colour alone.
 */
export function TrendChart({ daily, weekly }: { daily: TrendPoint[]; weekly: TrendPoint[] }) {
  const [grain, setGrain] = useState<"daily" | "weekly">("daily");
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
  const path = (key: "raised" | "closed") =>
    points.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p[key]).toFixed(1)}`).join(" ");

  const endLabels = endLabelPositions({ points, y, top: PAD.top + 4, bottom: PAD.top + innerH });

  const ticks = [0, niceMax / 4, niceMax / 2, (niceMax * 3) / 4, niceMax];
  const totalRaised = points.reduce((n, p) => n + p.raised, 0);
  const totalClosed = points.reduce((n, p) => n + p.closed, 0);
  const net = totalClosed - totalRaised;

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
        title={grain === "daily" ? "Raised vs closed, last 30 days" : "Raised vs closed, last 12 weeks"}
        icon={<TrendingUp size={16} strokeWidth={2.2} />}
        hue="var(--series-1)"
        action={
          <SegmentedControl
            groupId="trend-grain"
            value={grain}
            onChange={setGrain}
            options={[
              { key: "daily" as const, label: "Daily" },
              { key: "weekly" as const, label: "Weekly" },
            ]}
          />
        }
      />

      <p className="-mt-3 mb-3 text-xs text-[var(--ink-muted)]">
        {totalRaised} raised, {totalClosed} closed —{" "}
        <span style={{ color: net >= 0 ? STATUS.good : STATUS.serious }}>
          {net >= 0 ? `net ${net} ahead` : `net ${Math.abs(net)} behind`}
        </span>
      </p>

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
            <TrendAxis ticks={ticks} y={y} padLeft={PAD.left} innerW={innerW} />

            <defs>
              {(["raised", "closed"] as const).map((key) => (
                <linearGradient key={key} id={`fill-${key}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={TREND_COLOR[key]} stopOpacity={0.32} />
                  <stop offset="100%" stopColor={TREND_COLOR[key]} stopOpacity={0} />
                </linearGradient>
              ))}
            </defs>

            {/* Area under each line, so the chart carries weight rather than two hairlines. */}
            {(["raised", "closed"] as const).map((key, si) => (
              <motion.path
                key={`area-${key}`}
                d={`${path(key)} L${x(points.length - 1).toFixed(1)},${(PAD.top + innerH).toFixed(1)} L${x(0).toFixed(1)},${(PAD.top + innerH).toFixed(1)} Z`}
                fill={`url(#fill-${key})`}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.9, delay: 0.5 + si * 0.15 }}
              />
            ))}

            {(["raised", "closed"] as const).map((key, si) => (
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
                    query: { createdFrom: start.toISOString(), createdTo: end.toISOString() },
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

          {hover != null && (
            <div
              className="pointer-events-none absolute z-10 rounded-xl border border-[var(--hairline)] bg-[var(--panel)]/95 px-3 py-2 text-xs shadow-xl backdrop-blur-md"
              style={{
                left: Math.min(Math.max(x(hover) - 60, 0), Math.max(0, width - 130)),
                top: PAD.top,
              }}
            >
              <p className="font-medium text-[var(--ink)]">{fmtDay(points[hover].date)}</p>
              {(["raised", "closed"] as const).map((key) => (
                <p key={key} className="mt-1 flex items-center gap-2 text-[var(--ink-2)]">
                  <span
                    aria-hidden
                    className="h-2 w-2 rounded-full"
                    style={{ background: TREND_COLOR[key] }}
                  />
                  <span className="capitalize">{key}</span>
                  <span className="ml-auto font-[family-name:var(--font-mono)] tnum">{points[hover][key]}</span>
                </p>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="mt-3 flex items-center gap-4 border-t border-[var(--hairline)] pt-3">
        {(["raised", "closed"] as const).map((key) => (
          <span key={key} className="inline-flex items-center gap-1.5 text-[11px] text-[var(--ink-2)] capitalize">
            <span aria-hidden className="h-2 w-2 rounded-full" style={{ background: TREND_COLOR[key] }} />
            {key}
          </span>
        ))}
      </div>
    </Panel>
  );
}
