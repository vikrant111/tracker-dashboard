import type { Item, Kind } from "../types.ts";

/** What the dashboard and the drill-down are both described in. */
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
  /**
   * The closure trend's **own** window and slice.
   *
   * Deliberately separate from `createdFrom`/`createdTo` and `environment`
   * above: those narrow the whole board, and the trend answers a narrower
   * question than the tiles beside it. Picking `Production` for the chart must
   * not re-scope the severity donut.
   *
   * **The item matchers ignore these.** `matchesFilters` and `buildMatch` never
   * read them — only `aggregateDashboard` does, when it builds the two series.
   * A drill-down from a trend point re-states the slice as a real
   * `environment`/`status` filter, which is what keeps the drawer equal to the
   * point that opened it.
   */
  trendFrom?: string;
  trendTo?: string;
  trendEnvironment?: string;
  trendStatus?: string;
  /** Days before an open item counts as aged. */
  thresholdDays?: number;
  /**
   * Each POD's own ageing threshold, by team id.
   *
   * "Aged" means different things on different boards — one POD calls a week
   * old, another a month. With a single POD selected `thresholdDays` is that
   * POD's and this adds nothing; across **all** PODs it is what stops every
   * item being judged against one global default.
   *
   * Without it, a POD set to 30 days had its items counted as aged after 7 as
   * soon as the picker said "All PODs", and the two views disagreed about the
   * same board.
   */
  thresholdByTeam?: Record<string, number>;
  /**
   * A POD's per-severity ageing overrides: team id → severity → days.
   *
   * Beats `thresholdByTeam` for the severities it names, so a POD can hold
   * Critical to two days while its Minors get a fortnight. Resolved by
   * `thresholdFor` — the single place that knows the precedence.
   */
  severityThresholds?: Record<string, Record<string, number>>;
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
export type TeamStat = {
  teamId: string;
  total: number;
  active: number;
  criticalAged: number;
  avgAgeDays: number;
  /**
   * The days this POD's `criticalAged` was measured against.
   *
   * Carried per row rather than read from the board, because the roll-up exists
   * precisely to compare PODs that disagree — a single number in its header
   * would be wrong for every row but one.
   */
  criticalThresholdDays: number;
};

export type Dashboard = {
  generatedAt: string;
  thresholdDays: number;
  /**
   * The days behind "critical and open past N days", or **null** when the PODs
   * in scope disagree.
   *
   * The tile printed `thresholdDays` regardless, which was already approximate
   * across PODs set to different values and became wrong outright once Critical
   * could be tuned on its own. `null` tells the tile to describe the rule
   * rather than name a number it cannot stand behind.
   */
  criticalThresholdDays: number | null;
  /** Whether any POD in scope tunes ageing by severity — changes how the copy reads. */
  severityTuned: boolean;
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
  /**
   * The closure trend, plus the window it actually came out as.
   *
   * `from`/`to` are echoed back **after clamping**, as `yyyy-MM-dd`. The date
   * pickers show these rather than what was typed, so a bound the board could
   * not honour — a start before the year of data it holds — corrects itself on
   * screen instead of leaving the control disagreeing with the axis.
   */
  trend: {
    daily: TrendPoint[];
    weekly: TrendPoint[];
    from: string;
    to: string;
    /**
     * True when the board's own date range hides part of the period the chart
     * was asked for — the items are narrowed before the trend sees them, so
     * the chart would otherwise draw a flat line that reads as "no bugs".
     */
    clipped: boolean;
  };
  teams: TeamStat[];
  /** The percentage closed, or **null** when nothing matched — never a fake 100. */
  health: number | null;
};

export type ListedItem = Item & { ageDays: number };

/** Oldest first is the default: this is a board about things that have waited. */
export type ItemSort = "oldest" | "newest" | "severity";
