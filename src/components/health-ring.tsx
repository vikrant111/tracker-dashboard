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
import { HealthEmpty } from "./health-empty";
import type { PodMatch } from "@/controllers/search.controller";
import { healthDrivers } from "./health-drivers";
import { Tooltip } from "./ui";
import { AgeingSpine } from "./ageing-spine";

export function HealthRing({
  data,
  podName,
  userName,
  weather,
  filtered,
  scope,
  onClearFilters,
  ref,
}: {
  data: Dashboard;
  podName: string;
  userName: string;
  weather: Weather | null;
  /** True when a search or filter narrowed the board, rather than it being empty. */
  filtered: boolean;
  /** What was searched, and how this POD matched — so an empty board can say why. */
  scope: { term: string; match: PodMatch | null; others: PodMatch[] };
  /** Clears the search, offered only when something is filtering. */
  onClearFilters?: () => void;
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

  /*
   * Nothing tracked means there is no score, so nothing to draw a ring for.
   *
   * `data.health` is null in exactly that case. Showing 100% instead — which is
   * what this did — put the most reassuring figure on the dashboard over a
   * question that had no answer: a search matching nobody in the selected POD
   * read as a perfect board.
   */
  if (data.health === null) {
    return (
      <HealthEmpty
        ref={ref}
        podName={podName}
        userName={userName}
        weather={weather}
        term={scope.term}
        match={scope.match}
        others={scope.others}
        onClear={filtered ? onClearFilters : undefined}
      />
    );
  }

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
  const drivers = healthDrivers(data);

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
              color: band.ink,
              "--hue": band.color,
            } as React.CSSProperties}
          >
            <ShieldCheck size={12} />
            Board health
          </span>
          <h1 className="mt-2.5 font-[family-name:var(--font-display)] text-[clamp(1.6rem,6vw,2.25rem)] leading-tight font-bold tracking-tight break-words">
            {podName}
          </h1>
          <p className="mt-1 text-base font-semibold" style={{ color: band.ink }}>
            {band.label}
          </p>

          {exploring ? (
            /* While scrubbing, say plainly that this is hypothetical. */
            <p className="mt-3 max-w-xs text-sm leading-relaxed text-[var(--ink-2)]">
              At <span className="font-semibold" style={{ color: band.ink }}>{explored}%</span> the board would read{" "}
              <span className="font-semibold" style={{ color: band.ink }}>{band.label.toLowerCase()}</span>.{" "}
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
