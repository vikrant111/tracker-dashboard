"use client";

/**
 * The dropdowns at the top of the scope form: cycle, POD, kind, environment,
 * state and the date.
 *
 * Split from the form so that file is the shape of the whole thing and this is
 * the row of choices. The POD only appears when there is a decision to make —
 * a select with one option is a question with one answer.
 */
import { ENVIRONMENTS } from "@/lib/types";
import { DEPLOY_KINDS, DEPLOY_STATES, type Cycle, type Deployment } from "@/lib/devops/types";

export function ScopePicks({
  draft,
  set,
  cycles,
  pods,
}: {
  draft: Partial<Deployment>;
  set: (change: Partial<Deployment>) => void;
  cycles: Cycle[];
  pods: { id: string; name: string }[];
}) {
  return (
        <div className="flex flex-wrap gap-2">
          <label className="flex flex-col gap-1">
            <span className="eyebrow">Cycle</span>
            <select
              value={draft.cycleId ?? ""}
              onChange={(e) => set({ cycleId: e.target.value })}
              className="rounded-lg border border-[var(--hairline)] bg-[var(--panel)] px-2 py-1.5 text-sm"
            >
              {cycles.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                  {c.scope.frozen ? " (frozen)" : ""}
                </option>
              ))}
            </select>
          </label>

          {/*
            * Only shown when there is a decision. One POD is filled in for you,
            * and none means the repo is not linked to a team at all — a select
            * with a single option is a question with one answer.
            */}
          {pods.length > 1 && (
            <label className="flex flex-col gap-1">
              <span className="eyebrow">POD</span>
              <select
                value={draft.teamId ?? ""}
                onChange={(e) => set({ teamId: e.target.value })}
                className="w-auto rounded-lg border border-[var(--hairline)] bg-[var(--panel)] px-2 py-1.5 text-sm"
              >
                <option value="">Pick a POD</option>
                {pods.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </label>
          )}

          <label className="flex flex-col gap-1">
            <span className="eyebrow">Kind</span>
            <select
              value={draft.kind ?? "bug"}
              onChange={(e) => set({ kind: e.target.value as Deployment["kind"] })}
              className="rounded-lg border border-[var(--hairline)] bg-[var(--panel)] px-2 py-1.5 text-sm"
            >
              {DEPLOY_KINDS.map((k) => (
                <option key={k} value={k}>{k}</option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1">
            <span className="eyebrow">Environment</span>
            <select
              value={draft.environment ?? "Unknown"}
              onChange={(e) => set({ environment: e.target.value })}
              className="rounded-lg border border-[var(--hairline)] bg-[var(--panel)] px-2 py-1.5 text-sm"
            >
              {ENVIRONMENTS.map((e) => (
                <option key={e} value={e}>{e}</option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1">
            <span className="eyebrow">State</span>
            <select
              value={draft.state ?? "planned"}
              onChange={(e) => set({ state: e.target.value as Deployment["state"] })}
              className="rounded-lg border border-[var(--hairline)] bg-[var(--panel)] px-2 py-1.5 text-sm"
            >
              {DEPLOY_STATES.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1">
            <span className="eyebrow">Deployed on</span>
            <input
              type="date"
              value={draft.deployedOn ?? ""}
              onChange={(e) => set({ deployedOn: e.target.value })}
              className="rounded-lg border border-[var(--hairline)] bg-[var(--panel)] px-2 py-1.5 text-sm"
            />
          </label>
        </div>
  );
}
