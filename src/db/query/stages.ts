/**
 * The reusable pieces of the dashboard pipeline.
 *
 * Everything here is a fragment of an aggregation, kept out of the controller
 * so the controller reads as a list of what the board shows rather than a wall
 * of operators.
 */
import type { PipelineStage } from "mongoose";
import { DAY_MS } from "../../lib/metrics/dates.ts";
import { SEVERITIES } from "../../lib/types.ts";

/** Open items. The dashboard's severity, ageing and average-age all sit behind it. */
export const ACTIVE = { isActive: true } as const;

/**
 * Age in days, as a number the pipeline can average.
 *
 * The OpenSearch version was a painless script; this is plain arithmetic on the
 * date. `now` is passed in rather than read as `$$NOW` so that every number on
 * one dashboard is measured from the *same* instant — otherwise two panels can
 * straddle midnight and disagree by a day.
 */
export const ageInDays = (now: number) => ({
  $divide: [{ $subtract: [new Date(now), "$createdDate"] }, DAY_MS],
});

/**
 * Count documents matching a condition, inside a `$group`.
 *
 * `$sum` of 1-or-0 rather than a second `$match`, because inside `$facet` every
 * extra `$match` re-scans the branch's input.
 */
export const countIf = (condition: unknown) => ({ $sum: { $cond: [condition, 1, 0] } });

/** The `$expr`-style form of "this item is open". */
export const IS_ACTIVE = { $eq: ["$isActive", true] };

/** Open **and** critical **and** older than the POD's threshold. */
export const isCriticalAged = (agedBefore: Date) => ({
  $and: [IS_ACTIVE, { $eq: ["$severity", "Critical"] }, { $lte: ["$createdDate", agedBefore] }],
});

/**
 * A `terms` aggregation: group by one field, count, biggest first.
 *
 * `limit` mirrors the `size` the OpenSearch version asked for. It is applied
 * after sorting, so the cap drops the smallest groups rather than an arbitrary
 * set — the same behaviour as before.
 */
export const termsFacet = (field: string, limit: number): PipelineStage.FacetPipelineStage[] => [
  { $group: { _id: `$${field}`, count: { $sum: 1 } } },
  { $sort: { count: -1 as const, _id: 1 as const } },
  { $limit: limit },
  { $project: { _id: 0, key: { $ifNull: ["$_id", "Unknown"] }, count: 1 } },
];

/**
 * Severity, worst first.
 *
 * Severity is a string, so sorting alphabetically puts Critical after Major.
 * This is the rank the OpenSearch build did with a painless script, and the
 * order comes from `SEVERITIES` itself so adding one cannot leave the two out
 * of step.
 */
export const SEVERITY_RANK = {
  $switch: {
    branches: SEVERITIES.map((s, i) => ({ case: { $eq: ["$severity", s] }, then: i })),
    default: SEVERITIES.length,
  },
};

/**
 * The ageing buckets, as one `$switch` per document.
 *
 * `$bucket` would need sorted numeric boundaries and cannot express an open
 * end, so the buckets are labelled directly. Bounds are **lower inclusive,
 * upper exclusive** and identical to the ones `buildMatch` uses for
 * `minAgeDays`/`maxAgeDays`, which is what makes a bar and its drawer agree.
 *
 * `bounds` arrives newest-first: `[3d, 7d, 14d, 30d]` as absolute epoch millis.
 */
export const AGEING_KEYS = ["0-3 days", "4-7 days", "8-14 days", "15-30 days", "30+ days"] as const;

export const ageingBucket = (bounds: { d3: number; d7: number; d14: number; d30: number }) => ({
  $switch: {
    branches: [
      { case: { $gte: ["$createdDate", new Date(bounds.d3)] }, then: AGEING_KEYS[0] },
      { case: { $gte: ["$createdDate", new Date(bounds.d7)] }, then: AGEING_KEYS[1] },
      { case: { $gte: ["$createdDate", new Date(bounds.d14)] }, then: AGEING_KEYS[2] },
      { case: { $gte: ["$createdDate", new Date(bounds.d30)] }, then: AGEING_KEYS[3] },
    ],
    default: AGEING_KEYS[4],
  },
});

/**
 * A date histogram over one field.
 *
 * `$dateTrunc` in UTC, to match the absolute epoch bounds the rest of the
 * pipeline uses. Weeks start on Monday, which is what OpenSearch's
 * `calendar_interval: week` did — starting on Sunday would shift every weekly
 * point by a day and silently change the chart.
 *
 * Empty buckets are **not** filled here; the controller does that, because the
 * pipeline cannot invent documents that do not exist.
 */
export const histogramFacet = (
  field: "createdDate" | "closedDate",
  unit: "day" | "week",
  from: number,
): PipelineStage.FacetPipelineStage[] => [
  { $match: { [field]: { $gte: new Date(from) } } },
  {
    $group: {
      _id: { $dateTrunc: { date: `$${field}`, unit, timezone: "UTC", startOfWeek: "monday" } },
      count: { $sum: 1 },
    },
  },
  { $sort: { _id: 1 as const } },
  { $project: { _id: 0, date: "$_id", count: 1 } },
];
