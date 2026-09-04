"use client";

/** A POD's name, description and ageing thresholds. */
import { Trash2, X } from "lucide-react";
import { Button, Panel, PanelHeader } from "@/components/ui";
import type { Team } from "@/lib/types";
import { AGEING } from "@/lib/constants";
import { Field } from "./field";
import { SeverityThresholds } from "./severity-thresholds";

export function PodIdentityPanel({
  draft,
  setDraft,
  busy,
  armed,
  setArmed,
  saveTeam,
  removeTeam,
  dirty,
  closeDraft,
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
  removeTeam: (team: Team) => void;
  /** Whether the draft differs from what is stored. */
  dirty: boolean;
  closeDraft: () => void;
}) {
  const patch = (change: Partial<Team>) => setDraft({ ...draft, ...change });

  return (
      <Panel className="p-6">
        <PanelHeader
          eyebrow={draft.id ? `POD id ${draft.id}` : "New POD"}
          title={draft.name || "Name this POD"}
          action={
            <span className="flex flex-wrap items-center gap-2">
              {/* Cancel first, so the destructive-ish option is not the
                  one under the thumb. */}
              <Button onClick={closeDraft} disabled={busy === "save"}>
                <X size={14} />
                {armed === "discard" ? "Discard changes?" : "Cancel"}
              </Button>
              <Button variant="primary" onClick={saveTeam} disabled={busy === "save" || !dirty}>
                {busy === "save" ? "Saving…" : dirty ? "Save POD" : "Saved"}
              </Button>
            </span>
          }
        />

        <div className="grid gap-4 sm:grid-cols-2">
          {/*
            * No POD-level ageing threshold here any more.
            *
            * Four severities cover every item — `Unknown` included — so a fifth
            * number that quietly overrode all of them was a knob with no
            * control: two places to answer one question, and the reader could
            * not see which one had won. The severity row below is the whole
            * answer now.
            */}
          <Field label="POD name" hint="Shown across the dashboard, e.g. AMC POD" className="sm:col-span-2">
            <input value={draft.name} onChange={(e) => patch({ name: e.target.value })} placeholder="AMC POD" />
          </Field>
          <SeverityThresholds draft={draft} patch={patch} />
          <Field label="Description" hint="Optional — what this POD owns" className="sm:col-span-2">
            <input
              value={draft.description}
              onChange={(e) => patch({ description: e.target.value })}
              placeholder="Asset management console"
            />
          </Field>
        </div>
      </Panel>
  );
}
