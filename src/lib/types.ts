import { AGEING } from "./constants.ts";

export const SEVERITIES = ["Critical", "Major", "Minor", "Unknown"] as const;
export const ENVIRONMENTS = ["IT-UAT", "BIZ-UAT", "CUG", "Production", "Unknown"] as const;
export const STATUSES = [
  "Open",
  "Commented",
  "For QA Validation",
  "Not a Bug",
  "Closed",
  "Unknown",
] as const;
export const KINDS = ["bug", "ticket", "cr"] as const;

export type Severity = (typeof SEVERITIES)[number];
export type Environment = (typeof ENVIRONMENTS)[number];
export type Status = (typeof STATUSES)[number];
export type Kind = (typeof KINDS)[number];

/** One bug / ticket / CR. `id` is stable so re-syncing upserts instead of duplicating. */
export type Item = {
  id: string;
  workItemId: string;
  teamId: string;
  source: "azure" | "excel";
  kind: Kind;
  type: string;
  title: string;
  url: string;
  assignee: string;
  assigneeEmail: string;
  severity: Severity;
  environment: Environment;
  status: Status;
  state: string;
  priority: number | null;
  tags: string[];
  createdDate: string;
  changedDate: string;
  closedDate: string | null;
  isActive: boolean;
};

export type Member = {
  name: string;
  email: string;
  designation: string;
  /** Azure DevOps display name or UPN, when it differs from `email`. */
  azureIdentity?: string;
  role: "lead" | "member";
};

/**
 * Which Azure DevOps field carries each dimension, and how its raw values
 * collapse into our vocabulary. Both are per-team because every board is
 * customised differently.
 */
export type FieldMap = {
  severity: string;
  environment: string;
  status: string;
};

export type ValueMap = {
  severity: Record<string, Severity>;
  environment: Record<string, Environment>;
  status: Record<string, Status>;
};

export type Team = {
  id: string;
  name: string;
  description: string;
  members: Member[];
  azure: {
    orgUrl: string;
    project: string;
    /** Blank falls back to the AZDO_PAT env var. */
    pat: string;
    areaPath: string;
    workItemTypes: string[];
  };
  fieldMap: FieldMap;
  valueMap: ValueMap;
  /** Days before an open bug counts as "aged". */
  ageingThresholdDays: number;
  createdAt: string;
};

export type User = {
  id: string;
  email: string;
  name: string;
  passwordHash: string | null;
  role: "admin" | "member";
  teamIds: string[];
  createdAt: string;
};

export const DEFAULT_FIELD_MAP: FieldMap = {
  severity: "Microsoft.VSTS.Common.Severity",
  environment: "Custom.Environment",
  status: "System.State",
};

/** Keys are lowercased before lookup, so only write lowercase keys here. */
export const DEFAULT_VALUE_MAP: ValueMap = {
  severity: {
    "1 - critical": "Critical",
    "2 - high": "Major",
    "3 - medium": "Minor",
    "4 - low": "Minor",
    critical: "Critical",
    blocker: "Critical",
    high: "Major",
    major: "Major",
    medium: "Minor",
    minor: "Minor",
    low: "Minor",
  },
  environment: {
    "it-uat": "IT-UAT",
    ituat: "IT-UAT",
    it: "IT-UAT",
    "biz-uat": "BIZ-UAT",
    bizuat: "BIZ-UAT",
    uat: "BIZ-UAT",
    biz: "BIZ-UAT",
    cug: "CUG",
    stage: "CUG",
    staging: "CUG",
    "cug(stage)": "CUG",
    prod: "Production",
    production: "Production",
    live: "Production",
  },
  status: {
    new: "Open",
    open: "Open",
    active: "Open",
    "to do": "Open",
    commented: "Commented",
    "need more info": "Commented",
    "for qa validation": "For QA Validation",
    "qa validation": "For QA Validation",
    resolved: "For QA Validation",
    "ready for test": "For QA Validation",
    "not a bug": "Not a Bug",
    "by design": "Not a Bug",
    rejected: "Not a Bug",
    closed: "Closed",
    done: "Closed",
    completed: "Closed",
    removed: "Not a Bug",
  },
};

/** Statuses that mean the item no longer needs work. */
export const TERMINAL_STATUSES: Status[] = ["Closed", "Not a Bug"];

export const DEFAULT_THRESHOLD_DAYS = AGEING.defaultThresholdDays;

/**
 * Whole days, 1..365. Zero or negative would make "aged" meaningless, and it
 * reaches OpenSearch as date math (`now-{n}d`) where a negative fails to parse.
 */
export function clampThreshold(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return DEFAULT_THRESHOLD_DAYS;
  return Math.min(AGEING.max, Math.max(AGEING.min, Math.trunc(n)));
}
