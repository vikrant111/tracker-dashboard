"use client";

/**
 * Clearing a POD's work items by date, on the dashboard.
 *
 * The same control the DevOps board uses for its own rows — one picker, one
 * count-then-confirm flow, one set of safety rules — rather than a second one
 * that drifts. Two things make it a POD screen:
 *
 *  - it offers **only** work items, because nobody clearing a quarter of bugs
 *    should be able to delete release announcements from the same dialog;
 *  - it picks its **own** POD, rather than following whatever the board is
 *    filtered to. Deleting is not filtering: the scope of a delete has to be
 *    stated deliberately, not inherited from a control somebody set for a
 *    different reason and has since forgotten about.
 *
 * "Every POD" is offered, and says so in the title, because a clear-everything
 * that looks like a clear-one is the worst version of this control.
 */
import { useState } from "react";
import { PurgePanel } from "./devops/purge-panel";
import { POD_PURGE_TARGETS } from "@/lib/devops/purge-targets";

export function PodPurgePanel({
  teams,
  flash,
  onDone,
}: {
  teams: { id: string; name: string }[];
  flash: (text: string, tone?: "ok" | "bad") => void;
  onDone: () => void;
}) {
  /* Blank means every POD. Deliberately not seeded from the board's filter. */
  const [teamId, setTeamId] = useState("");

  const list = Array.isArray(teams) ? teams : [];
  const chosen = list.find((t) => t.id === teamId);

  return (
    <PurgePanel
      known={[]}
      targets={POD_PURGE_TARGETS}
      scope={teamId ? { teamId } : undefined}
      title={chosen ? `Clear work items — ${chosen.name}` : "Clear work items — every POD"}
      scopeControl={
        <select
          aria-label="Which POD to clear"
          value={teamId}
          onChange={(e) => setTeamId(e.target.value)}
          /* `w-auto`: the base rule sets `width: 100%` on every select, which
             would put this on a line of its own. */
          className="w-auto max-w-[16rem] rounded-lg border border-[var(--hairline)] bg-[var(--panel)] py-1.5 pl-2.5 pr-8 text-sm"
        >
          <option value="">Every POD</option>
          {list.map((t) => (
            <option key={t.id} value={t.id}>{t.name}</option>
          ))}
        </select>
      }
      flash={flash}
      onDone={onDone}
    />
  );
}
