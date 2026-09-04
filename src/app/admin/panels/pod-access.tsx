"use client";

import { Check, Plus } from "lucide-react";

/**
 * Granting and revoking a member's POD access.
 *
 * The behaviour was always here — the chips were buttons — but nothing said so.
 * Every POD rendered as the same muted pill, granted and not-granted looked
 * alike, and a reader took them for a read-only list of PODs the person
 * happens to be on. Reported as "the admin should be able to give or revoke
 * access", about a control that already did exactly that.
 *
 * So the state is now carried by more than a background tint: a **tick** when
 * granted, a **plus** when not, a solid border against a dashed one, and
 * `aria-pressed` so it is a toggle to a screen reader too. Colour alone was
 * never going to be enough — it is the same rule the charts follow.
 */
export function PodAccess({
  teams,
  granted,
  busy,
  onToggle,
  onAll,
  onNone,
}: {
  teams: { id: string; name: string }[];
  granted: string[];
  busy: boolean;
  onToggle: (teamId: string, next: string[]) => void;
  onAll: () => void;
  onNone: () => void;
}) {
  if (teams.length === 0) {
    return <span className="text-xs text-[var(--ink-muted)]">Create a POD first</span>;
  }

  const all = granted.length === teams.length;

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {teams.map((team) => {
        const on = granted.includes(team.id);
        return (
          <button
            key={team.id}
            type="button"
            disabled={busy}
            aria-pressed={on}
            title={on ? `Revoke ${team.name}` : `Grant ${team.name}`}
            onClick={() =>
              onToggle(team.id, on ? granted.filter((id) => id !== team.id) : [...granted, team.id])
            }
            className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium transition-colors disabled:opacity-50 ${
              on
                ? "border-[var(--accent-line)] bg-[var(--accent-tint)] text-[var(--accent-ink)] hover:bg-[var(--wash-2)]"
                : "border-dashed border-[var(--hairline)] text-[var(--ink-muted)] hover:border-[var(--accent-line)] hover:text-[var(--accent-ink)]"
            }`}
          >
            {on ? <Check size={12} aria-hidden /> : <Plus size={12} aria-hidden />}
            {team.name}
          </button>
        );
      })}

      {/*
       * A shortcut for the common cases, and — more usefully — a second cue
       * that this column is editable at all.
       */}
      <button
        type="button"
        disabled={busy}
        onClick={all ? onNone : onAll}
        className="ml-1 rounded-md px-1.5 py-1 text-xs text-[var(--ink-muted)] underline-offset-2 transition-colors hover:text-[var(--accent-ink)] hover:underline disabled:opacity-50"
      >
        {all ? "None" : "All"}
      </button>
    </div>
  );
}
