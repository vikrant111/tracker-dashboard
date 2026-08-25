"use client";

import { motion } from "framer-motion";
import { AlertTriangle, ArrowUpRight, Search, Trophy, X } from "lucide-react";
import type { AssigneeStat } from "@/lib/metrics";
import { SEVERITY_COLOR, ageTint } from "@/lib/palette";
import { useDrill } from "./drill-drawer";
import { Empty, Panel, PanelHeader, SegmentedControl, Tooltip } from "./ui";
import { useState } from "react";

type SortKey = "total" | "aged" | "critical";
import { Legend, LoadBar } from "./leaderboard-load-bar";

/**
 * `metric` is what the rank is computed from *and* what the row shows large.
 * Ranking by one number while displaying another makes a correctly sorted list
 * look broken — which is exactly what happened when every row showed `total`.
 */
const SORTS: {
  key: SortKey;
  label: string;
  describe: string;
  unit: string;
  /** The drill must return the figure the row displays, which changes with the sort. */
  query: (name: string) => Record<string, string>;
}[] = [
  { key: "total", label: "Volume", describe: "most work items", unit: "items", query: (assignee) => ({ assignee }) },
  {
    key: "aged",
    label: "Ageing",
    describe: "most items past the ageing threshold",
    unit: "aged",
    query: (assignee) => ({ assignee, agedOnly: "true" }),
  },
  {
    key: "critical",
    label: "Critical",
    describe: "most open critical items",
    unit: "critical",
    query: (assignee) => ({ assignee, severity: "Critical", activeOnly: "true" }),
  },
];

const RANK_GLOW = ["var(--rank-1)", "var(--rank-2)", "var(--rank-3)"];

/**
 * The signature panel: who is carrying what. Each row is a high-score line —
 * rank, name, an open-items load bar split by severity, and their ageing tint.
 * Everything on it is clickable through to the underlying work items.
 */
/** Roughly six and a half rows, so the seventh peeks and the list reads as scrollable. */
const LIST_MAX_HEIGHT = "26rem";

export function Leaderboard({ assignees, thresholdDays }: { assignees: AssigneeStat[]; thresholdDays: number }) {
  const [sort, setSort] = useState<SortKey>("total");
  const [query, setQuery] = useState("");
  const drill = useDrill();

  // Rank the whole list, then filter — so a searched person keeps the rank they
  // actually hold on the board rather than being renumbered 01 by the filter.
  const ranked = [...assignees].sort((a, b) => b[sort] - a[sort] || b.total - a.total);
  const needle = query.trim().toLowerCase();
  const shown = needle ? ranked.filter((p) => p.name.toLowerCase().includes(needle)) : ranked;
  const max = Math.max(1, ...ranked.map((r) => r.total));
  const active = SORTS.find((s) => s.key === sort)!;

  return (
    <Panel className="p-4 sm:p-6" delay={0.05} hue="var(--accent-2)">
      <PanelHeader
        eyebrow="Top assignees"
        title="Who is holding the board"
        hue="var(--accent-2)"
        icon={<Trophy size={16} strokeWidth={2.2} />}
        action={
          <SegmentedControl
            groupId="leaderboard-sort"
            value={sort}
            onChange={setSort}
            options={SORTS.map((s) => ({ key: s.key, label: s.label }))}
          />
        }
      />

      <p className="-mt-3 mb-3 text-xs text-[var(--ink-muted)]">
        Ranked by {active.describe}. Bar shows open items by severity; aged means open more than {thresholdDays} days.
      </p>

      <div className="relative mb-3">
        <Search
          size={14}
          aria-hidden
          className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-[var(--ink-muted)]"
        />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Find a person…"
          aria-label="Filter assignees by name"
          className="!py-1.5 !pl-9 text-sm"
        />
        {query && (
          <button
            onClick={() => setQuery("")}
            aria-label="Clear the filter"
            className="absolute top-1/2 right-2 -translate-y-1/2 rounded-md p-1 text-[var(--ink-muted)] hover:bg-[var(--wash-2)] hover:text-[var(--ink)]"
          >
            <X size={13} />
          </button>
        )}
      </div>

      {ranked.length === 0 ? (
        <Empty title="No assignees yet" hint="Sync a POD from Azure Boards or upload a spreadsheet to populate this." />
      ) : shown.length === 0 ? (
        <Empty title="Nobody matches" hint={`No assignee's name contains "${query.trim()}".`} />
      ) : (
        <ol
          className="flex flex-col gap-1 overflow-y-auto pr-1"
          style={{ maxHeight: LIST_MAX_HEIGHT, scrollbarGutter: "stable" }}
        >
          {shown.map((person, i) => {
            const rank = ranked.indexOf(person);
            return (
            <motion.li
              key={person.name}
              layout
              initial={{ opacity: 0, x: -12 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: Math.min(i, 8) * 0.045, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
            >
              <button
                onClick={() =>
                  drill({
                    title: `${person.name} — ${active.unit}`,
                    subtitle: `${person[sort]} ${active.unit} · ${person.active} open of ${person.total}`,
                    query: active.query(person.name),
                  })
                }
                className="group grid w-full grid-cols-[1.75rem_minmax(0,1fr)_auto] items-center gap-2 rounded-xl border border-transparent px-1.5 py-2.5 text-left transition-all duration-200 hover:translate-x-0.5 hover:border-[var(--hairline)] hover:bg-[var(--wash)] sm:grid-cols-[2.25rem_minmax(0,1fr)_auto] sm:gap-3 sm:px-2.5"
              >
                <span
                  className={`grid h-8 w-8 place-items-center rounded-xl font-[family-name:var(--font-mono)] text-xs font-bold tnum transition-transform duration-200 group-hover:scale-110 ${rank < 3 ? "glow-sm" : ""}`}
                  style={
                    rank < 3
                      ? ({
                          color: RANK_GLOW[rank],
                          background: `color-mix(in srgb, ${RANK_GLOW[rank]} 20%, transparent)`,
                          "--hue": RANK_GLOW[rank],
                        } as React.CSSProperties)
                      : { color: "var(--ink-muted)", background: "var(--wash)" }
                  }
                >
                  {String(rank + 1).padStart(2, "0")}
                </span>

                <span className="min-w-0">
                  <span className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium text-[var(--ink)]">{person.name}</span>
                    {person.designation && (
                      <span className="hidden shrink-0 truncate text-[11px] text-[var(--ink-muted)] sm:inline">
                        {person.designation}
                      </span>
                    )}
                    {person.critical > 0 && (
                      <span className="inline-flex shrink-0 items-center gap-1 rounded-md bg-[var(--danger-tint)] px-1.5 py-0.5 text-[10px] font-semibold text-[var(--danger-ink)]">
                        <AlertTriangle size={10} aria-hidden />
                        {person.critical} critical
                      </span>
                    )}
                    {/*
                     * On the POD but carrying nothing. Said plainly, because the
                     * alternative — leaving them off the board entirely — reads
                     * as "adding the member didn't work", which is exactly how
                     * it was reported.
                     */}
                    {person.onRosterOnly && (
                      <span className="shrink-0 rounded-md bg-[var(--wash-2)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--ink-muted)]">
                        nothing open
                      </span>
                    )}
                  </span>
                  <LoadBar person={person} max={max} />
                </span>

                <span className="flex items-center gap-2 text-right">
                  <span>
                    {/* The figure shown is the one the list is ranked by. */}
                    <span className="block font-[family-name:var(--font-mono)] text-lg leading-none font-bold tnum">
                      {person[sort]}
                      <span className="ml-1 text-[10px] font-medium text-[var(--ink-muted)]">{active.unit}</span>
                    </span>
                    <span className="mt-1 block font-[family-name:var(--font-mono)] text-[11px] tnum text-[var(--ink-muted)]">
                      {sort === "total" ? `${person.active} open` : `${person.total} total`}
                      <span className="mx-1 opacity-50">·</span>
                      <span style={{ color: ageTint(person.avgAgeDays) }}>{person.avgAgeDays}d</span>
                    </span>
                  </span>
                  <ArrowUpRight
                    size={14}
                    className="shrink-0 text-[var(--ink-muted)] opacity-0 transition-all duration-200 group-hover:translate-x-0.5 group-hover:opacity-100"
                  />
                </span>
              </button>
            </motion.li>
            );
          })}
        </ol>
      )}

      {shown.length > 0 && (
        <p className="mt-2 text-[11px] text-[var(--ink-muted)]">
          {needle
            ? `${shown.length} of ${ranked.length} people`
            : `${ranked.length} people · scroll for the rest`}
        </p>
      )}

      <Legend />
    </Panel>
  );
}
