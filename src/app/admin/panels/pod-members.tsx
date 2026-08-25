"use client";

/** Who is in a POD. Names must match the Azure Boards display name. */
import { Plus, Trash2 } from "lucide-react";
import { Button, Panel, PanelHeader } from "@/components/ui";
import type { Member, Team } from "@/lib/types";
import { LIMITS } from "@/lib/constants";
import { BLANK_MEMBER } from "./blank-team";
import { Field, updateMember } from "./field";

export function PodMembersPanel({
  draft,
  setDraft,
  busy,
  armed,
  setArmed,
  saveTeam,
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
}) {
  const patch = (change: Partial<Team>) => setDraft({ ...draft, ...change });

  return (
      <Panel className="p-6">
        <PanelHeader
          eyebrow={`${draft.members.length} people`}
          title="Team members"
          action={
            <Button onClick={() => patch({ members: [...draft.members, { ...BLANK_MEMBER }] })}>
              <Plus size={14} />
              Add member
            </Button>
          }
        />
        <p className="-mt-3 mb-4 text-xs text-[var(--ink-muted)]">
          Name must match the Azure Boards display name so work items map to the right person. Email is used
          when you grant them dashboard access below.
        </p>

        <div className="flex flex-col gap-2">
          {draft.members.map((member, i) => (
            <div key={i} className="grid gap-2 sm:grid-cols-[1.1fr_1.2fr_1fr_auto_auto]">
              <input
                value={member.name}
                placeholder="Full name"
                onChange={(e) => updateMember(draft, setDraft, i, { name: e.target.value })}
              />
              <input
                value={member.email}
                placeholder="email@company.com"
                onChange={(e) => updateMember(draft, setDraft, i, { email: e.target.value })}
              />
              <input
                value={member.designation}
                placeholder="Designation"
                onChange={(e) => updateMember(draft, setDraft, i, { designation: e.target.value })}
              />
              <select
                value={member.role}
                onChange={(e) =>
                  updateMember(draft, setDraft, i, { role: e.target.value as Member["role"] })
                }
                className="!w-auto"
              >
                <option value="member">Member</option>
                <option value="lead">Lead</option>
              </select>
              <button
                onClick={() => patch({ members: draft.members.filter((_, j) => j !== i) })}
                title="Remove member"
                className="rounded-lg p-2 text-[var(--ink-muted)] transition-colors hover:bg-[var(--danger-tint)] hover:text-[var(--danger-ink)]"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      </Panel>
  );
}
