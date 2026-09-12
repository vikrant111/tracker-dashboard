"use client";

/**
 * The three sign-offs on a pull request, as pressable chips.
 *
 * Each one stores **who** pressed it. That is the whole value of the record —
 * an approval with no name against it says nothing — which is why this is open
 * to anyone signed in rather than to admins: a process only admins can operate
 * is one nobody uses.
 *
 * A missing sign-off is a dashed outline in the warning ink rather than a gap.
 * A gap reads as "nothing to do here", and this is precisely the thing somebody
 * has to do.
 */
import { SIGNOFF_LABEL, SIGNOFF_LEVELS } from "@/lib/devops/signoff";
import { STATUS_INK } from "@/lib/palette";
import type { PullRecord } from "@/lib/devops/types";
import { Tooltip } from "@/components/ui";

export function SignoffToggles({
  pr,
  busy,
  onToggle,
}: {
  pr: PullRecord;
  busy: boolean;
  onToggle: (pr: PullRecord, level: string, on: boolean) => void;
}) {
  return (
    <>
      {SIGNOFF_LEVELS.map((level) => {
        const sig = pr.signoffs?.[level];
        return (
          <Tooltip
            key={level}
            label={
              sig
                ? `${SIGNOFF_LABEL[level]} signed off by ${sig.by} on ${new Date(sig.at).toLocaleDateString()}`
                : `Record ${SIGNOFF_LABEL[level]} sign-off. Your name is stored against it.`
            }
          >
            <button
              type="button"
              aria-pressed={Boolean(sig)}
              disabled={busy}
              onClick={() => onToggle(pr, level, !sig)}
              className={`rounded-md border px-1.5 py-0.5 text-[11px] font-medium transition-colors disabled:opacity-50 ${
                sig
                  ? "border-[var(--st-good)] text-[var(--st-good-ink)]"
                  : "border-dashed border-[var(--hairline)] text-[var(--ink-muted)] hover:text-[var(--ink)]"
              }`}
              style={sig ? undefined : { color: STATUS_INK.warning }}
            >
              {sig ? "✓ " : ""}
              {SIGNOFF_LABEL[level]}
            </button>
          </Tooltip>
        );
      })}
    </>
  );
}
