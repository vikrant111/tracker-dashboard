"use client";

/**
 * Taking a row off the scope sheet.
 *
 * Two presses, as everywhere else on this board. A row that came from a pull
 * request also needs a reason before it can go: the pull request lands back on
 * the sign-off report carrying that sentence, and it is what tells the person
 * who moved it whether to fix something or take the change out of the release
 * branch.
 *
 * The box is here rather than a `window.prompt` because a prompt blocks the
 * page, and rather than lifted state because arming a different row should not
 * inherit the last one's sentence — unmounting this does that for free.
 */
import { Trash2 } from "lucide-react";
import { useState } from "react";
import type { Deployment } from "@/lib/devops/types";
import { MIN_REMARKS } from "@/lib/devops/return-to-report";
import { Button, Tooltip } from "@/components/ui";

export function ScopeRemove({
  row,
  armed,
  busy,
  onArm,
  onRemove,
}: {
  row: Deployment;
  armed: boolean;
  busy: boolean;
  onArm: () => void;
  onRemove: (remarks: string) => void;
}) {
  const [why, setWhy] = useState("");

  /** A remark is owed only by a row somebody is waiting to hear about. */
  const owes = Boolean(row.pullId);
  const short = why.trim().length < MIN_REMARKS;
  const held = armed && owes && short;

  return (
    <span className="inline-flex items-center justify-end gap-1.5">
      {armed && owes && (
        <input
          value={why}
          onChange={(e) => setWhy(e.target.value)}
          placeholder="Why is it coming off?"
          aria-label="Why it is coming off the sheet"
          autoFocus
          className="w-52 rounded-lg border border-[var(--hairline)] bg-[var(--panel)] !px-2 !py-1 text-xs"
        />
      )}

      <Tooltip
        label={
          held
            ? "Say why first. It goes back to the sign-off report with the pull request."
            : "Remove this row from the sheet."
        }
      >
        <Button
          onClick={() => {
            if (!armed) return onArm();
            if (held) return;
            // `owes` decides, not the box: a row that owes nothing sends nothing.
            onRemove(owes ? why : "");
          }}
          disabled={busy || held}
        >
          <Trash2 size={12} />
          {armed ? "Remove it?" : "Remove"}
        </Button>
      </Tooltip>
    </span>
  );
}
