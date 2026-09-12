"use client";

/**
 * A pull request opened up: what is known, and the four things a person can
 * correct.
 *
 * GitHub owns everything else on the row, so editing it here would be a change
 * the next sync silently undoes. These four are ours: where it landed, when,
 * which ticket it really was, and which cycle it belongs to.
 *
 * Sign-offs live in the row above rather than in here on purpose. Getting a
 * sign-off *after* the merge is the normal case, not an exception, so recording
 * one must not be hidden behind opening a drawer first.
 */
import { Check, Lock, Pencil } from "lucide-react";
import { useState } from "react";
import { SIGNOFF_LABEL, SIGNOFF_LEVELS } from "@/lib/devops/signoff";
import type { Cycle, PullRecord } from "@/lib/devops/types";
import { refuseEdit } from "@/lib/devops/editors";
import { PullFields } from "./pull-fields";
import { Button, Tooltip } from "@/components/ui";
import { isReturned, returnedBy } from "./row-notes";

/** One labelled fact, when the row is being read rather than edited. */
function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="eyebrow">{label}</span>
      <span className="text-sm">{value || <span className="text-[var(--ink-muted)]">—</span>}</span>
    </div>
  );
}

export function ReportRowDetail({
  pr,
  cycles,
  pods,
  podName,
  canEdit,
  busy,
  onSave,
}: {
  pr: PullRecord;
  cycles: Cycle[];
  /** The PODs this row's repo has. */
  pods: { id: string; name: string }[];
  /** The POD this row is for, as a name. */
  podName: string;
  /** Whether this reader may change the four fields below. */
  canEdit: boolean;
  busy: boolean;
  onSave: (patch: Partial<PullRecord>) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({
    deployedOn: pr.deployedOn,
    environment: pr.environment,
    ticket: pr.ticket,
    cycleId: pr.cycleId,
    teamId: pr.teamId,
  });

  const dirty =
    draft.deployedOn !== pr.deployedOn ||
    draft.environment !== pr.environment ||
    draft.ticket !== pr.ticket ||
    draft.cycleId !== pr.cycleId ||
    draft.teamId !== pr.teamId;

  /*
   * No motion of its own. The drawer around this animates the height, and a
   * second animation sliding the contents inside it read as two things moving
   * at once.
   */
  return (
    <div>
      <div className="grid gap-4 border-b border-[var(--hairline)] bg-[var(--wash)] px-3 py-4 lg:grid-cols-[1.1fr_1fr]">
        <div className="flex flex-col gap-2">
          <p className="flex items-center gap-2">
            <span className="eyebrow">Where it landed</span>

            {/*
              * Read until somebody presses Edit, and Edit only for people an
              * admin has chosen. A record is evidence once written.
              */}
            {!editing && canEdit && (
              <Button onClick={() => { setDraft({ deployedOn: pr.deployedOn, environment: pr.environment, ticket: pr.ticket, cycleId: pr.cycleId, teamId: pr.teamId }); setEditing(true); }}>
                <Pencil size={12} />
                Edit
              </Button>
            )}
            {!editing && !canEdit && (
              <Tooltip label={refuseEdit()}>
                <span className="inline-flex items-center gap-1 text-xs text-[var(--ink-muted)]">
                  <Lock size={12} aria-hidden />
                  Read only
                </span>
              </Tooltip>
            )}
          </p>

          {editing ? (
            <PullFields draft={draft} setDraft={setDraft} cycles={cycles} pods={pods} />
          ) : (
            <div className="grid gap-3 sm:grid-cols-4">
              <Fact label="POD" value={podName} />
              <Fact label="Deployed on" value={pr.deployedOn} />
              <Fact label="Deployed to" value={pr.environment} />
              <Fact label="Ticket" value={pr.ticket} />
            </div>
          )}

          {editing && (
            <span className="flex flex-wrap items-center gap-2">
              <Button variant="primary" onClick={() => { onSave(draft); setEditing(false); }} disabled={busy || !dirty}>
                <Check size={13} />
                {busy ? "Saving…" : "Save"}
              </Button>
              <Button onClick={() => setEditing(false)} disabled={busy}>Cancel</Button>
              <span className="text-xs text-[var(--ink-muted)]">
                Only these four are ours. Everything else is read from GitHub each sync.
              </span>
            </span>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <p className="eyebrow">Sign-offs</p>

          {SIGNOFF_LEVELS.map((level) => {
            const sig = pr.signoffs?.[level];
            return (
              <p key={level} className="text-xs">
                <span className="font-medium">{SIGNOFF_LABEL[level]}:</span>{" "}
                {sig ? (
                  <span className="text-[var(--ink-muted)]">
                    {sig.by} · {new Date(sig.at).toLocaleString()}
                  </span>
                ) : (
                  <span className="text-[var(--st-warning-ink)]">
                    not signed off — tick it on the row above, whenever it comes through
                  </span>
                )}
              </p>
            );
          })}

          {isReturned(pr) && (
            <p className="mt-1 rounded-lg border border-[var(--st-warning)] bg-[var(--wash)] px-2 py-1.5 text-xs">
              <span className="font-medium">Taken back off the scope sheet</span> by {returnedBy(pr)}:{" "}
              {pr.returned?.remarks}
            </p>
          )}

          <p className="mt-1 text-xs text-[var(--ink-muted)]">
            Opened by {pr.author || "somebody"} · merged into <code>{pr.baseBranch}</code>
            {pr.mergedOn && ` on ${pr.mergedOn}`}.
          </p>
        </div>
      </div>
    </div>
  );
}
