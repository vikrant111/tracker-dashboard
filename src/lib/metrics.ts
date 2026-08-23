import { IDX, ensureIndices, search } from "./opensearch";
import type { Item, Kind } from "./types";
import { PAGE } from "./constants";
import { healthScore } from "./health";
import { mergeRoster, type RosterPerson } from "./roster";
import { listTeams } from "./teams";

export type Filters = {
  teamId?: string;
  kind?: Kind | "all";
  severity?: string;
  environment?: string;
  status?: string;
  assignee?: string;
  activeOnly?: boolean;
  closedOnly?: boolean;
  agedOnly?: boolean;
  search?: string;
  /** Age window in days, for drilling into an ageing bucket. */
  minAgeDays?: number;
  maxAgeDays?: number;
  /**
   * Exact createdDate window, ISO. `from` inclusive, `to` exclusive, matching
   * the date_histogram buckets — so drilling a trend point returns exactly the
   * count that point plots. Day-granularity age maths cannot express this.
   */
  createdFrom?: string;
  createdTo?: string;
  /** Days before an open item counts as aged. */
  thresholdDays?: number;
};

export type Bucket = { key: string; count: number };
export type AssigneeStat = {
  name: string;
  email: string;
  total: number;
  active: number;
  critical: number;
  aged: number;
  avgAgeDays: number;
  /** Open items split by severity — the load bar on each leaderboard row. */
  severity: Bucket[];
  /** Job title, when the person is on a POD roster. */
  designation?: string;
  /** On a roster but carrying nothing — a real zero, not an absence. */
  onRosterOnly?: boolean;
};
export type TrendPoint = { date: string; raised: number; closed: number };
export type TeamStat = { teamId: string; total: number; active: number; criticalAged: number; avgAgeDays: number };

export type Dashboard = {
  generatedAt: string;
  thresholdDays: number;
  totals: {
    total: number;
    active: number;
    closed: number;
    avgAgeDays: number;
    criticalAged: number;
    environments: number;
  };
  severity: Bucket[];
  environment: Bucket[];
  status: Bucket[];
  assignees: AssigneeStat[];
  ageing: Bucket[];
  trend: { daily: TrendPoint[]; weekly: TrendPoint[] };
  teams: TeamStat[];
  health: number;
};

const DAY_MS = 86_400_000;

/**
 * Date windows are resolved to absolute epoch millis here rather than sent as
 * `now-7d` date math.
 *
 * OpenSearch wraps a range containing `now` in DateRangeIncludingNowQuery, which
 * does not implement createWeight — inside a filter aggregation that throws
 * `unsupported_operation_exception`, intermittently, depending on segment state.
 * It took down the whole dashboard when it hit. Absolute bounds sidestep it, and
 * are cacheable besides.
 */
const daysAgo = (now: number, days: number) => now - days * DAY_MS;

/** Equivalent of date math's `/d` rounding: floor to UTC midnight. */
const floorDay = (ms: number) => Math.floor(ms / DAY_MS) * DAY_MS;

/** Equivalent of `/w`: floor to Monday UTC, matching calendar_interval week buckets. */
const floorWeek = (ms: number) => {
  const day = Math.floor(ms / DAY_MS);
  return (day - ((day + 3) % 7)) * DAY_MS; // epoch day 0 was a Thursday
};

/**
 * Age in days of an open item, evaluated at query time so it never goes stale.
 * Floored at zero: a future-dated item (a bad import, a clock skew) would
 * otherwise contribute a negative age and drag the average below reality.
 */
const ageScript = (now: number) => ({
  source:
    "if (doc['createdDate'].size() == 0) { return 0; } " +
    "double d = (params.now - doc['createdDate'].value.toInstant().toEpochMilli()) / 86400000.0; " +
    "return d < 0 ? 0 : d;",
  params: { now },
});

export function buildQuery(f: Filters, now = Date.now()) {
  const must: object[] = [];
  const filter: object[] = [];

  if (f.teamId) filter.push({ term: { teamId: f.teamId } });
  if (f.kind && f.kind !== "all") filter.push({ term: { kind: f.kind } });
  if (f.severity) filter.push({ term: { severity: f.severity } });
  if (f.environment) filter.push({ term: { environment: f.environment } });
  if (f.status) filter.push({ term: { status: f.status } });
  if (f.assignee) filter.push({ term: { assignee: f.assignee } });
  if (f.activeOnly) filter.push({ term: { isActive: true } });
  if (f.closedOnly) filter.push({ term: { isActive: false } });
  if (f.agedOnly) {
    filter.push({ term: { isActive: true } });
    filter.push({ range: { createdDate: { lte: daysAgo(now, f.thresholdDays ?? 7) } } });
  }
  // Older item == earlier createdDate, so a *minimum* age is an *upper* bound on
  // the date. Bounds mirror the ageing date_range agg — lower inclusive, upper
  // exclusive — so a drill-down returns exactly the count on the bar.
  if (f.minAgeDays != null || f.maxAgeDays != null) {
    const range: Record<string, number> = {};
    if (f.minAgeDays != null) range.lt = floorDay(daysAgo(now, f.minAgeDays));
    if (f.maxAgeDays != null) range.gte = floorDay(daysAgo(now, f.maxAgeDays));
    filter.push({ range: { createdDate: range } });
  }
  if (f.createdFrom || f.createdTo) {
    const range: Record<string, string> = {};
    if (f.createdFrom) range.gte = f.createdFrom;
    if (f.createdTo) range.lt = f.createdTo;
    filter.push({ range: { createdDate: range } });
  }
  if (f.search) {
    must.push({
      bool: {
        should: [
          { match_phrase_prefix: { title: f.search } },
          { term: { workItemId: f.search } },
          { wildcard: { assignee: { value: `*${f.search}*`, case_insensitive: true } } },
        ],
        minimum_should_match: 1,
      },
    });
  }

  return must.length || filter.length ? { bool: { must, filter } } : { match_all: {} };
}

const activeFilter = { term: { isActive: true } };

/** Severity is a keyword, so sorting by it needs an explicit rank. Worst first. */
const SEVERITY_RANK_SCRIPT = {
  source:
    "if (doc['severity'].size() == 0) { return 9; } " +
    "def s = doc['severity'].value; " +
    "if (s == 'Critical') { return 0; } if (s == 'Major') { return 1; } " +
    "if (s == 'Minor') { return 2; } return 3;",
};

function histogram(field: "createdDate" | "closedDate", interval: "day" | "week", from: number, now: number) {
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

type AggBucket = { key: string; key_as_string?: string; doc_count: number; [k: string]: unknown };

const toBuckets = (agg: { buckets?: AggBucket[] } | undefined): Bucket[] =>
  (agg?.buckets || []).map((b) => ({ key: String(b.key_as_string ?? b.key), count: b.doc_count }));

export async function dashboard(f: Filters): Promise<Dashboard> {
  await ensureIndices();
  const now = Date.now();
  const thresholdDays = f.thresholdDays ?? 7;
  const agedRange = { range: { createdDate: { lte: daysAgo(now, thresholdDays) } } };
  const ageBound = (days: number) => floorDay(daysAgo(now, days));

  const body = await search<Item>(IDX.items, {
    size: 0,
    track_total_hits: true,
    query: buildQuery(f, now),
    aggs: {
        active: { filter: activeFilter },
        avgAge: { filter: activeFilter, aggs: { v: { avg: { script: ageScript(now) } } } },
        criticalAged: {
          filter: { bool: { filter: [activeFilter, { term: { severity: "Critical" } }, agedRange] } },
        },
        envCount: { cardinality: { field: "environment" } },

        severity: { terms: { field: "severity", size: 10 } },
        environment: { terms: { field: "environment", size: 10 } },
        status: { terms: { field: "status", size: 15 } },

        ageing: {
          filter: activeFilter,
          aggs: {
            buckets: {
              date_range: {
                field: "createdDate",
                // `from` inclusive, `to` exclusive — the drill-down mirrors this
                // with gte/lt, and both sides use the same absolute bounds.
                ranges: [
                  { key: "0-3 days", from: ageBound(3) },
                  { key: "4-7 days", from: ageBound(7), to: ageBound(3) },
                  { key: "8-14 days", from: ageBound(14), to: ageBound(7) },
                  { key: "15-30 days", from: ageBound(30), to: ageBound(14) },
                  { key: "30+ days", to: ageBound(30) },
                ],
              },
            },
          },
        },

        assignees: {
          terms: { field: "assignee", size: PAGE.leaderboard, order: { _count: "desc" } },
          aggs: {
            email: { terms: { field: "assigneeEmail", size: 1 } },
            active: { filter: activeFilter },
            critical: { filter: { bool: { filter: [activeFilter, { term: { severity: "Critical" } }] } } },
            aged: { filter: { bool: { filter: [activeFilter, agedRange] } } },
            avgAge: { filter: activeFilter, aggs: { v: { avg: { script: ageScript(now) } } } },
            bySeverity: { filter: activeFilter, aggs: { s: { terms: { field: "severity", size: 5 } } } },
          },
        },

        teams: {
          terms: { field: "teamId", size: PAGE.teams },
          aggs: {
            active: { filter: activeFilter },
            criticalAged: {
              filter: { bool: { filter: [activeFilter, { term: { severity: "Critical" } }, agedRange] } },
            },
            avgAge: { filter: activeFilter, aggs: { v: { avg: { script: ageScript(now) } } } },
          },
        },

        raisedDaily: histogram("createdDate", "day", floorDay(daysAgo(now, 30)), now),
        closedDaily: histogram("closedDate", "day", floorDay(daysAgo(now, 30)), now),
        raisedWeekly: histogram("createdDate", "week", floorWeek(daysAgo(now, 84)), now),
        closedWeekly: histogram("closedDate", "week", floorWeek(daysAgo(now, 84)), now),
    },
  });

  const a = body.aggregations;
  const total = body.hits.total.value ?? 0;
  const active = a.active.doc_count;

  const totals = {
    total,
    active,
    closed: total - active,
    avgAgeDays: Math.round((a.avgAge.v.value ?? 0) * 10) / 10,
    criticalAged: a.criticalAged.doc_count,
    environments: a.envCount.value ?? 0,
  };

  /**
   * The rosters of the PODs in scope, so onboarded people appear even with no
   * work items. Scoped exactly like the query: one POD when one is selected,
   * every POD the caller can see otherwise.
   *
   * A failure here must not take the dashboard with it — the roster is a
   * nicety, the counts are the product. It degrades to no roster.
   */
  const roster: RosterPerson[] = await listTeams()
    .then((teams) => teams.filter((t) => !f.teamId || t.id === f.teamId).flatMap((t) => t.members ?? []))
    .catch(() => []);

  return {
    generatedAt: new Date().toISOString(),
    thresholdDays,
    totals,
    severity: toBuckets(a.severity),
    environment: toBuckets(a.environment),
    status: toBuckets(a.status),
    ageing: toBuckets(a.ageing.buckets),
    assignees: mergeRoster((a.assignees.buckets as AggBucket[]).map((b) => ({
      name: String(b.key),
      email: String((b.email as { buckets?: AggBucket[] })?.buckets?.[0]?.key ?? ""),
      total: b.doc_count,
      active: (b.active as { doc_count: number }).doc_count,
      critical: (b.critical as { doc_count: number }).doc_count,
      aged: (b.aged as { doc_count: number }).doc_count,
      avgAgeDays: Math.round(((b.avgAge as { v: { value: number | null } }).v.value ?? 0) * 10) / 10,
      severity: toBuckets((b.bySeverity as { s: { buckets: AggBucket[] } }).s),
    })), roster),
    teams: (a.teams.buckets as AggBucket[]).map((b) => ({
      teamId: String(b.key),
      total: b.doc_count,
      active: (b.active as { doc_count: number }).doc_count,
      criticalAged: (b.criticalAged as { doc_count: number }).doc_count,
      avgAgeDays: Math.round(((b.avgAge as { v: { value: number | null } }).v.value ?? 0) * 10) / 10,
    })),
    trend: {
      daily: mergeTrend(a.raisedDaily.series, a.closedDaily.series),
      weekly: mergeTrend(a.raisedWeekly.series, a.closedWeekly.series),
    },
    health: healthScore(totals),
  };
}

function mergeTrend(raised: { buckets: AggBucket[] }, closed: { buckets: AggBucket[] }): TrendPoint[] {
  const closedBy = new Map(closed.buckets.map((b) => [String(b.key_as_string), b.doc_count]));
  return raised.buckets.map((b) => ({
    date: String(b.key_as_string),
    raised: b.doc_count,
    closed: closedBy.get(String(b.key_as_string)) ?? 0,
  }));
}

export type ListedItem = Item & { ageDays: number };

/** Oldest first by default — that is the point of an ageing board. */
export type ItemSort = "oldest" | "newest" | "severity";

const SORTS: Record<ItemSort, object[]> = {
  oldest: [{ createdDate: "asc" }],
  newest: [{ createdDate: "desc" }],
  // Keyword field, so severity cannot sort by rank on its own — order the
  // buckets explicitly, then oldest first inside each.
  severity: [
    { _script: { type: "number", order: "asc", script: SEVERITY_RANK_SCRIPT } },
    { createdDate: "asc" },
  ],
};

/**
 * Drill-down list behind every expandable tile. Returns the page plus the true
 * total, so a capped list can say so instead of implying the cap is the count.
 */
/**
 * Every matching item, a page at a time.
 *
 * `listItems` asks for `size` in one request, and OpenSearch refuses any
 * `from + size` above `index.max_result_window` — 10,000 by default. That is not
 * a large-board problem: a `size` of 20,000 is rejected outright even when the
 * index holds 360 documents, which is exactly how the export came back as a 500
 * wearing a `.json` filename.
 *
 * `search_after` walks the result set with no window at all. The sort gets
 * `workItemId` appended so the order is **total** — with ties, two documents
 * sharing a sort key can repeat across pages or be skipped between them.
 */
export async function* streamItems(
  f: Filters,
  sort: ItemSort = "oldest",
  cap = 20_000,
  pageSize = 1_000,
): AsyncGenerator<ListedItem[]> {
  await ensureIndices();
  const order = [...(SORTS[sort] ?? SORTS.oldest), { workItemId: "asc" }];
  const now = Date.now();

  let after: unknown[] | undefined;
  let sent = 0;

  while (sent < cap) {
    const size = Math.min(pageSize, cap - sent);
    const body = await search<Item>(IDX.items, {
      size,
      query: buildQuery(f, now),
      sort: order,
      ...(after ? { search_after: after } : {}),
    });

    const hits = body.hits.hits;
    if (!hits.length) return;

    yield hits.map((h) => withAge(h._source, now));
    sent += hits.length;

    after = hits[hits.length - 1]?.sort;
    // No cursor means the sort was not returned, and continuing would re-request
    // the same page forever.
    if (!after || hits.length < size) return;
  }
}

/** Age in whole days, measured to the close date when there is one. */
function withAge(item: Item, now: number): ListedItem {
  const end = item.closedDate ? new Date(item.closedDate).getTime() : now;
  return { ...item, ageDays: Math.max(0, Math.round((end - new Date(item.createdDate).getTime()) / DAY_MS)) };
}

export async function listItems(
  f: Filters,
  size = 100,
  sort: ItemSort = "oldest",
): Promise<{ items: ListedItem[]; total: number }> {
  await ensureIndices();
  const body = await search<Item>(IDX.items, {
    size,
    track_total_hits: true,
    query: buildQuery(f),
    sort: SORTS[sort] ?? SORTS.oldest,
  });
  const now = Date.now();
  const items = body.hits.hits.map((h) => {
    const item = h._source;
    const end = item.closedDate ? new Date(item.closedDate).getTime() : now;
    return { ...item, ageDays: Math.max(0, Math.round((end - new Date(item.createdDate).getTime()) / DAY_MS)) };
  });
  return { items, total: body.hits.total.value ?? items.length };
}
