import { STATUS } from "@/lib/palette";
import type { Dashboard } from "@/lib/metrics";

/**
 * The three numbers worth knowing about the board.
 *
 * Only *Still open* moves the score — it is `closed / total`, and nothing else
 * reaches it. The other two are here precisely because the score is blind to
 * them: it says how much work is left, and they say how old and how bad what is
 * left has become.
 */
export function healthDrivers(data: Dashboard) {
  const drivers: {
    label: string;
    value: string;
    /** Shown beside the value, so a count that is really a share reads as one. */
    of?: string;
    hue: string;
    query: Record<string, string>;
    hint: string;
  }[] = [
    {
      label: "Critical aged",
      value: String(data.totals.criticalAged),
      hue: STATUS.critical,
      query: { severity: "Critical", agedOnly: "true" },
      hint: `open past ${data.thresholdDays} days`,
    },
    {
      label: "Average age",
      value: `${data.totals.avgAgeDays}d`,
      hue: STATUS.warning,
      query: { activeOnly: "true" },
      hint: "across open items",
    },
    {
      label: "Still open",
      value: String(data.totals.active),
      /*
       * The denominator is the point. `2` next to a score of 55 reads as
       * unexplained; `2 of 360` reads as a board that is nearly clear and
       * losing its points somewhere else — which is what the score means. The
       * share is also what health docks on, so showing one without the other
       * hides the arithmetic.
       */
      of: data.totals.total > 0 ? `of ${data.totals.total}` : undefined,
      hue: "var(--accent-2)",
      query: { activeOnly: "true" },
      hint: `of ${data.totals.total} tracked`,
    },
  ];

  return drivers;
}
