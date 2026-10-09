/**
 * The date ranges the board offers, and where a quarter starts.
 *
 * **This is the file to edit.** Which ranges appear in the picker, what they are
 * called, and whether a quarter means April–June or January–March are all
 * settings here; nothing in the dropdown or the filter logic holds a list of
 * its own.
 *
 * Nothing here changes what is **fetched**. One Azure read covers the whole
 * window and is cached per POD, so picking a quarter narrows what is already in
 * hand — the dropdown is instant and costs Azure nothing. The range travels as
 * `createdFrom` / `createdTo`, which the dashboard and every drill-down behind
 * it already share, so a tile and the list it opens cannot disagree about which
 * quarter they are showing.
 */
import { LIVE } from "./item-filters.ts";

/**
 * The month a financial year starts in, 1–12.
 *
 * **4 (April)**, because this board is read against an Indian financial year —
 * `Q1` means April to June here, and `FY26` is the year ending March 2026. Set
 * it to `1` for calendar quarters, and the labels follow: `Q1 2026` rather than
 * `Q1 FY26`.
 */
export const FISCAL_START_MONTH: number = 4;

/**
 * The most quarters the picker will offer, including the one in progress.
 *
 * **Five**, because a 365-day window touches parts of five quarters whenever it
 * does not start on a quarter boundary — which is almost always. A cap of four
 * silently dropped the oldest one, and the window is what should decide that:
 * `rangeOptions` stops as soon as a quarter lies entirely outside it, and
 * clamps the one that straddles the edge rather than overselling it.
 */
export const QUARTERS_OFFERED: number = 5;

/** One choice in the dropdown. `from` inclusive, `to` exclusive, both ISO. */
export type DateRange = {
  id: string;
  label: string;
  /** The dates it covers, said plainly — and where it was cut short. */
  hint: string;
  /** Absent on the default range, which applies no date bound at all. */
  from?: string;
  to?: string;
  /** True when the window cut the start short, so the label does not oversell it. */
  partial?: boolean;
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAY_MS = 86_400_000;

/**
 * Months since year 0, so stepping back a quarter is subtraction and nothing
 * has to wrap a month index past December by hand.
 *
 * That wrapping is where this was wrong: the quarter's start year was taken
 * from the year the **financial year** began, so every quarter reaching past
 * December came out a year early — at 15 January 2026 the current quarter was
 * labelled Q4 FY26 and dated January 2025.
 */
const absMonth = (year: number, month: number) => year * 12 + month;
const startOf = (abs: number) => Date.UTC(Math.floor(abs / 12), abs % 12, 1);

const MONTH_LABEL = (abs: number) => MONTHS[abs % 12];

/**
 * Which fiscal quarter a moment falls in: the quarter's own first month, and
 * the financial year it belongs to.
 *
 * `offset` counts months from the start of the financial year, so a January
 * date in an April-start year is month 9 — quarter 4 of the year that began the
 * previous April. Getting that wrong labels three months of work with the wrong
 * year, which somebody then reports upwards.
 */
function quarterAt(at: Date): { fy: number; q: number; abs: number } {
  const month = absMonth(at.getUTCFullYear(), at.getUTCMonth());
  const fyFirstMonth = FISCAL_START_MONTH - 1;
  /* The financial year this month belongs to, as an absolute month. */
  const fyStart = absMonth(at.getUTCFullYear() - (at.getUTCMonth() < fyFirstMonth ? 1 : 0), fyFirstMonth);
  const offset = month - fyStart;
  const q = Math.floor(offset / 3) + 1;
  /*
   * A financial year is named for the year it **ends** in — FY26 runs April
   * 2025 to March 2026 — unless quarters are calendar ones, where the year is
   * simply the year.
   */
  const startYear = Math.floor(fyStart / 12);
  const fy = FISCAL_START_MONTH === 1 ? startYear : startYear + 1;
  return { fy, q, abs: fyStart + (q - 1) * 3 };
}

const asDay = (ms: number) =>
  `${new Date(ms).getUTCDate()} ${MONTHS[new Date(ms).getUTCMonth()]} ${String(new Date(ms).getUTCFullYear()).slice(2)}`;

/**
 * The dropdown's choices, newest first, bounded by the fetch window.
 *
 * The first is the whole window and carries **no** date bound — which is what
 * keeps a long-open bug visible, since those are kept regardless of when they
 * were raised and a `createdFrom` would hide exactly them.
 *
 * A quarter reaching back past the window has its start clamped and is marked
 * `partial`, so the reader is told the quarter is cut short rather than reading
 * a low number as a quiet quarter.
 */
export function rangeOptions(now = Date.now()): DateRange[] {
  const floor = now - LIVE.windowDays * DAY_MS;
  const out: DateRange[] = [
    {
      id: "window",
      label: `Last ${LIVE.windowDays} days`,
      hint: `${asDay(floor)} to today, plus anything still open`,
    },
  ];

  let { q, fy, abs } = quarterAt(new Date(now));

  for (let i = 0; i < QUARTERS_OFFERED; i++) {
    const from = startOf(abs);
    const to = startOf(abs + 3);
    /* Entirely before the window: nothing of it was fetched, so offering it
       would show an empty quarter as though it had been a quiet one. */
    if (to <= floor) break;

    const clamped = Math.max(from, floor);
    const partial = clamped > from;
    const endsAt = Math.min(to, now);
    out.push({
      id: `fy${fy}q${q}`,
      label: FISCAL_START_MONTH === 1 ? `Q${q} ${fy}` : `Q${q} FY${String(fy).slice(2)}`,
      hint: `${MONTH_LABEL(abs)}–${MONTH_LABEL(abs + 2)} · ${asDay(clamped)} to ${asDay(endsAt)}${partial ? ", cut short by the window" : ""}`,
      from: new Date(clamped).toISOString(),
      to: new Date(to).toISOString(),
      partial,
    });

    /* One quarter back. Subtraction, because the months are absolute. */
    abs -= 3;
    q -= 1;
    if (q < 1) {
      q = 4;
      fy -= 1;
    }
  }

  return out;
}

/** The chosen range, or the default when the id is unknown — a stale bookmark. */
export function rangeById(id: string, now = Date.now()): DateRange {
  const options = rangeOptions(now);
  return options.find((o) => o.id === id) ?? options[0];
}
