"use client";

import { AnimatePresence, motion } from "framer-motion";
import { ArrowUpRight, Building2, ChevronRight } from "lucide-react";
import { Fragment, useState } from "react";
import useSWR from "swr";
import type { Dashboard, TeamStat } from "@/lib/metrics";
import { STATUS, SEVERITY_COLOR, ENV_COLOR, ageTint } from "@/lib/palette";
import { SWR_OPTIONS, fetcher } from "@/lib/swr";
import { useDrill } from "./drill-drawer";
import { Empty, Panel, PanelHeader, Tooltip } from "./ui";

export function TeamRollup({
  teams,
  names,
  thresholdDays,
  onPick,
}: {
  teams: TeamStat[];
  names: Record<string, string>;
  thresholdDays: number;
  onPick: (teamId: string) => void;
}) {
  const drill = useDrill();
  const [open, setOpen] = useState<string | null>(null);
  const rows = [...teams].sort((a, b) => b.criticalAged - a.criticalAged || b.active - a.active);
  const maxActive = Math.max(1, ...rows.map((r) => r.active));

  return (
    <Panel className="p-4 sm:p-6" delay={0.15} hue="var(--series-3)">
      <PanelHeader
        eyebrow="Across every POD"
        title="Leadership roll-up"
        hue="var(--series-3)"
        icon={<Building2 size={16} strokeWidth={2.2} />}
        action={
          <span className="text-xs text-[var(--ink-muted)]">
            {rows.length} POD{rows.length === 1 ? "" : "s"} · click a row to expand
          </span>
        }
      />

      {rows.length === 0 ? (
        <Empty title="No PODs with data" hint="Onboard a POD in Admin, then sync it from Azure Boards." />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[620px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-[var(--hairline)] text-left">
                <th className="eyebrow pb-2 font-normal">POD</th>
                <th className="eyebrow pb-2 pl-4 font-normal">Open load</th>
                <th className="eyebrow pb-2 pl-4 text-right font-normal">Active</th>
                <th className="eyebrow pb-2 pl-4 text-right font-normal">Total</th>
                <th className="eyebrow pb-2 pl-4 text-right font-normal">Avg age</th>
                <th className="eyebrow pb-2 pl-4 text-right font-normal">Critical aged</th>
                <th className="pb-2" />
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => {
                const expanded = open === row.teamId;
                const name = names[row.teamId] ?? row.teamId;
                return (
                  <Fragment key={row.teamId}>
                    <motion.tr
                      initial={{ opacity: 0 }}
                      whileInView={{ opacity: 1 }}
                      viewport={{ once: true }}
                      transition={{ delay: i * 0.05 }}
                      onClick={() => setOpen(expanded ? null : row.teamId)}
                      className={`group cursor-pointer border-b border-[var(--hairline)] transition-colors last:border-0 ${
                        expanded ? "bg-[var(--wash)]" : "hover:bg-[var(--wash)]"
                      }`}
                    >
                      <td className="py-3">
                        <span className="flex items-center gap-2">
                          <motion.span
                            animate={{ rotate: expanded ? 90 : 0 }}
                            transition={{ type: "spring", stiffness: 400, damping: 28 }}
                            className="grid h-5 w-5 shrink-0 place-items-center rounded-md text-[var(--ink-muted)] transition-colors group-hover:bg-[var(--wash-2)] group-hover:text-[var(--ink)]"
                          >
                            <ChevronRight size={14} />
                          </motion.span>
                          <span className="font-medium text-[var(--ink)]">{name}</span>
                        </span>
                      </td>
                      <td className="py-3 pl-4">
                        <span className="block h-2 w-full max-w-[160px] overflow-hidden rounded-full bg-[var(--wash-2)]">
                          <motion.span
                            initial={{ width: 0 }}
                            whileInView={{ width: `${(row.active / maxActive) * 100}%` }}
                            viewport={{ once: true }}
                            transition={{ duration: 0.7, delay: i * 0.05 }}
                            className="glow-sm block h-full rounded-full"
                            style={{
                              background: "linear-gradient(90deg, var(--accent-2), var(--series-1))",
                              "--hue": "var(--series-1)",
                            } as React.CSSProperties}
                          />
                        </span>
                      </td>
                      <Cell
                        value={row.active}
                        label={`${name}: ${row.active} of ${row.total} still open. Click to list them.`}
                        color="var(--accent-2)"
                        onClick={() =>
                          drill({ title: `${name} — open`, subtitle: "still open", query: { teamId: row.teamId, activeOnly: "true" } })
                        }
                      />
                      <Cell
                        value={row.total}
                        label={`${name}: ${row.total} tracked in total. Click to list them.`}
                        color="var(--ink-muted)"
                        onClick={() => drill({ title: name, subtitle: "every item in this POD", query: { teamId: row.teamId } })}
                      />
                      <Cell
                        value={`${row.avgAgeDays}d`}
                        label={`${name}: open items average ${row.avgAgeDays} days old. Click for the oldest first.`}
                        color={ageTint(row.avgAgeDays)}
                        onClick={() =>
                          drill({
                            title: `${name} — oldest first`,
                            subtitle: `averaging ${row.avgAgeDays} days`,
                            query: { teamId: row.teamId, activeOnly: "true", sort: "oldest" },
                          })
                        }
                      />
                      <Cell
                        value={row.criticalAged}
                        label={
                          row.criticalAged > 0
                            ? `${name}: ${row.criticalAged} critical open past ${thresholdDays} days. Click to list them.`
                            : `${name}: no criticals aged past ${thresholdDays} days.`
                        }
                        color={row.criticalAged > 0 ? STATUS.critical : "var(--ink-muted)"}
                        onClick={() =>
                          drill({
                            title: `${name} — critical aged`,
                            subtitle: `open past ${thresholdDays} days`,
                            query: { teamId: row.teamId, severity: "Critical", agedOnly: "true" },
                          })
                        }
                      />
                      <td className="py-3 pl-2 text-right">
                        <Tooltip label={`Switch the whole dashboard to ${name}`}>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onPick(row.teamId);
                          }}
                          aria-label={`Switch the dashboard to ${name}`}
                          className="rounded-lg p-1.5 text-[var(--ink-muted)] opacity-0 transition-all hover:bg-[var(--wash-2)] hover:text-[var(--ink)] group-hover:opacity-100"
                        >
                          <ArrowUpRight size={14} />
                        </button>
                        </Tooltip>
                      </td>
                    </motion.tr>

                    <AnimatePresence initial={false}>
                      {expanded && (
                        <tr>
                          <td colSpan={7} className="p-0">
                            <motion.div
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: "auto", opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              transition={{ type: "spring", stiffness: 260, damping: 30 }}
                              className="overflow-hidden"
                            >
                              <PodDetail teamId={row.teamId} name={name} onSwitch={() => onPick(row.teamId)} />
                            </motion.div>
                          </td>
                        </tr>
                      )}
                    </AnimatePresence>
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}

function Cell({
  value,
  color,
  onClick,
  label,
}: {
  value: number | string;
  color: string;
  onClick: () => void;
  /** What this number means, for the tooltip. */
  label: string;
}) {
  return (
    <td className="py-3 pl-4 text-right">
      <Tooltip label={label}>
      <button
        onClick={(e) => {
          e.stopPropagation();
          onClick();
        }}
        className="rounded-md px-2 py-0.5 font-[family-name:var(--font-mono)] font-semibold tnum transition-colors hover:bg-[var(--wash-2)]"
        style={{ color }}
      >
        {value}
      </button>
      </Tooltip>
    </td>
  );
}

/**
 * The row's own breakdown, loaded only once its row is opened. Every chip is a
 * drill-through, so the roll-up reaches individual work items in two clicks.
 */
function PodDetail({ teamId, name, onSwitch }: { teamId: string; name: string; onSwitch: () => void }) {
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
