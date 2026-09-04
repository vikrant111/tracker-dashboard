import type { Filters } from "./metrics";
import { HttpError, canSeeTeam, type SessionUser } from "./session";
import { getTeam, listTeams } from "./teams";
import { KINDS, clampSeverityThresholds, clampThreshold, type Kind } from "./types";
import { LIMITS } from "./constants";

/**
 * Read a whole-number param, or undefined when absent or unusable. Query strings
 * are user input: a NaN or negative value here becomes `now-NaNd` in date math
 * and OpenSearch answers with a 500, so nonsense is dropped rather than passed on.
 */
/** A date param, or undefined when absent or unparseable — junk must not reach the query. */
export function isoParam(p: URLSearchParams, key: string): string | undefined {
  const raw = p.get(key);
  if (!raw) return undefined;
  const t = Date.parse(raw);
  return Number.isFinite(t) ? new Date(t).toISOString() : undefined;
}

export function intParam(
  p: URLSearchParams,
  key: string,
  { min = 0, max = Number.MAX_SAFE_INTEGER }: { min?: number; max?: number } = {},
): number | undefined {
  const raw = p.get(key);
  if (raw === null || raw.trim() === "") return undefined;
  const n = Number(raw);
  if (!Number.isFinite(n)) return undefined;
  return Math.min(max, Math.max(min, Math.trunc(n)));
}

/**
 * Turn query params into filters, then hard-scope them to what this user is
 * allowed to see. A member with no team gets an impossible filter rather than
 * an unscoped one — silently widening the query would leak other PODs' data.
 */
export async function filtersFromRequest(req: Request, user: SessionUser): Promise<Filters> {
  const p = new URL(req.url).searchParams;
  const requested = p.get("teamId") || "";

  if (requested && !canSeeTeam(user, requested)) {
    throw new HttpError(403, "You do not have access to that POD.");
  }

  let teamId = requested;
  if (!teamId && user.role !== "admin") {
    if (!user.teamIds.length) throw new HttpError(403, "You are not assigned to a POD yet.");
    // Non-admins have no cross-POD view; default them to their first POD.
    teamId = user.teamIds[0];
  }

  const team = teamId ? await getTeam(teamId) : null;
  if (teamId && !team) throw new HttpError(404, "That POD no longer exists.");

  const kind = p.get("kind") as Kind;
  const visible = await accessibleTeams(user);

  return {
    teamId: teamId || undefined,
    kind: KINDS.includes(kind) ? kind : "all",
    severity: p.get("severity") || undefined,
    environment: p.get("environment") || undefined,
    status: p.get("status") || undefined,
    assignee: p.get("assignee") || undefined,
    activeOnly: p.get("activeOnly") === "true",
    closedOnly: p.get("closedOnly") === "true",
    agedOnly: p.get("agedOnly") === "true",
    search: p.get("search")?.slice(0, LIMITS.search) || undefined,
    minAgeDays: intParam(p, "minAgeDays", { min: 0, max: 36500 }),
    maxAgeDays: intParam(p, "maxAgeDays", { min: 0, max: 36500 }),
    createdFrom: isoParam(p, "createdFrom"),
    createdTo: isoParam(p, "createdTo"),
    // A team saved before validation existed could still hold a bad threshold,
    // so clamp on the way out too rather than trusting the stored value.
    thresholdDays: clampThreshold(team?.ageingThresholdDays),
    /*
     * Every POD's own threshold, so an unscoped board judges each item by the
     * board it came from rather than by one default.
     */
    thresholdByTeam: Object.fromEntries(
      visible.map((t) => [t.id, clampThreshold(t.ageingThresholdDays)]),
    ),
    /*
     * And each POD's per-severity overrides, cleaned on the way out for the
     * same reason as the threshold above: a POD saved before this field existed
     * — or edited past the form — must not be able to put a NaN into date maths.
     * PODs that tune nothing are dropped, so the common case stays an empty map.
     */
    severityThresholds: Object.fromEntries(
      visible
        .map((t) => [t.id, clampSeverityThresholds(t.severityThresholdDays)] as const)
        .filter(([, map]) => Object.keys(map).length > 0),
    ),
  };
}

/** Teams this user may pick from in the POD switcher. */
export async function accessibleTeams(user: SessionUser) {
  const teams = await listTeams();
  return user.role === "admin" ? teams : teams.filter((t) => user.teamIds.includes(t.id));
}
