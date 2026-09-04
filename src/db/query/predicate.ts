/**
 * What a set of filters *means*, as a plain function.
 *
 * This is the same contract `buildMatch` expresses as a Mongo `$match`, and it
 * is the one the JSON driver runs directly. The two are cross-checked against
 * each other by the suite — a bar and the drawer it opens cannot be allowed to
 * disagree because two drivers read "aged, critical, in production" differently.
 *
 * Pure, so the checks exercise it without a database or a server.
 */
import { daysAgo, floorDay } from "../../lib/metrics/dates.ts";
import { agedBefore } from "../../lib/metrics/threshold.ts";
import type { Filters } from "../../lib/metrics/types.ts";
import type { ItemDoc } from "../models/index.ts";
import { stripControl } from "./match.ts";

const ms = (d: Date | string | null | undefined): number | null => {
  if (!d) return null;
  const at = d instanceof Date ? d : new Date(d);
  const t = at.getTime();
  return Number.isNaN(t) ? null : t;
};

const lower = (v: unknown) => String(v ?? "").toLowerCase();

/**
 * Does this item match?
 *
 * Every bound here mirrors `buildMatch` exactly, including the part that is
 * easy to get wrong: ageing bounds are **lower inclusive, upper exclusive**, so
 * a drill-down returns precisely the count printed on the bar. `<=` where this
 * says `<` returns one extra item and the drawer stops agreeing with the chart.
 */
export function matchesFilters(item: ItemDoc, f: Filters, now = Date.now()): boolean {
  if (f.teamId && item.teamId !== f.teamId) return false;
  if (f.kind && f.kind !== "all" && item.kind !== f.kind) return false;
  if (f.severity && item.severity !== f.severity) return false;
  if (f.environment && item.environment !== f.environment) return false;
  if (f.status && item.status !== f.status) return false;
  if (f.assignee && item.assignee !== f.assignee) return false;
  if (f.activeOnly && item.isActive !== true) return false;
  if (f.closedOnly && item.isActive !== false) return false;

  const created = ms(item.createdDate);
  if (created === null) return false;

  if (f.agedOnly) {
    if (item.isActive !== true) return false;
    /*
     * Judged against this item's **own** POD and severity. A drill-down on
     * "aged" must agree with the number that was clicked, and that number is
     * per-POD and — where an admin has tuned it — per-severity.
     */
    if (created > agedBefore(f, now, item.teamId, item.severity)) return false;
  }

  // Older item == earlier createdDate, so a *minimum age* is an *upper bound*.
  if (f.minAgeDays != null && created >= floorDay(daysAgo(now, f.minAgeDays))) return false;
  if (f.maxAgeDays != null && created < floorDay(daysAgo(now, f.maxAgeDays))) return false;

  if (f.createdFrom && created < new Date(f.createdFrom).getTime()) return false;
  if (f.createdTo && created >= new Date(f.createdTo).getTime()) return false;

  if (f.search) {
    const term = stripControl(f.search).trim().toLowerCase();
    if (term) {
      /*
       * Three ways to find one thing, matching the Mongo side exactly: an
       * **anchored** title prefix, an exact work item id, and an assignee
       * substring. Anchored because an unanchored title match would find
       * "site" inside "microsites" — the same accident that once mislabelled a
       * whole board through unbounded value matching.
       */
      const hit =
        lower(item.title).startsWith(term) ||
        String(item.workItemId ?? "") === stripControl(f.search).trim() ||
        lower(item.assignee).includes(term);
      if (!hit) return false;
    }
  }

  return true;
}

/** Severity, worst first — the rank the drawer's "severity" sort needs. */
export function severityRank(item: ItemDoc, order: readonly string[]): number {
  const at = order.indexOf(String(item.severity));
  return at === -1 ? order.length : at;
}
