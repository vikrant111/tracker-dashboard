"use client";

/** Every POD, and which one is open. */
import { Trash2 } from "lucide-react";
import { Empty, Panel, PanelHeader } from "@/components/ui";
import type { Team } from "@/lib/types";

export function PodList({
  teams,
  draft,
  setDraft,
  busy,
  armed,
  confirmThen,
  removeTeam,
}: {
  teams: Team[];
  draft: Team | null;
  setDraft: (team: Team | null) => void;
  /** Which async action is in flight. */
  busy: string;
  /** Which destructive action is armed for its second press. */
  armed: string | null;
  confirmThen: (id: string, run: () => void) => void;
  removeTeam: (team: Team) => void;
}) {
  return (
          <Panel className="p-5">
            <PanelHeader eyebrow={`${teams.length} onboarded`} title="PODs" />
            {teams.length === 0 ? (
              <Empty title="No PODs yet" hint="Create one — for example AMC POD — then add its five members." />
            ) : (
              <ul className="flex flex-col gap-1">
                {teams.map((team) => (
                  <li key={team.id} className="flex items-center gap-1">
                    <button
                      onClick={() => setDraft(team)}
                      className={`flex-1 rounded-lg px-3 py-2.5 text-left transition-colors ${
                        draft?.id === team.id ? "bg-[var(--wash-2)]" : "hover:bg-[var(--wash)]"
                      }`}
                    >
                      <span className="block text-sm font-medium">{team.name}</span>
                      <span className="block text-xs text-[var(--ink-muted)]">
                        {team.members.length} member{team.members.length === 1 ? "" : "s"}
                        {team.azure.project ? ` · ${team.azure.project}` : " · not connected"}
                      </span>
                    </button>
                    {/*
                     * Deleting a POD takes every work item under it. Two clicks,
                     * and the armed state says plainly what the second one does.
                     */}
                    <button
                      onClick={() => confirmThen(`del-${team.id}`, () => removeTeam(team))}
                      disabled={busy === `del-${team.id}`}
                      title={
                        armed === `del-${team.id}`
                          ? `Click again to delete ${team.name} and its work items`
                          : `Delete ${team.name}`
                      }
                      className={`shrink-0 rounded-lg px-2 py-2 text-xs font-medium transition-colors ${
                        armed === `del-${team.id}`
                          ? "bg-[var(--danger-tint-2)] text-[var(--danger-ink)]"
                          : "text-[var(--ink-muted)] hover:bg-[var(--danger-tint)] hover:text-[var(--danger-ink)]"
                      }`}
                    >
                      {armed === `del-${team.id}` ? "Sure?" : <Trash2 size={14} />}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
  );
}
