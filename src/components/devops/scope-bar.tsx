"use client";

/**
 * The controls above the scope sheet: which repo, which cycle, and a filter.
 *
 * One row, not three. Each of these used to take a full width of its own — the
 * base `width: 100%` on every select was outranking `w-auto` — which pushed the
 * table below the fold and read as three unrelated controls.
 */
import { Lock } from "lucide-react";
import type { Cycle, Repo } from "@/lib/devops/types";
import { BarSelect, TableBar, TableFilter } from "./table-controls";
import { PodsModal } from "./pods-modal";

export function ScopeBar({
  repos,
  cycles,
  repoId,
  cycleId,
  repoName,
  pods,
  query,
  total,
  frozenBecause,
  onRepo,
  onCycle,
  onQuery,
}: {
  repos: Repo[];
  cycles: Cycle[];
  repoId: string;
  cycleId: string;
  /** The chosen repository's name, for the POD dialog's title. */
  repoName: string;
  /** The PODs registered on it — a count here, the names behind it. */
  pods: { id: string; name: string }[];
  query: string;
  total: number;
  /** Why this cycle's scope is frozen, when it is. */
  frozenBecause: string | null;
  onRepo: (id: string) => void;
  onCycle: (id: string) => void;
  onQuery: (q: string) => void;
}) {
  return (
      <TableBar count={`${total} ${total === 1 ? "row" : "rows"}`}>
        <BarSelect label="Repository" value={repoId} onChange={onRepo}>
          {repos.map((r) => (
            <option key={r.id} value={r.id}>{r.name}</option>
          ))}
        </BarSelect>

        <BarSelect label="Cycle" value={cycleId} onChange={onCycle}>
          {cycles.length === 0 && <option value="">No cycles yet</option>}
          {cycles.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
              {c.scope.frozen ? " · frozen" : ""}
            </option>
          ))}
        </BarSelect>

        {/*
          * How many PODs this repository has. A count rather than the names:
          * five chips wrapped the bar onto a second line for a fact most
          * readers only want the shape of. The names are one click away.
          */}
        <PodsModal repoName={repoName} pods={pods} />

        <TableFilter value={query} onChange={onQuery} placeholder="Filter rows" />

        {frozenBecause && (
          <span className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--st-critical)] px-2 py-1.5 text-xs text-[var(--st-critical-ink)]">
            <Lock size={12} aria-hidden />
            {frozenBecause}
          </span>
        )}
      </TableBar>
  );
}
