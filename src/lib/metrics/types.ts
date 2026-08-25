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

export type ListedItem = Item & { ageDays: number };

/** Oldest first is the default: this is a board about things that have waited. */
export type ItemSort = "oldest" | "newest" | "severity";
