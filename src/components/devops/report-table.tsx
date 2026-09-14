"use client";

/**
 * The rows of the sign-off report.
 *
 * A risky row — merged without business or QA — is tinted, labelled and carries
 * the words "merged without …". Three cues for one fact, because this is the
 * row somebody has to notice while scrolling past forty that are fine, and
 * because tint alone fails a colourblind reader and a projector equally.
 *
 * The cycle a row moves into is **the row's own**, looked up through
 * `cycleFor`. One cycle for the whole table was the bug: correcting a pull
 * request's cycle changed nothing about where the move landed.
 */
import { motion } from "framer-motion";
import { ChevronRight, ExternalLink } from "lucide-react";
import { signoffState } from "@/lib/devops/signoff";
import { SignoffToggles } from "./signoff-toggles";
import type { Cycle, PullRecord } from "@/lib/devops/types";
import { ReportRowDetail } from "./report-row-detail";
import { MoveToScope } from "./move-to-scope";
import { ReturnedNote, RiskNote } from "./row-notes";
import { expandableRow } from "./expandable-row";
import { RowDrawer, chevronStyle } from "./row-drawer";
import { PodCell } from "./pod-cell";

/** Columns, named once so the header and the detail's `colSpan` cannot drift. */
const COLUMNS = ["", "PR", "Repo", "POD", "Cycle", "Merged", "Branch", "Deployed", "Where", "Sign-offs", ""] as const;

export function ReportTable({
  pulls,
  repoName,
  podName,
  podsFor,
  cycles,
  canEdit,
  cycleFor,
  busy,
  openId,
  onOpen,
  onToggle,
  onAnnotate,
  onMove,
}: {
  pulls: PullRecord[];
  repoName: (id: string) => string;
  /** The POD a row says it is for, so nobody has to guess whose it is. */
  podName: (pr: PullRecord) => string;
  /** The PODs a row's repo has, for the editor's picker. */
  podsFor: (pr: PullRecord) => { id: string; name: string }[];
  /** Every cycle, for the drawer's picker. */
  cycles: Cycle[];
  /** Whether this reader may change the fields the drawer offers. */
  canEdit: boolean;
  /**
   * The cycle **this row** is assigned to. Per row rather than one for the
   * table: a pull request goes onto the sheet of its own cycle and no other.
   */
  cycleFor: (pr: PullRecord) => Cycle | undefined;
  busy: string;
  /**
   * Which row is open. Held by the parent rather than in here, so what this
   * table renders is a function of its props — the only way the expanded and
   * collapsed states can be checked without a browser.
   */
  openId: string | null;
  onOpen: (id: string | null) => void;
  onToggle: (pr: PullRecord, level: string, on: boolean) => void;
  onAnnotate: (pr: PullRecord, patch: Partial<PullRecord>) => void;
  onMove: (pr: PullRecord) => void;
}) {
  const rows = Array.isArray(pulls) ? pulls : []; // one bad prop must not take the panel down
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[58rem] border-collapse text-sm">
        <thead>
          <tr className="text-left">
            {COLUMNS.map((h, i) => (
              <th key={h || i} className="eyebrow pb-2 font-medium">{h}</th>
            ))}
          </tr>
        </thead>

        {/*
          * No `AnimatePresence` here. The detail row is a plain `<tr>`, and a
          * non-motion child inside it gets tracked for an exit it can never
          * finish — so the presence bookkeeping held the old row set and
          * expanding did nothing. The drawer animates in CSS instead.
          */}
        <tbody>
          {rows.flatMap((pr) => {
            const open = openId === pr.id;
            const state = signoffState(pr.signoffs, Boolean(pr.mergedAt));
            const toggle = () => onOpen(open ? null : pr.id);

            return [
              <motion.tr
                key={pr.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                {...expandableRow(open, toggle)}
                /*
                 * The risk tint is a class, not an inline style, so hover can
                 * win — an inline background beats every utility, and the row
                 * that matters most would be the one that felt dead under the
                 * cursor. It deepens its own red rather than going grey:
                 * losing the red on hover reads as the risk clearing.
                 */
                className={`cursor-pointer border-t border-[var(--hairline)] transition-colors focus-visible:outline focus-visible:-outline-offset-2 focus-visible:outline-[var(--accent)] ${
                  state.risk
                    ? "bg-[color-mix(in_oklab,var(--st-critical)_7%,transparent)] hover:bg-[color-mix(in_oklab,var(--st-critical)_13%,transparent)]"
                    : "hover:bg-[var(--wash)]"
                }`}
              >
                {/* The whole row opens; the chevron only says so. */}
                <td className="py-2.5 pr-1 align-top">
                  <button
                    type="button"
                    onClick={toggle}
                    aria-expanded={open}
                    aria-label={open ? `Close ${pr.number}` : `Open ${pr.number}`}
                    className="rounded-md p-1 text-[var(--ink-muted)] transition-colors hover:text-[var(--ink)]"
                  >
                    <ChevronRight size={14} style={chevronStyle(open)} />
                  </button>
                </td>

                <td className="py-2.5 pr-3">
                  <a
                    href={pr.url}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="inline-flex items-center gap-1 font-medium hover:text-[var(--accent-ink)]"
                  >
                    #{pr.number}
                    <ExternalLink size={11} aria-hidden />
                  </a>
                  <div className="max-w-[26rem] truncate text-xs text-[var(--ink-muted)]" title={pr.title}>
                    {pr.title}
                  </div>
                  <ReturnedNote pr={pr} />

                  {state.risk && <RiskNote missing={state.missing} />}
                </td>
                <td className="py-2.5 pr-3 text-xs">{repoName(pr.repoId)}</td>
                {/* A name; a count only for a row that predates the field. */}
                <td className="py-2.5 pr-3 text-xs">
                  <PodCell teamId={pr.teamId} pods={podsFor(pr)} repoName={repoName(pr.repoId)} />
                </td>

                {/* The cycle decides which sheet a move lands on. */}
                <td className="py-2.5 pr-3 text-xs">
                  {cycleFor(pr)?.name ?? <span className="text-[var(--ink-muted)]">Not assigned</span>}
                </td>

                <td className="py-2.5 pr-3 text-xs tabular-nums">{pr.mergedOn || "—"}</td>
                <td className="py-2.5 pr-3 font-mono text-xs">{pr.baseBranch}</td>
                <td className="py-2.5 pr-3 text-xs tabular-nums">{pr.deployedOn || "—"}</td>
                <td className="py-2.5 pr-3 text-xs">
                  {pr.environment || <span className="text-[var(--ink-muted)]">—</span>}
                </td>

                <td className="py-2.5">
                  <span className="flex flex-wrap gap-1">
                    <SignoffToggles pr={pr} busy={busy === pr.id} onToggle={onToggle} />
                  </span>
                </td>

                {/* `pr-1` so the control is not flush against the edge of
                    the panel — "On the sheet" sat hard up against it. */}
                <td className="py-2.5 pr-1 text-right">
                  <MoveToScope pr={pr} cycle={cycleFor(pr)} canEdit={canEdit} busy={busy === pr.id} onMove={onMove} />
                </td>
              </motion.tr>,

              open ? (
                <tr key={`${pr.id}-detail`}>
                  <td colSpan={COLUMNS.length} className="p-0">
                    <RowDrawer>
                      <ReportRowDetail
                        pr={pr}
                        cycles={cycles}
                        canEdit={canEdit}
                        pods={podsFor(pr)}
                        podName={podName(pr)}
                        busy={busy === pr.id}
                        onSave={(patch) => onAnnotate(pr, patch)}
                      />
                    </RowDrawer>
                  </td>
                </tr>
              ) : null,
            ];
          })}
        </tbody>
      </table>
    </div>
  );
}
