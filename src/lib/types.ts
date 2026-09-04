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
  /**
   * Per-severity overrides of the above, set by an admin.
   *
   * A Critical sitting for three days and a Minor sitting for three days are
   * not the same problem, and one threshold for both flatters the urgent one.
   * Absent or missing key means the POD's own threshold — the common case, and
   * why this is optional rather than a filled-in map of defaults.
   */
  severityThresholdDays?: Partial<Record<Severity, number>>;
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
  /**
   * When the password last changed, ISO.
   *
   * Sessions issued before this are refused. Without it, changing a password
   * because it was compromised would leave the attacker's session working —
   * which is the one moment a password change most needs to mean something.
   *
   * Optional: accounts written before this field existed simply have no
   * cut-off, and nothing about them is invalidated.
   */
  passwordChangedAt?: string;
};

export const DEFAULT_FIELD_MAP: FieldMap = {
  severity: "Microsoft.VSTS.Common.Severity",
  environment: "Custom.Environment",
  status: "System.State",
};

/** Keys are lowercased before lookup, so only write lowercase keys here. */
export { DEFAULT_VALUE_MAP } from "./value-map.ts";


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

/**
 * A POD's per-severity ageing overrides, cleaned.
 *
 * **A missing key is the point.** Blank means "use the POD's own threshold", so
 * an unusable value is dropped rather than clamped to a number nobody typed —
 * clamping a cleared field to 1 would silently make every Minor aged the next
 * day. Unknown severities go too: they can only come from a stale client or a
 * hand-written request, and a rule keyed to a severity no item can have is a
 * rule that never fires and cannot be found again to remove.
 */
export function clampSeverityThresholds(value: unknown): Partial<Record<Severity, number>> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out: Partial<Record<Severity, number>> = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (!(SEVERITIES as readonly string[]).includes(key)) continue;
    if (raw === "" || raw === null || raw === undefined) continue;
    const n = Number(raw);
    if (!Number.isFinite(n)) continue;
    out[key as Severity] = Math.min(AGEING.max, Math.max(AGEING.min, Math.trunc(n)));
  }
  return out;
}
