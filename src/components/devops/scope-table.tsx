"use client";

/**
 * The rows of a scope sheet: which bug, on which branch, in which environment.
 *
 * Every row opens. The table shows what somebody scanning needs — POD, ticket,
 * where it is, what state it is in — and the rest is one click away rather than
 * squeezed into a column nobody can read.
 *
 * State is coloured with `STATUS_INK` rather than `STATUS`: these are words a
 * person reads, so they owe 4.5:1, not the 3:1 a mark owes.
 */
import { motion } from "framer-motion";
import { ChevronRight, ExternalLink } from "lucide-react";
import { STATUS_INK } from "@/lib/palette";
import type { Deployment } from "@/lib/devops/types";
import { ScopeRemove } from "./scope-remove";
import { expandableRow } from "./expandable-row";
import { RowDrawer, chevronStyle } from "./row-drawer";
import { ScopeRowDetail } from "./scope-row-detail";

const STATE_INK: Record<string, string> = {
  planned: "var(--ink-muted)",
  deployed: STATUS_INK.good,
  verified: STATUS_INK.good,
  "rolled-back": STATUS_INK.critical,
};

export function ScopeTable({
  rows,
  podOf,
  repoPods,
  pods,
  isAdmin,
  canEdit,
  frozen,
  busy,
  armed,
  openId,
  setArmed,
  onOpen,
  onSave,
  onRemove,
}: {
  rows: Deployment[];
  /** The POD a row says it is for. */
  podOf: (row: Deployment) => string;
  /** Every POD on the repo — what a row from before the field falls back to. */
  repoPods: string;
  /** The PODs a row may belong to, for the editor's picker. */
  pods: { id: string; name: string }[];
  isAdmin: boolean;
  /** Whether this reader may change a row that already exists. */
  canEdit: boolean;
  /** While the scope is frozen nobody edits, admins included. */
  frozen: boolean;
  busy: boolean;
  armed: string | null;
  openId: string | null;
  setArmed: (id: string | null) => void;
  onOpen: (id: string | null) => void;
  onSave: (row: Deployment, patch: Partial<Deployment>) => void;
  onRemove: (row: Deployment, remarks: string) => void;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[54rem] border-collapse text-sm">
        <thead>
          <tr className="text-left">
            {["", "Ticket", "What", "POD", "Branch", "Environment", "State", "Deployed", ""].map((h, i) => (
              <th key={h || `blank-${i}`} className="eyebrow pb-2 font-medium">{h}</th>
            ))}
          </tr>
        </thead>

        {/*
          * No `AnimatePresence`: the detail is a plain `<tr>`, and presence
          * tracking waits on an exit a non-motion child can never finish — a
          * row then opens and refuses to close.
          */}
        <tbody>
          {rows.flatMap((row, i) => [
            <motion.tr
              key={row.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: Math.min(i * 0.02, 0.16) }}
              {...expandableRow(openId === row.id, () => onOpen(openId === row.id ? null : row.id))}
              className="cursor-pointer border-t border-[var(--hairline)] transition-colors hover:bg-[var(--wash)] focus-visible:outline focus-visible:-outline-offset-2 focus-visible:outline-[var(--accent)]"
            >
              <td className="py-2.5 pr-1 align-top">
                <button
                  type="button"
                  onClick={() => onOpen(openId === row.id ? null : row.id)}
                  aria-expanded={openId === row.id}
                  aria-label={openId === row.id ? `Close ${row.title}` : `Open ${row.title}`}
                  className="rounded-md p-1 text-[var(--ink-muted)] transition-colors hover:text-[var(--ink)]"
                >
                  <ChevronRight size={14} style={chevronStyle(openId === row.id)} />
                </button>
              </td>

              <td className="py-2.5 pr-3 font-mono text-xs">{row.ticket || "—"}</td>

              <td className="py-2.5 pr-3">
                <span className="font-medium">{row.title}</span>
                {row.prUrl && (
                  <a
                    href={row.prUrl}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="ml-1.5 inline-flex text-[var(--accent-ink)]"
                    aria-label="Open the pull request"
                  >
                    <ExternalLink size={11} />
                  </a>
                )}
                <div className="text-xs text-[var(--ink-muted)]">{row.kind}</div>
              </td>

              {/* The POD, because "which team is this row about" was the first
                  thing anyone asked when they saw this table. */}
              <td className="py-2.5 pr-3 text-xs">
                {podOf(row) || (
                  // A row filled in before rows had their own POD shows the
                  // repo's, greyed, rather than an empty cell that reads as a
                  // mistake.
                  <span className="text-[var(--ink-muted)]">{repoPods || "Not linked"}</span>
                )}
              </td>

              <td className="py-2.5 pr-3 font-mono text-xs">{row.branch}</td>
              <td className="py-2.5 pr-3 text-xs">{row.environment}</td>
              <td className="py-2.5 pr-3 text-xs font-medium" style={{ color: STATE_INK[row.state] ?? "var(--ink)" }}>
                {row.state}
              </td>
              <td className="py-2.5 pr-3 text-xs tabular-nums">{row.deployedOn || "—"}</td>

              {/* `pr-1` for the same reason as the report: the control
                  should not sit flush against the panel edge. */}
              <td className="py-2.5 pr-1 text-right">
                {isAdmin && !frozen && (
                  <ScopeRemove
                    row={row}
                    armed={armed === row.id}
                    busy={busy}
                    onArm={() => setArmed(row.id)}
                    onRemove={(why) => {
                      setArmed(null);
                      onRemove(row, why);
                    }}
                  />
                )}
              </td>
            </motion.tr>,

            openId === row.id ? (
              <tr key={`${row.id}-detail`}>
                <td colSpan={9} className="p-0">
                  {/* Animates its own height, so the table settles rather than jumps. */}
                  <RowDrawer>
                    <ScopeRowDetail
                      row={row}
                      podName={podOf(row) || repoPods}
                      pods={pods}
                      canEdit={canEdit}
                      frozen={frozen}
                      busy={busy}
                      onSave={(patch) => onSave(row, patch)}
                    />
                  </RowDrawer>
                </td>
              </tr>
            ) : null,
          ])}
        </tbody>
      </table>
    </div>
  );
}
