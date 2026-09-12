"use client";

/**
 * The warning lines under a pull request's title on the sign-off report.
 *
 * Both say the row needs somebody: one that it went to the release branch
 * without the sign-offs, one that it was taken back off the scope sheet. They
 * live together because they read as one column of warnings, and apart from
 * the table because that table is already at its length.
 *
 * Shown on the report row and again in its detail, because this is the thing
 * the row is now waiting on: whoever moved it has to fix what the remark says
 * and move it again, or take the change out of the release branch. A reason
 * written into a record nobody reads is the same as no reason at all.
 */
import { AlertTriangle, Undo2 } from "lucide-react";
import type { PullRecord } from "@/lib/devops/types";
import { Tooltip } from "@/components/ui";

/** Whether this pull request is sitting on a removal somebody has to act on. */
export function isReturned(pr: Pick<PullRecord, "returned" | "movedToScope">) {
  return Boolean(pr.returned?.remarks) && !pr.movedToScope;
}

/** Who took it off and when, as a sentence. */
export function returnedBy(pr: Pick<PullRecord, "returned">) {
  return `${pr.returned?.by || "somebody"} on ${String(pr.returned?.at ?? "").slice(0, 10)}`;
}

/** Merged to a release branch without the sign-offs that were owed. */
export function RiskNote({ missing }: { missing: string[] }) {
  /* POD verification is left out: it is not what makes a merge risky, and
     naming it here would put a third word in a line meant to be read at a
     glance. */
  const said = missing.filter((level) => level !== "pod");
  if (!said.length) return null;

  return (
    <div className="mt-0.5 inline-flex items-center gap-1 text-[11px] font-medium text-[var(--st-critical-ink)]">
      <AlertTriangle size={11} aria-hidden />
      Merged without {said.join(" and ")}
    </div>
  );
}

export function ReturnedNote({ pr }: { pr: Pick<PullRecord, "returned" | "movedToScope"> }) {
  if (!isReturned(pr)) return null;

  return (
    <Tooltip
      label={`Taken off the scope sheet by ${returnedBy(pr)}. Fix what it says and move it again, or take the change out of the release branch.`}
    >
      <div className="mt-0.5 inline-flex items-start gap-1 text-[11px] font-medium text-[var(--st-warning-ink)]">
        <Undo2 size={11} aria-hidden className="mt-0.5 shrink-0" />
        <span>Back off the sheet: {pr.returned?.remarks}</span>
      </div>
    </Tooltip>
  );
}
