"use client";

/**
 * Picking a year, a month, a day, or a range of days.
 *
 * One control for all four, because on this board they are the same thing —
 * something a date is either inside or outside — and four separate pickers
 * would be four things to learn for one idea.
 *
 * Three ways in, because people arrive knowing different amounts:
 *
 *  - **type it**: `2026`, `2026-09`, `2026-09-04`, `sep 2026`, or a range as
 *    `2026-09-01..2026-09-30` / `1/9/2026 to 30/9/2026`.
 *  - **click it**: pick **From**, then **To**. The calendar lights every day
 *    between them, and previews the range under the cursor while it is
 *    half-made.
 *  - **pick from what exists**: months that actually hold rows, so nobody
 *    selects an empty September and wonders where the data went.
 *
 * The month and year names above the grid still select that whole month or
 * year in one click — a range is for "the 3rd to the 17th", not for a period
 * that already has a name.
 *
 * The rules live in `use-period-selection`; this is the popover around them.
 */
import { CalendarDays, X } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { describePeriod, grainOf, periodsPresent } from "@/lib/devops/period";
import { Button, Tooltip } from "@/components/ui";
import { MonthGrid } from "./month-grid";
import { Popover } from "./popover";
import { RangeFields } from "./range-fields";
import { usePeriodSelection } from "./use-period-selection";
import { parseTypedSpan } from "@/lib/devops/calendar";

export function PeriodPicker({
  value,
  onChange,
  known = [],
  label = "Period",
}: {
  value: string;
  onChange: (period: string) => void;
  /** Dates that actually hold rows, so empty months are not offered. */
  known?: (string | undefined)[];
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  // The popover hangs off this, measured, because a Panel would clip it.
  const triggerRef = useRef<HTMLSpanElement>(null);

  const sel = usePeriodSelection(value, onChange, () => { setOpen(false); setTyped(""); });

  const withRows = useMemo(() => new Set(periodsPresent(known, "day")), [known]);
  const monthsWithRows = useMemo(() => new Set(periodsPresent(known, "month")), [known]);

  const typedSpan = parseTypedSpan(typed);

  return (
    <div className="relative">
      <span ref={triggerRef} className="flex items-center gap-1.5">
        <Button onClick={() => setOpen((v) => !v)}>
          <CalendarDays size={14} />
          {value ? describePeriod(value) : label}
        </Button>

        {value && (
          <Tooltip label="Clear the date filter and show everything.">
            <button
              type="button"
              onClick={() => { sel.reset(); onChange(""); }}
              aria-label="Clear the date filter"
              className="rounded-md p-1 text-[var(--ink-muted)] transition-colors hover:text-[var(--ink)]"
            >
              <X size={13} />
            </button>
          </Tooltip>
        )}
      </span>

      <Popover open={open} onClose={() => setOpen(false)} trigger={triggerRef.current}>
        <input
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && typedSpan) sel.pick(typedSpan);
            if (e.key === "Escape") setOpen(false);
          }}
          placeholder="2026-09, sep 2026, 04/09/2026, 01/09/2026 to 30/09/2026"
          aria-label="Type a year, month, date or range"
          autoFocus
          className="mb-2 w-full rounded-lg border border-[var(--hairline)] bg-[var(--wash)] px-2.5 py-1.5 text-sm"
        />

        {typed && (
          <p className="mb-2 text-xs text-[var(--ink-muted)]">
            {typedSpan ? (
              <button type="button" onClick={() => sel.pick(typedSpan)} className="text-[var(--accent-ink)] hover:underline">
                Use {describePeriod(typedSpan)}
                {grainOf(typedSpan) ? ` (${grainOf(typedSpan)})` : " (range)"} — press Enter
              </button>
            ) : (
              "Not a date yet. Try 2026-09, sep 2026, 04/09/2026, or 01/09/2026 to 30/09/2026."
            )}
          </p>
        )}

        <RangeFields from={sel.from} to={sel.to} active={sel.active} onActive={sel.setActive} onClear={sel.reset} />

        <MonthGrid
          year={sel.year}
          month={sel.month}
          value={value}
          pending={sel.pending}
          hover={sel.hover}
          withRows={withRows}
          onStep={sel.step}
          /* A day starts or finishes a range; a month or a year is one click. */
          onPick={(period) => (period.length === 10 ? sel.pickDay(period) : sel.pick(period))}
          onHover={sel.setHover}
        />

        {monthsWithRows.size > 0 && (
          <div className="mt-2 border-t border-[var(--hairline)] pt-2">
            <p className="eyebrow mb-1">Months with data</p>
            <div className="flex flex-wrap gap-1">
              {[...monthsWithRows].slice(0, 8).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => sel.pick(m)}
                  className="rounded-md bg-[var(--wash)] px-1.5 py-0.5 text-[11px] tabular-nums text-[var(--ink-muted)] transition-colors hover:text-[var(--accent-ink)]"
                >
                  {m}
                </button>
              ))}
            </div>
          </div>
        )}
      </Popover>
    </div>
  );
}
