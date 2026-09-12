"use client";

/**
 * A scope row opened up.
 *
 * Read-only until somebody presses Edit, and Edit only appears for people an
 * admin has made a DevOps editor. A row is evidence once it is written, and a
 * quiet correction by anyone passing is how evidence stops being worth
 * anything — but the people who ship the change do need to fix a date, so the
 * answer is a named list rather than "admins only".
 */
import { Check, Lock, Pencil, X } from "lucide-react";
import { useState } from "react";
import { ENVIRONMENTS } from "@/lib/types";
import { DEPLOY_KINDS, DEPLOY_STATES, type Deployment } from "@/lib/devops/types";
import { refuseEdit } from "@/lib/devops/editors";
import { Button, Tooltip } from "@/components/ui";

/** One labelled fact, when the row is being read rather than edited. */
function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="eyebrow">{label}</span>
      <span className="text-sm">{value || <span className="text-[var(--ink-muted)]">—</span>}</span>
    </div>
  );
}

export function ScopeRowDetail({
  row,
  podName,
  pods,
  canEdit,
  frozen,
  busy,
  onSave,
}: {
  row: Deployment;
  /** The POD this row is for, as a name. */
  podName: string;
  /** The PODs it could be for — the repo's. */
  pods: { id: string; name: string }[];
  canEdit: boolean;
  frozen: boolean;
  busy: boolean;
  onSave: (patch: Partial<Deployment>) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Deployment>(row);

  const field = "rounded-lg border border-[var(--hairline)] bg-[var(--panel)] px-2.5 py-1.5 text-sm";
  const set = (change: Partial<Deployment>) => setDraft({ ...draft, ...change });

  /*
   * No motion of its own: the drawer around this animates the height, and
   * sliding the contents inside it at the same time read as two things moving.
   */
  return (
    <div>
      <div className="border-b border-[var(--hairline)] bg-[var(--wash)] px-3 py-4">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <span className="eyebrow">{editing ? "Editing this row" : "Everything on this row"}</span>

          <span className="ml-auto flex items-center gap-2">
            {!editing && canEdit && !frozen && (
              <Button onClick={() => { setDraft(row); setEditing(true); }}>
                <Pencil size={13} />
                Edit
              </Button>
            )}

            {/*
              * Says why, rather than hiding the control and leaving somebody to
              * wonder whether the feature exists.
              */}
            {!editing && !canEdit && (
              <Tooltip label={refuseEdit()}>
                <span className="inline-flex items-center gap-1 text-xs text-[var(--ink-muted)]">
                  <Lock size={12} aria-hidden />
                  Read only
                </span>
              </Tooltip>
            )}

            {!editing && canEdit && frozen && (
              <span className="inline-flex items-center gap-1 text-xs text-[var(--st-critical-ink)]">
                <Lock size={12} aria-hidden />
                Scope is frozen
              </span>
            )}

            {editing && (
              <>
                <Button variant="primary" onClick={() => { onSave(draft); setEditing(false); }} disabled={busy}>
                  <Check size={13} />
                  {busy ? "Saving…" : "Save"}
                </Button>
                <Button onClick={() => { setDraft(row); setEditing(false); }} disabled={busy}>
                  <X size={13} />
                  Cancel
                </Button>
              </>
            )}
          </span>
        </div>

        {editing ? (
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap gap-2">
              {pods.length > 1 && (
                <label className="flex flex-col gap-1">
                  <span className="text-xs text-[var(--ink-muted)]">POD</span>
                  <select value={draft.teamId} onChange={(e) => set({ teamId: e.target.value })} className={field}>
                    <option value="">Pick a POD</option>
                    {pods.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </label>
              )}

              <label className="flex flex-col gap-1">
                <span className="text-xs text-[var(--ink-muted)]">Kind</span>
                <select value={draft.kind} onChange={(e) => set({ kind: e.target.value as Deployment["kind"] })} className={field}>
                  {DEPLOY_KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
                </select>
              </label>

              <label className="flex flex-col gap-1">
                <span className="text-xs text-[var(--ink-muted)]">State</span>
                <select value={draft.state} onChange={(e) => set({ state: e.target.value as Deployment["state"] })} className={field}>
                  {DEPLOY_STATES.map((st) => <option key={st} value={st}>{st}</option>)}
                </select>
              </label>

              <label className="flex flex-col gap-1">
                <span className="text-xs text-[var(--ink-muted)]">Environment</span>
                <select value={draft.environment} onChange={(e) => set({ environment: e.target.value })} className={field}>
                  {ENVIRONMENTS.map((env) => <option key={env} value={env}>{env}</option>)}
                </select>
              </label>

              <label className="flex flex-col gap-1">
                <span className="text-xs text-[var(--ink-muted)]">Deployed on</span>
                <input type="date" value={draft.deployedOn} onChange={(e) => set({ deployedOn: e.target.value })} className={field} />
              </label>

              <label className="flex flex-col gap-1">
                <span className="text-xs text-[var(--ink-muted)]">Ticket</span>
                <input value={draft.ticket} onChange={(e) => set({ ticket: e.target.value })} className={`${field} w-32 font-mono`} />
              </label>
            </div>

            <input value={draft.title} onChange={(e) => set({ title: e.target.value })} aria-label="Title" className={field} />
            <input value={draft.branch} onChange={(e) => set({ branch: e.target.value })} aria-label="Branch" className={`${field} font-mono`} />
            <input value={draft.prUrl} onChange={(e) => set({ prUrl: e.target.value })} aria-label="Pull request URL" placeholder="Pull request URL" className={field} />
            <textarea value={draft.notes} onChange={(e) => set({ notes: e.target.value })} aria-label="Notes" rows={2} className={field} />
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-4">
            <Fact label="POD" value={podName} />
            <Fact label="Ticket" value={row.ticket} />
            <Fact label="Kind" value={row.kind} />
            <Fact label="State" value={row.state} />
            <Fact label="Branch" value={row.branch} />
            <Fact label="Environment" value={row.environment} />
            <Fact label="Deployed on" value={row.deployedOn} />
            <Fact label="Filled by" value={row.author} />
            <div className="sm:col-span-3 lg:col-span-4">
              <Fact label="What" value={row.title} />
            </div>
            {row.prUrl && (
              <div className="sm:col-span-3 lg:col-span-4">
                <span className="eyebrow">Pull request</span>
                <div>
                  <a href={row.prUrl} target="_blank" rel="noreferrer noopener" className="text-sm text-[var(--accent-ink)] hover:underline">
                    {row.prUrl}
                  </a>
                </div>
              </div>
            )}
            {row.notes && (
              <div className="sm:col-span-3 lg:col-span-4">
                <Fact label="Notes" value={row.notes} />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
