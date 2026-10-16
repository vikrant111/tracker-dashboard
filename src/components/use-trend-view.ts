"use client";

/**
 * The closure trend's own slice and window, as state plus the query params the
 * server reads.
 *
 * A hook rather than separate `useState`s in the board, because these move
 * together: they are reset together, they travel together, and they are
 * deliberately *not* the board's filters — picking `Production` for the chart
 * must not re-scope the tiles beside it. See `Filters.trendFrom`.
 */
import { useMemo, useState } from "react";
import { periodBounds } from "@/lib/devops/period-bounds";

export function useTrendView() {
  const [facet, setFacet] = useState("");
  /*
   * Held as a **period string** — `2026-09`, `2026-09-01..2026-09-30`, or ""
   * — which is what `PeriodPicker` speaks. The two dates the server wants are
   * derived from it by `periodBounds` rather than stored beside it: two
   * representations of one choice is how a control and a chart start
   * disagreeing about which month is on screen.
   */
  const [period, setPeriod] = useState("");

  const params = useMemo(() => {
    const q: Record<string, string> = {};
    if (facet) q.trendFacet = facet;
    const bounds = periodBounds(period);
    if (bounds) {
      q.trendFrom = bounds.from;
      q.trendTo = bounds.to;
    }
    return q;
  }, [facet, period]);

  return {
    params,
    controls: { facet, onFacet: setFacet, period, onPeriod: setPeriod },
  };
}
