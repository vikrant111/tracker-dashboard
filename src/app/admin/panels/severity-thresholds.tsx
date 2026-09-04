"use client";

/**
 * Per-severity ageing, for one POD.
 *
 * A Critical open for three days and a Minor open for three days are not the
 * same problem, but one threshold judged them identically — so a board could
 * either nag about Minors or stay quiet about Criticals, never neither.
 *
 * These four boxes are the whole answer. A POD-level box sat above them until
 * it was pointed out that it duplicated them: every item has one of these
 * severities, `Unknown` included.
 *
 * Blank means "use the default" and stays blank. Pre-filling each box would
 * turn no overrides into four. The placeholder shows what is inherited, so a
 * blank field still says what will happen.
 */
import { SEVERITIES, type Severity, type Team } from "@/lib/types";
import { AGEING } from "@/lib/constants";

export function SeverityThresholds({
  draft,
  patch,
}: {
  draft: Team;
  patch: (change: Partial<Team>) => void;
}) {
  const current = draft.severityThresholdDays ?? {};

  const set = (severity: Severity, raw: string) => {
    const next = { ...current };
    // Cleared means cleared: drop the key rather than storing 0 or NaN, so the
    // POD threshold takes over again exactly as it did before the override.
    if (raw.trim() === "") delete next[severity];
    else next[severity] = Number(raw);
    patch({ severityThresholdDays: next });
  };

  const tuned = Object.keys(current).length;

  return (
    <div className="flex flex-col gap-2 sm:col-span-2">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="eyebrow">Ageing by severity</span>
        {tuned > 0 && (
          <button
            type="button"
            onClick={() => patch({ severityThresholdDays: {} })}
            className="text-xs text-[var(--ink-muted)] underline-offset-2 transition-colors hover:text-[var(--accent-ink)] hover:underline"
          >
            Clear {tuned === 1 ? "override" : `all ${tuned} overrides`}
          </button>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-4">
        {SEVERITIES.map((severity) => {
          const value = current[severity];
          return (
            <label key={severity} className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-[var(--ink)]">{severity}</span>
              <input
                type="number"
                min={AGEING.min}
                max={AGEING.max}
                /* Controlled, and `?? ""` rather than `|| ""` — a real 0 is out
                   of range and rejected on save, but silently blanking it would
                   hide why the save failed. */
                value={value ?? ""}
                placeholder={String(AGEING.defaultThresholdDays)}
                onChange={(e) => set(severity, e.target.value)}
                aria-label={`${severity} ageing threshold in days`}
              />
            </label>
          );
        })}
      </div>

      <span className="text-xs text-[var(--ink-muted)]">
        Days before an open item of that severity counts as aged. Leave blank for the default of{" "}
        {AGEING.defaultThresholdDays} days.
      </span>
    </div>
  );
}
