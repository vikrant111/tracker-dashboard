"use client";

/**
 * A POD's own breakdown, loaded only once its row is opened.
 *
 * Its own file because it fetches: the roll-up above it already has every
 * number it shows, and this is the one part that goes back to the server.
 */
import { motion } from "framer-motion";
import { ArrowUpRight } from "lucide-react";
import useSWR from "swr";
import type { Dashboard } from "@/lib/metrics";
import { SWR_OPTIONS, fetcher } from "@/lib/swr";
import { ENV_COLOR, SEVERITY_COLOR, ageTint, colorFor } from "@/lib/palette";
import { useDrill } from "./drill-drawer";
import { Tooltip } from "./ui";

/**
 * The row's own breakdown, loaded only once its row is opened. Every chip is a
 * drill-through, so the roll-up reaches individual work items in two clicks.
 */
export function PodDetail({ teamId, name, onSwitch }: { teamId: string; name: string; onSwitch: () => void }) {
  const drill = useDrill();
  const { data, isLoading } = useSWR<Dashboard & { error?: string }>(
    `/api/metrics?teamId=${encodeURIComponent(teamId)}`,
    fetcher,
    SWR_OPTIONS,
  );

  if (isLoading && !data) {
    return (
      <div className="grid gap-3 px-3 py-4 sm:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-20 animate-pulse rounded-xl bg-[var(--wash)]" />
        ))}
      </div>
    );
  }
  if (!data || data.error) {
    return <p className="px-3 py-4 text-xs text-[var(--ink-muted)]">{data?.error ?? "Could not load this POD."}</p>;
  }

  const groups = [
    {
      label: "Severity",
      buckets: data.severity,
      color: (k: string) => SEVERITY_COLOR[k] ?? "var(--ink-muted)",
      query: (k: string) => ({ teamId, severity: k }),
    },
    {
      label: "Environment",
      buckets: data.environment,
      color: (k: string) => ENV_COLOR[k] ?? "var(--ink-muted)",
      query: (k: string) => ({ teamId, environment: k }),
    },
  ];

  return (
    <div className="border-b border-[var(--hairline)] bg-[var(--wash)] px-3 py-4">
      <div className="grid gap-4 lg:grid-cols-[1fr_1fr_1.1fr]">
        {groups.map((g) => (
          <div key={g.label}>
            <p className="eyebrow mb-2">{g.label}</p>
            <div className="flex flex-wrap gap-1.5">
              {g.buckets
                .filter((b) => b.count > 0)
                .map((b) => (
                  <button
                    key={b.key}
                    onClick={() => drill({ title: `${name} — ${b.key}`, subtitle: g.label, query: g.query(b.key) })}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--hairline)] bg-[var(--panel)] px-2 py-1 text-xs transition-all hover:-translate-y-0.5 hover:border-[var(--accent-line)]"
                  >
                    <span aria-hidden className="h-2 w-2 rounded-full" style={{ background: g.color(b.key) }} />
                    <span className="text-[var(--ink-2)]">{b.key}</span>
                    <span className="font-[family-name:var(--font-mono)] font-semibold tnum">{b.count}</span>
                  </button>
                ))}
            </div>
          </div>
        ))}

        <div>
          <p className="eyebrow mb-2">Top assignees</p>
          <div className="flex flex-col gap-1">
            {data.assignees.slice(0, 4).map((a) => (
              <button
                key={a.name}
                onClick={() =>
                  drill({
                    title: `${a.name} — open`,
                    subtitle: `${a.active} open of ${a.total} · ${name}`,
                    query: { teamId, assignee: a.name, activeOnly: "true" },
                  })
                }
                className="group flex items-center justify-between gap-3 rounded-lg px-2 py-1 text-xs transition-colors hover:bg-[var(--wash-2)]"
              >
                <span className="truncate text-[var(--ink-2)]">{a.name}</span>
                <span className="flex shrink-0 items-center gap-2">
                  <span
                    className="font-[family-name:var(--font-mono)] tnum"
                    style={{ color: ageTint(a.avgAgeDays) }}
                  >
                    {a.avgAgeDays}d
                  </span>
                  <span className="font-[family-name:var(--font-mono)] font-semibold tnum">{a.active}</span>
                </span>
              </button>
            ))}
            {data.assignees.length === 0 && <p className="px-2 text-xs text-[var(--ink-muted)]">No assignees yet.</p>}
          </div>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-[var(--hairline)] pt-3">
        <button
          onClick={() => drill({ title: name, subtitle: "every item in this POD", query: { teamId } })}
          className="rounded-lg border border-[var(--hairline)] bg-[var(--panel)] px-2.5 py-1 text-xs font-medium transition-colors hover:border-[var(--accent-line)]"
        >
          All {data.totals.total} items
        </button>
        <button
          onClick={() => drill({ title: `${name} — aged`, subtitle: `open past ${data.thresholdDays} days`, query: { teamId, agedOnly: "true" } })}
          className="rounded-lg border border-[var(--hairline)] bg-[var(--panel)] px-2.5 py-1 text-xs font-medium transition-colors hover:border-[var(--accent-line)]"
        >
          Aged items
        </button>
        <button
          onClick={onSwitch}
          className="ml-auto inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold text-[var(--accent-ink)] transition-colors hover:bg-[var(--accent-tint)]"
        >
          Open this POD's dashboard
          <ArrowUpRight size={13} />
        </button>
      </div>
    </div>
  );
}
