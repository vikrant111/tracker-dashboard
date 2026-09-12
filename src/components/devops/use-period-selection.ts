"use client";

/**
 * The state behind the date picker: which month is on screen, which end of a
 * range the next click fills, and when a selection is finished enough to
 * commit.
 *
 * Lifted out of `period-picker.tsx`, which is about what the popover looks
 * like. This is the part with rules in it, and the rules are the part that was
 * wrong: a `NaN` year from a query string used to throw
 * `RangeError: Invalid array length` out of `monthGrid` and take the whole
 * panel with it.
 *
 * Everything here is clamped on the way in. The value arrives in a URL, so
 * "somebody typed nonsense into the address bar" is a normal input, not an
 * attack.
 */
import { useState } from "react";
import { MAX_YEAR, MIN_YEAR, clampYear } from "@/lib/devops/calendar";
import { RANGE_SEP, cleanRange, cleanSpan } from "@/lib/devops/period";

export function usePeriodSelection(value: string, onChange: (period: string) => void, close: () => void) {
  const chosen = cleanRange(value);
  const [from, setFrom] = useState(chosen?.from ?? "");
  const [to, setTo] = useState(chosen?.to ?? "");
  const [active, setActive] = useState<"from" | "to">("from");
  const [hover, setHover] = useState("");

  /*
   * Where the grid opens. Derived from a value that arrives in a URL, so both
   * halves are guarded: `Number("")` is `NaN`, and a `NaN` year is what used to
   * crash the grid rather than show an empty month.
   */
  const today = new Date();
  const anchor = cleanSpan(value).slice(0, 7) || `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;
  const openMonth = Number(anchor.slice(5, 7)) - 1;
  const [year, setYear] = useState(clampYear(anchor.slice(0, 4)));
  const [month, setMonth] = useState(openMonth >= 0 && openMonth <= 11 ? openMonth : 0);

  const reset = () => {
    setFrom("");
    setTo("");
    setActive("from");
    setHover("");
  };

  /** Commit a whole period — a month, a year, or a typed value — and close. */
  const pick = (period: string) => {
    const range = cleanRange(period);
    setFrom(range?.from ?? "");
    setTo(range?.to ?? "");
    setActive("from");
    setHover("");
    onChange(period);
    close();
  };

  /**
   * A day click fills whichever end is active.
   *
   * Filling **From** moves to **To** and commits nothing yet — a range with one
   * end is not a range. Filling **To** completes it and closes, because at that
   * point there is nothing left to say.
   */
  const pickDay = (day: string) => {
    if (active === "from") {
      setFrom(day);
      setActive("to");
      // A start after the existing end is a new range, not a backwards one.
      if (to && day > to) setTo("");
      return;
    }

    setTo(day);
    setHover("");
    setActive("from");
    /*
     * The span, or the day on its own. A `cleanSpan` that comes back empty
     * would reach `onChange("")` and silently clear the filter — the one thing
     * somebody completing a range cannot have meant.
     */
    onChange(cleanSpan(`${from || day}${RANGE_SEP}${day}`) || day);
    close();
  };

  /*
   * Clamped. Held down, an arrow key walks the year into the range where
   * `Date` gives up and everything built on it becomes `NaN`.
   */
  const step = (by: number) => {
    const next = new Date(Date.UTC(clampYear(year), month + by, 1));
    if (Number.isNaN(next.getTime())) return;

    const stepped = next.getUTCFullYear();
    if (stepped < MIN_YEAR || stepped > MAX_YEAR) return;

    setYear(stepped);
    setMonth(next.getUTCMonth());
  };

  return {
    from,
    to,
    active,
    setActive,
    hover,
    setHover,
    year,
    month,
    /** The half-made range: what is lit, and what a preview extends from. */
    pending: from && !to ? from : "",
    pick,
    pickDay,
    reset,
    step,
  };
}
