"use client";

/**
 * One month of days, with the ones that hold data marked and the ones selected
 * highlighted.
 *
 * The dot under a day is the point: without it somebody selects an empty date,
 * sees nothing, and concludes the data was lost. Marking what exists turns the
 * calendar from a date entry box into a map of where the rows are.
 *
 * Whether a day is selected is `inPeriod` — the same function that decides
 * which rows the filter keeps. So picking a whole month lights the whole month,
 * a range lights every day between its ends, and what the calendar shows can
 * never disagree with what the table does.
 *
 * Weeks start on Monday, which is how this board's dates already read.
 */
import { ChevronLeft, ChevronRight } from "lucide-react";
import { MONTHS, WEEKDAYS, monthGrid } from "@/lib/devops/calendar";
import { cleanRange, inPeriod, rangeToSpan } from "@/lib/devops/period";

export function MonthGrid({
  year,
  month,
  value,
  pending,
  hover,
  withRows,
  onStep,
  onPick,
  onHover,
}: {
  year: number;
  month: number;
  /** What is chosen: a prefix, a `from..to` range, or "". */
  value: string;
  /** A range's first end, chosen but not yet completed. */
  pending?: string;
  /** The day under the cursor, so a half-made range previews where it would go. */
  hover?: string;
  /** Days that hold rows. */
  withRows: Set<string>;
  onStep: (by: number) => void;
  onPick: (period: string) => void;
  onHover?: (day: string) => void;
}) {
  const grid = monthGrid(year, month);

  /*
   * What is lit. While a range is half-made, the preview is the real answer:
   * showing the old selection under the cursor would be showing the thing that
   * is about to be replaced.
   */
  const preview = pending && hover ? rangeToSpan(cleanRange(`${pending}..${hover}`) ?? { from: pending, to: pending }) : "";
  const shown = preview || (pending ? pending : value);
  const ends = cleanRange(shown);

  return (
    <>
      {/* Month, with the year one step further out. */}
      <div className="mb-2 flex items-center justify-between">
        <button type="button" onClick={() => onStep(-1)} aria-label="Previous month" className="rounded-md p-1 hover:bg-[var(--wash)]">
          <ChevronLeft size={15} />
        </button>

        <span className="flex items-center gap-1.5">
          <button type="button" onClick={() => onPick(`${year}-${String(month + 1).padStart(2, "0")}`)} className="text-sm font-medium hover:text-[var(--accent-ink)]">
            {MONTHS[month]}
          </button>
          <button type="button" onClick={() => onPick(String(year))} className="text-sm font-medium tabular-nums hover:text-[var(--accent-ink)]">
            {year}
          </button>
        </span>

        <button type="button" onClick={() => onStep(1)} aria-label="Next month" className="rounded-md p-1 hover:bg-[var(--wash)]">
          <ChevronRight size={15} />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-0.5 text-center" onMouseLeave={() => onHover?.("")}>
        {WEEKDAYS.map((d) => (
          <span key={d} className="pb-1 text-[10px] uppercase tracking-wide text-[var(--ink-muted)]">{d}</span>
        ))}

        {grid.map((day, i) => {
          if (!day) return <span key={`gap-${i}`} />;

          const has = withRows.has(day);
          const on = inPeriod(day, shown) || day === shown;
          /*
           * The two ends carry the strong fill and the rounding; the days
           * between get a flat tint, so a range reads as one bar rather than as
           * thirty separate selections.
           */
          const isEnd = ends ? day === ends.from || day === ends.to : on;

          return (
            <button
              key={day}
              type="button"
              onClick={() => onPick(day)}
              onMouseEnter={() => onHover?.(day)}
              onFocus={() => onHover?.(day)}
              aria-pressed={on}
              className={`relative py-1 text-xs tabular-nums transition-colors ${
                on
                  ? isEnd
                    ? "rounded-md bg-[var(--accent-tint)] font-semibold text-[var(--accent-ink)]"
                    : "bg-[color-mix(in_oklab,var(--accent-tint)_55%,transparent)] text-[var(--accent-ink)]"
                  : "rounded-md hover:bg-[var(--wash)]"
              } ${has || on ? "" : "text-[var(--ink-muted)]"}`}
            >
              {Number(day.slice(8))}
              {has && <span aria-hidden className="absolute bottom-0.5 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-[var(--accent)]" />}
            </button>
          );
        })}
      </div>
    </>
  );
}
