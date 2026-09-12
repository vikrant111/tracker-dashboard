"use client";

/**
 * The four fields on a pull request record that are **ours**.
 *
 * Everything else on the row is read from GitHub each sync, so editing it here
 * would be a change the next sync undoes. Split from the drawer so that file is
 * about reading a row and this is about correcting one.
 */
import { ENVIRONMENTS } from "@/lib/types";
import type { Cycle, PullRecord } from "@/lib/devops/types";

type Draft = { deployedOn: string; environment: string; ticket: string; cycleId: string; teamId: string };

export function PullFields({
  draft,
  setDraft,
  cycles,
  pods,
}: {
  draft: Draft;
  setDraft: (next: Draft) => void;
  cycles: Cycle[];
  /** The PODs this row's repo has — the only ones it may belong to. */
  pods: { id: string; name: string }[];
}) {
  const field = "rounded-lg border border-[var(--hairline)] bg-[var(--panel)] px-2.5 py-1.5 text-sm";

  return (
          <div className="flex flex-wrap gap-2">
            {/*
              * Only when there is a decision. One POD is filled in already, and
              * a select with a single option is a question with one answer.
              */}
            {pods.length > 1 && (
              <label className="flex flex-col gap-1">
                <span className="text-xs text-[var(--ink-muted)]">POD</span>
                <select
                  value={draft.teamId}
                  onChange={(e) => setDraft({ ...draft, teamId: e.target.value })}
                  className={field}
                >
                  <option value="">Pick a POD</option>
                  {pods.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </label>
            )}

            <label className="flex flex-col gap-1">
              <span className="text-xs text-[var(--ink-muted)]">Deployed on</span>
              <input
                type="date"
                value={draft.deployedOn}
                onChange={(e) => setDraft({ ...draft, deployedOn: e.target.value })}
                className={field}
              />
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-xs text-[var(--ink-muted)]">Deployed to</span>
              <select
                value={draft.environment}
                onChange={(e) => setDraft({ ...draft, environment: e.target.value })}
                className={field}
              >
                <option value="">Not deployed yet</option>
                {ENVIRONMENTS.map((env) => (
                  <option key={env} value={env}>{env}</option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-xs text-[var(--ink-muted)]">Ticket</span>
              <input
                value={draft.ticket}
                onChange={(e) => setDraft({ ...draft, ticket: e.target.value })}
                placeholder="Work item id"
                className={`${field} w-32 font-mono`}
              />
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-xs text-[var(--ink-muted)]">Cycle</span>
              <select
                value={draft.cycleId}
                onChange={(e) => setDraft({ ...draft, cycleId: e.target.value })}
                className={field}
              >
                <option value="">Not assigned</option>
                {cycles.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </label>
    </div>
  );
}
