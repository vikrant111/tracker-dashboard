"use client";

/**
 * The **From** and **To** ends of a date range, and which one the next click
 * fills.
 *
 * Two fields rather than "click twice and hope", because a two-click gesture
 * with no state on screen leaves somebody who clicked once with no way to tell
 * what the calendar is waiting for. The active field is the answer, and it is
 * also the way back: press **From** again to re-pick the start without
 * starting over.
 */
import { describePeriod } from "@/lib/devops/period";

export function RangeFields({
  from,
  to,
  active,
  onActive,
  onClear,
}: {
  from: string;
  to: string;
  /** Which end the next day click fills. */
  active: "from" | "to";
  onActive: (end: "from" | "to") => void;
  onClear: () => void;
}) {
  const field = (end: "from" | "to", day: string) => (
    <button
      type="button"
      onClick={() => onActive(end)}
      aria-pressed={active === end}
      className={`flex-1 rounded-lg border px-2 py-1 text-left transition-colors ${
        active === end
          ? "border-[var(--accent)] bg-[var(--accent-tint)]"
          : "border-[var(--hairline)] bg-[var(--wash)] hover:border-[var(--accent-line)]"
      }`}
    >
      <span className="eyebrow block">{end === "from" ? "From" : "To"}</span>
      <span className={`block text-xs tabular-nums ${day ? "text-[var(--ink)]" : "text-[var(--ink-muted)]"}`}>
        {day ? describePeriod(day) : "Pick a day"}
      </span>
    </button>
  );

  return (
    <div className="mb-2 flex items-stretch gap-1.5">
      {field("from", from)}
      {field("to", to)}

      {(from || to) && (
        <button
          type="button"
          onClick={onClear}
          className="rounded-lg border border-[var(--hairline)] px-2 text-[11px] text-[var(--ink-muted)] transition-colors hover:text-[var(--ink)]"
        >
          Reset
        </button>
      )}
    </div>
  );
}
