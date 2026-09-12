"use client";

/**
 * Putting a merged pull request onto the scope sheet.
 *
 * The button is disabled for exactly one reason at a time, and the tooltip says
 * which — a greyed control with no explanation is the thing people file bugs
 * about, and there are three quite different reasons this can be off.
 *
 * `cycle` is **this pull request's own** cycle, not whichever one happens to be
 * open. A pull request goes onto the sheet it is assigned to and no other, so
 * the button has to ask about that sheet — including whether it is frozen.
 *
 * The rule lives in `lib/devops/to-scope.ts` and the API asks the same
 * function, so the button and the server can never disagree.
 */
import { ArrowRightToLine, Check } from "lucide-react";
import { refuseMoveToScope } from "@/lib/devops/to-scope";
import type { Cycle, PullRecord } from "@/lib/devops/types";
import { Button, Tooltip } from "@/components/ui";

export function MoveToScope({
  pr,
  cycle,
  canEdit,
  busy,
  onMove,
}: {
  pr: PullRecord;
  /** The cycle this pull request is assigned to. `undefined` when none is. */
  cycle: Cycle | undefined;
  canEdit: boolean;
  busy: boolean;
  onMove: (pr: PullRecord) => void;
}) {
  // Already there: say so rather than offering a button that would refuse.
  if (pr.movedToScope) {
    return (
      <Tooltip label="This pull request is already on the scope sheet.">
        <span className="inline-flex items-center gap-1 whitespace-nowrap text-xs text-[var(--st-good-ink)]">
          <Check size={12} aria-hidden />
          On the sheet
        </span>
      </Tooltip>
    );
  }

  const refusal = refuseMoveToScope(pr, cycle, canEdit);

  return (
    <Tooltip
      label={
        refusal ??
        `Add #${pr.number} to the ${cycle?.name ?? ""} scope sheet — its title, ticket, branch and environment come with it.`
      }
    >
      {/* A span, so the tooltip still fires on a disabled button. */}
      <span className="inline-block">
        <Button onClick={() => onMove(pr)} disabled={busy || refusal !== null}>
          <ArrowRightToLine size={12} />
          {busy ? "Moving…" : "To sheet"}
        </Button>
      </span>
    </Tooltip>
  );
}
