"use client";

/**
 * The horizontal gridlines and their labels.
 *
 * Recessive on purpose: a gridline that competes with the data is a gridline
 * drawn wrong. One axis only — never two y-scales, which is the single most
 * common way a chart lies about a comparison.
 */
export function TrendAxis({
  ticks,
  y,
  padLeft,
  innerW,
}: {
  ticks: number[];
  y: (value: number) => number;
  padLeft: number;
  innerW: number;
}) {
  return (
    <>
            {ticks.map((t) => (
              <g key={t}>
                <line
                  x1={padLeft}
                  x2={padLeft + innerW}
                  y1={y(t)}
                  y2={y(t)}
                  stroke="var(--grid)"
                  strokeWidth={1}
                />
                <text
                  x={padLeft - 8}
                  y={y(t) + 3.5}
                  textAnchor="end"
                  className="font-[family-name:var(--font-mono)] tnum"
                  fontSize={10}
                  fill="var(--ink-muted)"
                >
                  {t}
                </text>
              </g>
            ))}
    </>
  );
}
