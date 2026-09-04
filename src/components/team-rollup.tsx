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
import { Cell } from "./team-rollup-cell";
import { PodDetail } from "./team-rollup-detail";

export function TeamRollup({
  teams,
  names,
  onPick,
}: {
  teams: TeamStat[];
  names: Record<string, string>;
  /* No board-wide threshold here on purpose — each row carries its own, because
     the PODs being compared are exactly the ones allowed to disagree. */
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
                            ? `${name}: ${row.criticalAged} critical open past ${row.criticalThresholdDays} days. Click to list them.`
                            : `${name}: no criticals aged past ${row.criticalThresholdDays} days.`
                        }
                        color={row.criticalAged > 0 ? STATUS.critical : "var(--ink-muted)"}
                        onClick={() =>
                          drill({
                            title: `${name} — critical aged`,
                            subtitle: `open past ${row.criticalThresholdDays} days`,
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
