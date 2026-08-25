"use client";

/** The Azure Boards connection, its field mapping, and the sync controls. */
import { Plug, RefreshCw } from "lucide-react";
import { Button, Panel, PanelHeader, PasswordField } from "@/components/ui";
import type { Team } from "@/lib/types";
import { Field } from "./field";

export function PodAzurePanel({
  draft,
  setDraft,
  busy,
  armed,
  setArmed,
  saveTeam,
  syncTeam,
  testConnection,
  projectTypes,
}: {
  /** The POD being edited. Never null here — the caller guards. */
  draft: Team;
  setDraft: (team: Team | null) => void;
  /** Which async action is in flight, so its own button can show it. */
  busy: string;
  /** Which destructive action is armed for its second press. */
  armed: string | null;
  setArmed: (id: string | null) => void;
  saveTeam: () => void;
  syncTeam: (full: boolean) => void;
  testConnection: () => void;
  /** What the project actually calls its work items, once Test has asked. */
  projectTypes: { types: string[]; unmatched: string[] } | null;
}) {
  const patch = (change: Partial<Team>) => setDraft({ ...draft, ...change });
  const patchAzure = (change: Partial<Team["azure"]>) =>
    setDraft({ ...draft, azure: { ...draft.azure, ...change } });

  return (
      <Panel className="p-6">
        <PanelHeader
          eyebrow="Azure Boards"
          title="Connection and field mapping"
          action={
            <div className="flex gap-2">
              <Button onClick={testConnection} disabled={busy === "test"}>
                <Plug size={14} />
                {busy === "test" ? "Testing…" : "Test"}
              </Button>
              <Button onClick={() => syncTeam(false)} disabled={busy === "sync"}>
                <RefreshCw size={14} className={busy === "sync" ? "animate-spin" : ""} />
                Sync
              </Button>
              <Button onClick={() => syncTeam(true)} disabled={busy === "sync"} title="Re-import everything">
                Full resync
              </Button>
            </div>
          }
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Organisation URL" hint="Blank falls back to AZDO_ORG_URL">
            <input
              value={draft.azure.orgUrl}
              onChange={(e) => patchAzure({ orgUrl: e.target.value })}
              placeholder="https://dev.azure.com/my-org"
            />
          </Field>
          <Field label="Project" hint="Blank falls back to AZDO_PROJECT">
            <input
              value={draft.azure.project}
              onChange={(e) => patchAzure({ project: e.target.value })}
              placeholder="Payments"
            />
          </Field>
          <Field label="Personal access token" hint="Needs Work Items (Read). Blank falls back to AZDO_PAT.">
            <PasswordField
              value={draft.azure.pat}
              onChange={(pat) => patchAzure({ pat })}
              autoComplete="off"
              placeholder="••••••••"
            />
          </Field>
          <Field label="Area path" hint="Scopes this POD's items, and routes webhooks to it">
            <input
              value={draft.azure.areaPath}
              onChange={(e) => patchAzure({ areaPath: e.target.value })}
              placeholder="Payments\\AMC"
            />
          </Field>
          <Field label="Work item types" hint="Comma separated" className="sm:col-span-2">
            <input
              value={draft.azure.workItemTypes.join(", ")}
              onChange={(e) =>
                patchAzure({
                  workItemTypes: e.target.value
                    .split(",")
                    .map((s) => s.trim())
                    .filter(Boolean),
                })
              }
            />
            {projectTypes && projectTypes.types.length > 0 && (
              <p className="mt-2 text-[11px] leading-relaxed text-[var(--ink-2)]">
                <span className="font-semibold">This project has:</span>{" "}
                {projectTypes.types.map((name) => {
                  const on = (draft.azure.workItemTypes ?? []).some(
                    (chosen) => chosen.trim().toLowerCase() === name.toLowerCase(),
                  );
                  return (
                    <button
                      key={name}
                      type="button"
                      onClick={() =>
                        patchAzure({
                          workItemTypes: on
                            ? draft.azure.workItemTypes.filter((c) => c.trim().toLowerCase() !== name.toLowerCase())
                            : [...draft.azure.workItemTypes, name],
                        })
                      }
                      title={on ? `Stop importing ${name}` : `Import ${name} into this POD`}
                      className={`mr-1 mb-1 inline-flex rounded-md px-1.5 py-0.5 font-[family-name:var(--font-mono)] transition-colors ${
                        on
                          ? "bg-[var(--accent-tint)] text-[var(--accent-ink)]"
                          : "bg-[var(--wash-2)] text-[var(--ink-muted)] hover:bg-[var(--wash-3)] hover:text-[var(--ink)]"
                      }`}
                    >
                      {name}
                    </button>
                  );
                })}
              </p>
            )}
          </Field>
        </div>

        <h3 className="mt-6 mb-1 text-sm font-semibold">Field mapping</h3>
        <p className="mb-3 text-xs text-[var(--ink-muted)]">
          Reference names of the fields carrying each dimension on your board. Environment also falls back to
          tags and then area path when the field is missing.
        </p>
        <div className="grid gap-4 sm:grid-cols-3">
          {(["severity", "environment", "status"] as const).map((key) => (
            <Field key={key} label={key} hint="">
              <input
                value={draft.fieldMap[key]}
                onChange={(e) => patch({ fieldMap: { ...draft.fieldMap, [key]: e.target.value } })}
              />
            </Field>
          ))}
        </div>

        <h3 className="mt-6 mb-1 text-sm font-semibold">Live updates</h3>
        <p className="text-xs leading-relaxed text-[var(--ink-muted)]">
          The server polls Azure on the interval set by SYNC_POLL_SECONDS. For instant updates, add a Service
          Hook in Azure DevOps (Project settings → Service hooks → Web Hooks) for
          <em> work item created, updated and deleted</em>, pointing at
          <code className="mx-1 rounded bg-[var(--wash-2)] px-1.5 py-0.5 font-[family-name:var(--font-mono)] text-[11px]">
            {typeof window !== "undefined" ? window.location.origin : ""}/api/webhooks/azure?token=AZDO_WEBHOOK_TOKEN
          </code>
        </p>
      </Panel>
  );
}
