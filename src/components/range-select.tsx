"use client";

/**
 * Which stretch of the window the board is showing.
 *
 * A native `<select>`, matching the POD switcher beside it: the options are a
 * short, known list, and a hand-built dropdown would mean re-implementing
 * keyboard handling, touch behaviour and the mobile picker that every platform
 * already has. The POD switcher settled this question first; this follows it.
 *
 * Each option carries its dates in `title`, because `Q2 FY27` is not something
 * everybody can convert in their head — and a quarter the window cut short says
 * so there rather than reading as a quiet quarter.
 */
import type { DateRange } from "@/lib/contracts/date-ranges";

export function RangeSelect({
  ranges,
  value,
  onChange,
  id,
}: {
  ranges: DateRange[];
  value: string;
  onChange: (id: string) => void;
  /** Distinct per render site: this control appears in the bar and in the narrow-screen menu. */
  id: string;
}) {
  const chosen = ranges.find((r) => r.id === value) ?? ranges[0];

  return (
    <>
      <label className="sr-only" htmlFor={id}>
        Date range
      </label>
      <select
        id={id}
        value={chosen.id}
        title={chosen.hint}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-lg border border-[var(--hairline)] bg-[var(--panel)] px-2.5 py-1.5 text-sm text-[var(--ink)]"
      >
        {ranges.map((r) => (
          <option key={r.id} value={r.id} title={r.hint}>
            {r.label}
            {r.partial ? " (part)" : ""}
          </option>
        ))}
      </select>
    </>
  );
}
