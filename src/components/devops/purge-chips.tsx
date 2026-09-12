"use client";

/**
 * One chip per collection, showing how many rows a period holds in it and
 * whether it is selected for clearing.
 *
 * A chip with nothing in it is disabled rather than hidden: "Announcements · 0"
 * answers the question, and a row that vanishes leaves somebody wondering
 * whether it was counted at all.
 *
 * Each says which date it is filtered on, because "clear September" is
 * ambiguous until somebody says September of *what* — a bug raised in
 * September and one deployed in September are different rows.
 */
import { PURGE_DATE_FIELD, PURGE_LABEL, type PurgeTarget } from "@/lib/devops/purge-targets";
import { Tooltip } from "@/components/ui";

export function PurgeChips({
  counts,
  chosen,
  onToggle,
}: {
  counts: { target: PurgeTarget; rows: number }[];
  chosen: PurgeTarget[];
  onToggle: (target: PurgeTarget) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {(Array.isArray(counts) ? counts : []).map(({ target, rows }) => {
        const on = chosen.includes(target);
        return (
          <Tooltip
            key={target}
            label={rows === 0 ? "Nothing here for this period." : `${rows} ${PURGE_DATE_FIELD[target]} in this period will be removed.`}
          >
            <button
              type="button"
              aria-pressed={on}
              disabled={rows === 0}
              onClick={() => onToggle(target)}
              className={`rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors disabled:opacity-40 ${
                on && rows > 0
                  ? "border-[var(--accent-line)] bg-[var(--accent-tint)] text-[var(--accent-ink)]"
                  : "border-dashed border-[var(--hairline)] text-[var(--ink-muted)]"
              }`}
            >
              {PURGE_LABEL[target]} · {rows}
            </button>
          </Tooltip>
        );
      })}
    </div>
  );
}
