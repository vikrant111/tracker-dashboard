"use client";

/**
 * The closure trend's own filter row: which kind of bug, and over what period.
 *
 * It sits in the card header's corner, where the Daily/Weekly toggle used to —
 * there is no room for a second row of controls above a chart, and that is
 * where it landed first, pushing the plot down and overlapping it.
 *
 * The period control is **`PeriodPicker`**, the same one the DevOps board uses
 * to clear work items. Reused rather than rebuilt: it already types a period,
 * picks a range on a calendar, flips to stay on screen and escapes the card
 * that would clip it, and a second copy would be a second set of those bugs to
 * find. A period there means the same thing it means here.
 */
import { trendFacetGroups } from "@/lib/contracts/trend-view";
import { PeriodPicker } from "./devops/period-picker";

const field =
  "rounded-lg border border-[var(--hairline)] bg-[var(--panel)] px-2.5 py-1.5 text-sm text-[var(--ink)]";

export function TrendControls({
  facet,
  onFacet,
  period,
  onPeriod,
}: {
  facet: string;
  onFacet: (key: string) => void;
  /** A period string — `2026-09`, `2026-09-01..2026-09-30`, or "" for all. */
  period: string;
  onPeriod: (period: string) => void;
}) {
  return (
    /*
     * `flex-wrap` with `justify-end`: on a narrow screen the header already
     * stacks this under the title, and these two then wrap onto their own line
     * rather than squeezing the heading out.
     */
    <div className="flex flex-wrap items-center justify-end gap-2">
      {/* Labelled for a screen reader only — in a header there is no room for
          a caption, and the control's own text says what it is. */}
      <label className="sr-only" htmlFor="trend-facet">
        Bug type
      </label>
      <select
        id="trend-facet"
        value={facet}
        onChange={(e) => onFacet(e.target.value)}
        title="Which bugs the trend shows"
        className={`${field} max-w-[9.5rem] truncate`}
      >
        <option value="">All bugs</option>
        {trendFacetGroups().map((g) => (
          <optgroup key={g.slice} label={g.label}>
            {g.options.map((o) => (
              <option key={o.key} value={o.key}>
                {o.label}
              </option>
            ))}
          </optgroup>
        ))}
      </select>

      <PeriodPicker value={period} onChange={onPeriod} label="Pick a period" />
    </div>
  );
}
