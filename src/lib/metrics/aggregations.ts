import type { Bucket } from "./types.ts";

/** Shared pieces of the one big aggregation query. */
export const activeFilter = { term: { isActive: true } };

/** Severity is a keyword, so sorting by it needs an explicit rank. Worst first. */
export const SEVERITY_RANK_SCRIPT = {
  source:
    "if (doc['severity'].size() == 0) { return 9; } " +
    "def s = doc['severity'].value; " +
    "if (s == 'Critical') { return 0; } if (s == 'Major') { return 1; } " +
    "if (s == 'Minor') { return 2; } return 3;",
};

export function histogram(field: "createdDate" | "closedDate", interval: "day" | "week", from: number, now: number) {
  return {
    filter: { range: { [field]: { gte: from } } },
    aggs: {
      series: {
        date_histogram: {
          field,
          calendar_interval: interval,
          min_doc_count: 0,
          extended_bounds: { min: from, max: now },
          format: "yyyy-MM-dd",
        },
      },
    },
  };
}

export type AggBucket = { key: string; key_as_string?: string; doc_count: number; [k: string]: unknown };

export const toBuckets = (agg: { buckets?: AggBucket[] } | undefined): Bucket[] =>
  (agg?.buckets || []).map((b) => ({ key: String(b.key_as_string ?? b.key), count: b.doc_count }));
