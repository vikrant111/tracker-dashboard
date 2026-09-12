/**
 * The arithmetic and parsing behind the date picker.
 *
 * In a `.ts` module rather than inside the component, for a reason the checks
 * enforce: Node's type stripping cannot load a `.tsx` file, so pure logic
 * living in one is logic no check can reach. Typing a date is the part most
 * likely to be wrong and least visible when it is, so it belongs where it can
 * be exercised directly.
 */
import { RANGE_SEP, cleanPeriod } from "./period.ts";

export const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const WEEKDAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];

/**
 * What somebody typed, as a period.
 *
 * Accepts the stored shape and the shapes people actually type. Exported so the
 * parsing is checked without a browser — it is the part most likely to be
 * wrong, and the part a mistake in is least visible.
 */
export function parseTyped(input: string): string {
  const raw = input.trim().toLowerCase();
  if (!raw) return "";

  /*
   * Already a period, or close enough that padding fixes it: `2026-9` →
   * `2026-09`. Written as `$1-0$2`, not `$10$2` — JavaScript reads `$10` as
   * capture group ten, so the first spelling silently produced `$10` followed
   * by the month and never padded anything.
   */
  const padded = raw
    .replace(/^(\d{4})-(\d)$/, "$1-0$2")
    .replace(/^(\d{4})-(\d{2})-(\d)$/, "$1-$2-0$3");
  if (cleanPeriod(padded)) return padded;

  // `sep 2026`, `september 2026`, `2026 sep`.
  const month = MONTHS.findIndex((m) => raw.includes(m.toLowerCase()));
  const year = raw.match(/\b(\d{4})\b/)?.[1];
  if (month >= 0 && year) return `${year}-${String(month + 1).padStart(2, "0")}`;

  // `04/09/2026` and `04-09-2026`, day first, which is how most of the world
  // writes it and how this board's dates already read.
  const dmy = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (dmy) {
    const candidate = `${dmy[3]}-${dmy[2].padStart(2, "0")}-${dmy[1].padStart(2, "0")}`;
    if (cleanPeriod(candidate)) return candidate;
  }

  return "";
}

/**
 * What somebody typed, as a period **or a range**.
 *
 * Two separators, both unambiguous: `..` and the word `to`. A bare dash is
 * deliberately not one — every date here already contains dashes, and
 * `2026-09-01-2026-09-30` cannot be split without guessing where the middle is.
 *
 * Both ends have to parse to a **day**. `sep 2026 to oct 2026` is a month at
 * each end, which is a different idea with a different answer, so it is refused
 * rather than guessed at.
 */
export function parseTypedSpan(input: string): string {
  const raw = String(input ?? "").trim();
  const parts = raw.split(/\s*\.\.\s*|\s+to\s+/i);
  if (parts.length !== 2) return parseTyped(raw);

  const a = parseTyped(parts[0]);
  const b = parseTyped(parts[1]);
  if (a.length !== 10 || b.length !== 10) return "";

  // Swapped rather than refused: clicking the 30th then the 1st says what it
  // means, and answering it with nothing reads as "there is no data".
  return a <= b ? `${a}${RANGE_SEP}${b}` : `${b}${RANGE_SEP}${a}`;
}

/**
 * The years this calendar will navigate between.
 *
 * Not a judgement about dates — a bound. Without one, holding the arrow key
 * walks the year into the range where `Date` gives up, and everything built on
 * it turns into `NaN`.
 */
export const MIN_YEAR = 1970;
export const MAX_YEAR = 2999;

/** A year that can be rendered, whatever was asked for. */
export const clampYear = (year: unknown): number => {
  const n = Math.trunc(Number(year));
  if (!Number.isFinite(n)) return new Date().getUTCFullYear();
  return Math.min(Math.max(n, MIN_YEAR), MAX_YEAR);
};

/**
 * The days of a month, padded to whole weeks starting Monday.
 *
 * Pure, so it is checked directly — and **guarded**, because it was not. A
 * `NaN` year reached `Array(lead)` as `Array(NaN)` and threw
 * `RangeError: Invalid array length`, which is not a blank calendar, it is the
 * whole panel gone. A month outside `0..11` was worse in its own way: it built
 * strings like `2026-100-01` from the raw number and handed them out as dates.
 *
 * So the month is normalised through `Date`, which rolls 12 into January of the
 * next year, and the cells are built from what came back rather than from what
 * was asked for.
 */
export function monthGrid(year: number, month: number): (string | null)[] {
  const m = Math.trunc(Number(month));
  if (!Number.isFinite(m)) return [];

  const first = new Date(Date.UTC(clampYear(year), m, 1));
  // Anything that still will not resolve gives an empty grid, which is a
  // calendar with no days in it — visible, and not a crash.
  if (Number.isNaN(first.getTime())) return [];

  const y = first.getUTCFullYear();
  const mm = first.getUTCMonth();
  const days = new Date(Date.UTC(y, mm + 1, 0)).getUTCDate();

  // getUTCDay() is Sunday-first; this board reads Monday-first.
  const lead = (first.getUTCDay() + 6) % 7;

  const cells: (string | null)[] = Array(lead).fill(null);
  for (let d = 1; d <= days; d++) {
    cells.push(`${y}-${String(mm + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`);
  }
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}
