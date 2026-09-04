/**
 * Every number on the board, computed from a list of items.
 *
 * The **only** implementation. Both storage drivers hand this the items that
 * matched, and it produces the same dashboard from either — so switching a
 * driver cannot move a figure, and a bar cannot disagree with the drawer it
 * opens because there is nothing for them to disagree about.
 *
 * Pure: no database, no clock of its own, no I/O. `now` is passed in so every
 * panel is measured from the same instant — otherwise two of them straddle
 * midnight and differ by a day.
 */
import { PAGE } from "../lib/constants.ts";
import { DAY_MS, daysAgo, floorDay, floorWeek } from "../lib/metrics/dates.ts";
import type { Bucket, Dashboard, TrendPoint } from "../lib/metrics/types.ts";
import { SEVERITIES } from "../lib/types.ts";
import type { ItemDoc } from "../db/models/index.ts";
import { AGEING_KEYS } from "../db/query/stages.ts";
import {
  agedBefore,
  agreedThreshold,
  thresholdFor,
  widestThreshold,
  type ThresholdRules,
} from "../lib/metrics/threshold.ts";
import { fillSeries, orderedBuckets, round1 } from "./dashboard.shape.ts";
import { at, ageingKey, histogram, tally } from "./dashboard.parts.ts";

export type AggregateInput = ThresholdRules & {
  items: ItemDoc[];
  now: number;
  /** The selected POD's threshold, or the default when none is selected. */
  thresholdDays: number;
};

/** Everything the dashboard renders, except the roster and the health score. */
export function aggregateDashboard(input: AggregateInput): Omit<Dashboard, "health" | "assignees"> & {
  assignees: {
    name: string;
    email: string;
    total: number;
    active: number;
    critical: number;
    aged: number;
    avgAgeDays: number;
    severity: Bucket[];
  }[];
} {
  const { items, now } = input;
  /*
   * Aged per POD and per severity, not per board. `thresholdFor` holds the
   * precedence and the drill-down behind every number here asks it too. When
   * this used one default, a POD set to 30 days had its items counted as aged
   * after 7 as soon as the picker said "All PODs".
   */
  const agedBeforeFor = (item: { teamId?: unknown; severity?: unknown }): number =>
    agedBefore(input, now, item.teamId, item.severity);
  const bound = (days: number) => floorDay(daysAgo(now, days));
  const bounds = { d3: bound(3), d7: bound(7), d14: bound(14), d30: bound(30) };

  const open = items.filter((i) => i.isActive === true);

  let ageSum = 0;
  let criticalAged = 0;
  for (const item of open) {
    const created = at(item.createdDate) ?? now;
    ageSum += (now - created) / DAY_MS;
    if (item.severity === "Critical" && created <= agedBeforeFor(item)) criticalAged++;
  }

  const totals = {
    total: items.length,
    active: open.length,
    closed: items.length - open.length,
    avgAgeDays: round1(open.length ? ageSum / open.length : 0),
    criticalAged,
    environments: new Set(open.map((i) => String(i.environment || "Unknown"))).size,
  };

  /* Per person, over everything that matched — closed items included. */
  const people = new Map<string, ItemDoc[]>();
  for (const item of items) {
    const name = String(item.assignee ?? "");
    const list = people.get(name);
    if (list) list.push(item);
    else people.set(name, [item]);
  }

  const assignees = [...people.entries()]
    .map(([name, rows]) => {
      const theirs = rows.filter((i) => i.isActive === true);
      const sum = theirs.reduce((acc, i) => acc + (now - (at(i.createdDate) ?? now)) / DAY_MS, 0);
      return {
        name,
        email: String(rows.find((r) => r.assigneeEmail)?.assigneeEmail ?? ""),
        total: rows.length,
        active: theirs.length,
        critical: theirs.filter((i) => i.severity === "Critical").length,
        aged: theirs.filter((i) => (at(i.createdDate) ?? now) <= agedBeforeFor(i)).length,
        avgAgeDays: round1(theirs.length ? sum / theirs.length : 0),
        severity: tally(theirs, (i) => String(i.severity)),
      };
    })
    .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name))
    .slice(0, PAGE.leaderboard);

  const teamRows = new Map<string, ItemDoc[]>();
  for (const item of items) {
    const id = String(item.teamId ?? "");
    const list = teamRows.get(id);
    if (list) list.push(item);
    else teamRows.set(id, [item]);
  }

  const teams = [...teamRows.entries()]
    .map(([teamId, rows]) => {
      const theirs = rows.filter((i) => i.isActive === true);
      const sum = theirs.reduce((acc, i) => acc + (now - (at(i.createdDate) ?? now)) / DAY_MS, 0);
      return {
        teamId,
        total: rows.length,
        active: theirs.length,
        criticalAged: theirs.filter(
          (i) => i.severity === "Critical" && (at(i.createdDate) ?? now) <= agedBeforeFor(i),
        ).length,
        avgAgeDays: round1(theirs.length ? sum / theirs.length : 0),
        criticalThresholdDays: thresholdFor(input, teamId, "Critical"),
      };
    })
    .sort((a, b) => b.total - a.total || a.teamId.localeCompare(b.teamId))
    .slice(0, PAGE.teams);

  const dailyFrom = floorDay(daysAgo(now, 30));
  const weeklyFrom = floorWeek(daysAgo(now, 84));

  const merge = (raised: Bucket[], closed: Bucket[]): TrendPoint[] => {
    const closedBy = new Map(closed.map((b) => [b.key, b.count]));
    return raised.map((b) => ({ date: b.key, raised: b.count, closed: closedBy.get(b.key) ?? 0 }));
  };

  return {
    generatedAt: new Date(now).toISOString(),
    /*
     * The widest rule actually in play, not the board default. With a POD's
     * ageing living entirely in its severities, echoing the default back would
     * tint a month-long POD "serious" at a fortnight.
     */
    thresholdDays: widestThreshold(input, [...teamRows.keys()], SEVERITIES),
    /*
     * From the PODs that have items, not every POD in scope. An empty POD with
     * a different rule would otherwise print "varies" on a board where every
     * visible item shares one clock.
     */
    criticalThresholdDays: agreedThreshold(input, [...teamRows.keys()], "Critical"),
    severityTuned: Object.values(input.severityThresholds ?? {}).some((m) => Object.keys(m).length > 0),
    totals,
    severity: tally(items, (i) => String(i.severity)),
    environment: tally(items, (i) => String(i.environment)),
    status: tally(items, (i) => String(i.status)),
    ageing: orderedBuckets(
      tally(open, (i) => ageingKey(at(i.createdDate) ?? 0, bounds)),
      AGEING_KEYS,
    ),
    assignees,
    teams,
    trend: {
      daily: merge(
        fillSeries(histogram(items, "createdDate", "day", dailyFrom).map(toRow), dailyFrom, now, "day"),
        fillSeries(histogram(items, "closedDate", "day", dailyFrom).map(toRow), dailyFrom, now, "day"),
      ),
      weekly: merge(
        fillSeries(histogram(items, "createdDate", "week", weeklyFrom).map(toRow), weeklyFrom, now, "week"),
        fillSeries(histogram(items, "closedDate", "week", weeklyFrom).map(toRow), weeklyFrom, now, "week"),
      ),
    },
  };
}

/** `fillSeries` speaks the facet's `{date, count}`; the tally speaks `{key, count}`. */
const toRow = (b: Bucket) => ({ date: b.key, count: b.count });

export { SEVERITIES };
