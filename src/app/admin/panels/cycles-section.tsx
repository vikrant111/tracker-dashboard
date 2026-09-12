"use client";

/**
 * Deployment cycles for the onboarded repositories.
 *
 * A cycle is what a scope sheet belongs to — "what is in 2026.09" is a
 * different list from "what is in 2026.10". Creating one is all it takes for
 * people to start filling the sheet.
 *
 * Fetches for itself, like the repositories section, so `admin-client.tsx` does
 * not grow another four handlers.
 */
import { useState } from "react";
import useSWR from "swr";
import { CalendarRange, Plus, Trash2 } from "lucide-react";
import { SWR_OPTIONS, failureReason, fetcher } from "@/lib/swr";
import { blankCycle, type Cycle, type Repo } from "@/lib/devops/types";
import { Button, Empty, Panel, PanelHeader, Tooltip } from "@/components/ui";
import { Field } from "./field";

export function CyclesSection({
  flash,
}: {
  flash: (text: string, tone?: "ok" | "bad") => void;
}) {
  const reposReq = useSWR<{ repos?: Repo[] }>("/api/repos", fetcher, SWR_OPTIONS);
  const { data, error, mutate } = useSWR<{ cycles?: Cycle[]; error?: string }>("/api/cycles", fetcher, SWR_OPTIONS);

  const [draft, setDraft] = useState<Cycle | null>(null);
  const [busy, setBusy] = useState(false);
  const [armed, setArmed] = useState<string | null>(null);

  const repos = reposReq.data?.repos ?? [];
  const cycles = data?.cycles ?? [];
  const failed = failureReason(error, data);
  const nameOf = (id: string) => repos.find((r) => r.id === id)?.name ?? id;

  const save = async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/cycles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Could not save that cycle.");

      flash(`Saved ${body.cycle.name}.`);
      setDraft(null);
      await mutate();
    } catch (err) {
      flash(err instanceof Error ? err.message : "Could not save that cycle.", "bad");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (cycle: Cycle) => {
    setBusy(true);
    try {
      await fetch(`/api/cycles?id=${encodeURIComponent(cycle.id)}`, { method: "DELETE" });
      // Says what is left behind. Removing a cycle does not remove the rows
      // filed against it, and somebody hesitating deserves to know that.
      flash(`Removed ${cycle.name}. Its scope rows are still stored.`);
      await mutate();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Panel className="p-6">
      <PanelHeader
        eyebrow="DevOps"
        title="Deployment cycles"
        icon={<CalendarRange size={16} strokeWidth={2.2} />}
        action={
          !draft && (
            <Button
              variant="primary"
              disabled={repos.length === 0}
              onClick={() => setDraft(blankCycle(repos[0]?.id ?? "", repos[0]?.releaseBranch ?? "release"))}
            >
              <Plus size={14} />
              New cycle
            </Button>
          )
        }
      />

      {draft && (
        <div className="mb-4 grid gap-4 rounded-xl border border-[var(--hairline)] bg-[var(--wash)] p-4 sm:grid-cols-2">
          <Field label="Repository" hint="Which repo this release ships from">
            <select
              value={draft.repoId}
              onChange={(e) => {
                const repo = repos.find((r) => r.id === e.target.value);
                setDraft({ ...draft, repoId: e.target.value, releaseBranch: repo?.releaseBranch ?? draft.releaseBranch });
              }}
            >
              {repos.map((r) => (
                <option key={r.id} value={r.id}>{r.name}</option>
              ))}
            </select>
          </Field>

          <Field label="Name" hint="The version or sprint, e.g. 2026.09">
            <input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="2026.09" autoFocus />
          </Field>

          <Field label="Release branch" hint="Defaults to the repository's">
            <input value={draft.releaseBranch} onChange={(e) => setDraft({ ...draft, releaseBranch: e.target.value })} />
          </Field>

          <Field label="Planned for" hint="Optional — when it is expected to go out">
            <input type="date" value={draft.plannedFor} onChange={(e) => setDraft({ ...draft, plannedFor: e.target.value })} />
          </Field>

          <span className="flex items-center gap-2 sm:col-span-2">
            <Button variant="primary" onClick={save} disabled={busy || !draft.name.trim()}>
              {busy ? "Saving…" : "Save cycle"}
            </Button>
            <Button onClick={() => setDraft(null)}>Cancel</Button>
          </span>
        </div>
      )}

      {failed ? (
        <Empty title="Could not load the cycles" hint={failed} />
      ) : cycles.length === 0 && !draft ? (
        <Empty
          title="No cycles yet"
          hint={repos.length === 0 ? "Onboard a repository first." : "A cycle is what a scope sheet belongs to. Create one per release."}
        />
      ) : (
        <ul className="flex flex-col gap-2">
          {cycles.map((c) => (
            <li key={c.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-[var(--hairline)] px-3 py-2.5">
              <span className="font-medium">{c.name}</span>
              <span className="text-xs text-[var(--ink-muted)]">{nameOf(c.repoId)} · {c.releaseBranch}</span>
              {c.plannedFor && <span className="text-xs tabular-nums text-[var(--ink-muted)]">{c.plannedFor}</span>}
              {c.scope.frozen && (
                <Tooltip label={c.scope.reason || "Scope is frozen. No rows can be added, edited or removed."}>
                  <span className="rounded-md bg-[var(--wash)] px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-[var(--st-critical-ink)]">
                    scope frozen
                  </span>
                </Tooltip>
              )}

              <span className="ml-auto flex items-center gap-2">
                <Button onClick={() => setDraft(c)}>Edit</Button>
                <Tooltip label="Remove the cycle. The rows filed against it are kept.">
                  <Button
                    onClick={() => {
                      if (armed !== c.id) return setArmed(c.id);
                      setArmed(null);
                      void remove(c);
                    }}
                    disabled={busy}
                  >
                    <Trash2 size={14} />
                    {armed === c.id ? "Remove it?" : "Remove"}
                  </Button>
                </Tooltip>
              </span>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
