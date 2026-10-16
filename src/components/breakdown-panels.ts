import { AlertTriangle, Hourglass, ListChecks, Server } from "lucide-react";
import { STATUS } from "@/lib/palette";
import { agedPhrase } from "@/lib/metrics/threshold";
import type { Dashboard } from "@/lib/metrics";

/**
 * The four breakdown panels, as data rather than four near-identical blocks of
 * JSX.
 *
 * Same shape as `healthDrivers` next door, and for the same reason: the copy is
 * the part that changes, and having it inline meant a wording fix meant editing
 * the screen. The **order matters** — it is the reading order of the board, and
 * the stagger delay is derived from it rather than written four times.
 *
 * `note` is where each panel says what its numbers actually count. Severity and
 * status include closed items; ageing does not. Leaving that implicit is how
 * two panels come to look comparable when they are not.
 */
export function breakdownPanels(data: Dashboard) {
  return [
    {
      dimension: "severity" as const,
      icon: AlertTriangle,
      hue: STATUS.critical,
      eyebrow: "Severity",
      title: "How bad is what is open",
      note: "Counts include closed items. Click a row for titles and links.",
      buckets: data.severity,
    },
    {
      dimension: "status" as const,
      icon: ListChecks,
      hue: "var(--series-1)",
      eyebrow: "Bug status",
      title: "Where items are sitting",
      note: "Status is mapped from your board's own states. Click through for the list.",
      buckets: data.status,
    },
    {
      dimension: "environment" as const,
      icon: Server,
      hue: "var(--series-3)",
      eyebrow: "Environment",
      title: "Where they were raised",
      note: "Read from the environment field, then tags, then area path.",
      buckets: data.environment,
    },
    {
      dimension: "ageing" as const,
      icon: Hourglass,
      hue: "var(--series-4)",
      eyebrow: "Ageing",
      title: "How long open items have waited",
      /*
       * "Working days" said out loud. The buckets are counted Monday to Friday
       * like every other age on this board, and a reader who assumes calendar
       * days reads a bug as having sat half as long again as it has.
       */
      note: `Open items only, counted in working days — weekends do not count. Aged is ${agedPhrase(data)}.`,
      buckets: data.ageing,
    },
  ];
}
