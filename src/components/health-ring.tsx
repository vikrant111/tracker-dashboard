"use client";

import { motion } from "framer-motion";
import { ArrowUpRight, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { AGEING_COLOR, STATUS } from "@/lib/palette";
import type { Dashboard } from "@/lib/metrics";
import { useDrill } from "./drill-drawer";
import { Greeting } from "./greeting";
import type { Weather } from "@/lib/weather";
import { HealthDial, bandFor } from "./health-dial";
import { Tooltip } from "./ui";


export function HealthRing({
  data,
  podName,
  userName,
  weather,
  ref,
}: {
  data: Dashboard;
  podName: string;
  userName: string;
  weather: Weather | null;
  /**
   * The scroll takeover measures this card to know where its sky starts, so the
   * background it grows into begins exactly on this card's edges.
   */
  ref?: React.Ref<HTMLElement>;
}) {
  const drill = useDrill();
  // The scrubbed value while the reader is dragging the dial, else null. It is
  // display-only — nothing downstream of it touches data.
  const [explored, setExplored] = useState<number | null>(null);
  const exploring = explored !== null;
  const band = bandFor(explored ?? data.health);

  /*
   * The three numbers worth knowing about the board — each drills to its items.
   *
   * Only *Still open* moves the score; it is `closed / total`, and nothing else
   * reaches it. The other two are here precisely because the score is blind to
   * them: it says how much work is left, and they say how old and how bad what
   * is left has become. Framing all three as the score's ingredients described
   * the old weighted heuristic and would misdescribe this one.
   */
  const drivers: {
    label: string;
    value: string;
    /** Shown beside the value, so a count that is really a share reads as one. */
    of?: string;
    hue: string;
    query: Record<string, string>;
    hint: string;
  }[] = [
    {
      label: "Critical aged",
      value: String(data.totals.criticalAged),
      hue: STATUS.critical,
      query: { severity: "Critical", agedOnly: "true" },
      hint: `open past ${data.thresholdDays} days`,
    },
    {
      label: "Average age",
      value: `${data.totals.avgAgeDays}d`,
      hue: STATUS.warning,
      query: { activeOnly: "true" },
      hint: "across open items",
    },
    {
      label: "Still open",
      value: String(data.totals.active),
      /*
       * The denominator is the point. `2` next to a score of 55 reads as
       * unexplained; `2 of 360` reads as a board that is nearly clear and
       * losing its points somewhere else — which is what the score means. The
       * share is also what health docks on, so showing one without the other
       * hides the arithmetic.
       */
      of: data.totals.total > 0 ? `of ${data.totals.total}` : undefined,
      hue: "var(--accent-2)",
      query: { activeOnly: "true" },
      hint: `of ${data.totals.total} tracked`,
    },
  ];

  return (
    <motion.section
      ref={ref}
      data-sky-anchor
      initial={{ opacity: 0, y: 26, scale: 0.985 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: "spring", stiffness: 210, damping: 26 }}
      className="glass sheen relative flex h-full flex-col gap-5 overflow-hidden p-4 sm:p-6"
    >
      <span
        aria-hidden
        className="bloom -top-32 -left-28 h-[26rem] w-[26rem]"
        style={{ "--hue": band.color } as React.CSSProperties}
      />

      <div className="flex shrink-0 flex-col items-center gap-5 sm:flex-row sm:items-center sm:gap-6">
        <HealthDial value={data.health} onExplore={setExplored} onDrillLabel="" />

        <div className="min-w-0 flex-1 text-center sm:text-left">
          <span
            className="glow-sm inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold"
            style={{
              background: `color-mix(in srgb, ${band.color} 18%, transparent)`,
              color: band.color,
              "--hue": band.color,
            } as React.CSSProperties}
          >
            <ShieldCheck size={12} />
            Board health
          </span>
          <h1 className="mt-2.5 font-[family-name:var(--font-display)] text-[clamp(1.6rem,6vw,2.25rem)] leading-tight font-bold tracking-tight break-words">
            {podName}
          </h1>
          <p className="mt-1 text-base font-semibold" style={{ color: band.color }}>
            {band.label}
          </p>

          {exploring ? (
            /* While scrubbing, say plainly that this is hypothetical. */
            <p className="mt-3 max-w-xs text-sm leading-relaxed text-[var(--ink-2)]">
              At <span className="font-semibold" style={{ color: band.color }}>{explored}%</span> the board would read{" "}
              <span className="font-semibold" style={{ color: band.color }}>{band.label.toLowerCase()}</span>.{" "}
              <span className="text-[var(--ink-muted)]">Release to return to {data.health}%.</span>
            </p>
          ) : (
            <>
              <p className="mt-3 max-w-xs text-sm leading-relaxed text-[var(--ink-2)]">
                {data.totals.criticalAged > 0
                  ? `${data.totals.criticalAged} critical item${data.totals.criticalAged === 1 ? "" : "s"} open past ${data.thresholdDays} days. Clear those first.`
                  : data.totals.active === 0
                    ? "Nothing open. Enjoy it while it lasts."
                    : `${data.totals.active} of ${data.totals.total} open, averaging ${data.totals.avgAgeDays} days. No aged criticals.`}
              </p>
              <button
                onClick={() =>
                  drill({
                    title: "What is still open",
                    subtitle: `${podName} · health ${data.health}%`,
                    query: { activeOnly: "true" },
                  })
                }
                className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-[var(--accent-ink)] transition-colors hover:text-[var(--accent)]"
              >
                See what is still open
                <ArrowUpRight size={14} />
              </button>
              <p className="mt-2 text-[11px] text-[var(--ink-muted)]">Drag the ring to find each threshold.</p>
            </>
          )}
        </div>
      </div>

      {/* The board at a glance — each one expandable. Only the last moves the score. */}
      <div className="grid shrink-0 grid-cols-3 gap-1.5 border-t border-[var(--hairline)] pt-4 sm:gap-2">
        {drivers.map((d, i) => (
          <motion.button
            key={d.label}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.35 + i * 0.08 }}
            onClick={() => drill({ title: d.label, subtitle: d.hint, query: d.query })}
            className="group rounded-xl px-2 py-2 text-left transition-colors hover:bg-[var(--wash)]"
          >
            <span className="flex items-center gap-1.5">
              <span
                aria-hidden
                className="glow-sm h-2 w-2 shrink-0 rounded-full"
                style={{ background: d.hue, "--hue": d.hue } as React.CSSProperties}
              />
              <span className="truncate text-[11px] text-[var(--ink-muted)]">{d.label}</span>
            </span>
            <span className="mt-1 flex items-baseline gap-1">
              <span
                className="lit font-[family-name:var(--font-display)] text-xl font-bold tnum"
                style={{ "--hue": d.hue } as React.CSSProperties}
              >
                {d.value}
              </span>
              {d.of && <span className="truncate text-[11px] font-semibold text-[var(--ink-muted)] tnum">{d.of}</span>}
              <ArrowUpRight
                size={12}
                className="text-[var(--ink-muted)] opacity-0 transition-opacity group-hover:opacity-100"
              />
            </span>
          </motion.button>
        ))}
      </div>

      <Greeting name={userName} weather={weather} />

      <AgeingSpine data={data} />
    </motion.section>
  );
}

/**
 * How the open work is distributed across the ageing buckets, as one bar.
 * Fills what was dead space at the bottom of the card with the thing the whole
 * board is about, and every segment drills.
 */
function AgeingSpine({ data }: { data: Dashboard }) {
  const drill = useDrill();
  const rows = data.ageing.filter((b) => b.count > 0);
  const total = rows.reduce((n, b) => n + b.count, 0);
  if (!total) return null;

  const QUERY: Record<string, Record<string, string>> = {
    "0-3 days": { activeOnly: "true", maxAgeDays: "3" },
    "4-7 days": { activeOnly: "true", minAgeDays: "3", maxAgeDays: "7" },
    "8-14 days": { activeOnly: "true", minAgeDays: "7", maxAgeDays: "14" },
    "15-30 days": { activeOnly: "true", minAgeDays: "14", maxAgeDays: "30" },
    "30+ days": { activeOnly: "true", minAgeDays: "30" },
  };

  return (
    <div className="mt-auto border-t border-[var(--hairline)] pt-4">
      <div className="mb-2.5 flex items-baseline justify-between">
        <p className="eyebrow">How long the open work has waited</p>
        <span className="font-[family-name:var(--font-mono)] text-[11px] tnum text-[var(--ink-muted)]">
          {total} open
        </span>
      </div>

      <div className="flex h-3 w-full items-stretch gap-[2px] overflow-hidden rounded-full">
        {rows.map((b, i) => (
          <Tooltip key={b.key} label={`${b.count} open item${b.count === 1 ? "" : "s"} aged ${b.key}. Click to list them.`}>
          <motion.button
            initial={{ flexGrow: 0, opacity: 0 }}
            animate={{ flexGrow: b.count, opacity: 1 }}
            transition={{ type: "spring", stiffness: 110, damping: 20, delay: 0.5 + i * 0.06 }}
            onClick={() => drill({ title: b.key, subtitle: "open items by age", query: QUERY[b.key] })}
            aria-label={`${b.key}, ${b.count} open items`}
            className="glow-sm block min-w-[6px] rounded-[3px] transition-transform duration-200 hover:scale-y-150"
            style={
              {
                background: AGEING_COLOR[b.key] ?? "var(--ink-muted)",
                "--hue": AGEING_COLOR[b.key] ?? "var(--ink-muted)",
              } as React.CSSProperties
            }
          />
          </Tooltip>
        ))}
      </div>

      <div className="mt-2.5 flex flex-wrap gap-x-3 gap-y-1">
        {rows.map((b) => (
          <button
            key={b.key}
            onClick={() => drill({ title: b.key, subtitle: "open items by age", query: QUERY[b.key] })}
            className="group inline-flex items-center gap-1.5 rounded-md px-1 py-0.5 text-[11px] transition-colors hover:bg-[var(--wash)]"
          >
            <span
              aria-hidden
              className="h-2 w-2 rounded-full"
              style={{ background: AGEING_COLOR[b.key] ?? "var(--ink-muted)" }}
            />
            <span className="text-[var(--ink-muted)] transition-colors group-hover:text-[var(--ink-2)]">{b.key}</span>
            <span className="font-[family-name:var(--font-mono)] font-semibold tnum text-[var(--ink-2)]">{b.count}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
