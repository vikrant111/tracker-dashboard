import { HttpError } from "./http-error";
import {
  deleteTeamDoc,
  findAllTeams,
  findTeamById,
  saveTeamDoc,
} from "../controllers/teams.controller.ts";
import { AZURE, LIMITS } from "./constants";
import {
  DEFAULT_FIELD_MAP,
  DEFAULT_THRESHOLD_DAYS,
  SEVERITIES,
  clampSeverityThresholds,
  clampThreshold,
  type Member,
  type Severity,
  type Team,
} from "./types";

export const MAX_NAME_LENGTH = LIMITS.teamName;

/** FNV-1a, so a name with no ASCII letters still gets a stable, distinct id. */
function shortHash(input: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(36).padStart(6, "0").slice(0, 6);
}

/**
 * Ids must stay short, readable and URL-safe. Names that reduce to nothing —
 * "!!!", "团队" — fall back to a hash of the name rather than a shared constant,
 * which would silently merge two different PODs into one document.
 */
export const slugify = (name: string) => {
  const base = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48)
    .replace(/-+$/g, "");
  return base || `pod-${shortHash(name.trim())}`;
};

const MEMBER_ROLES: Member["role"][] = ["lead", "member"];

function cleanMembers(members: unknown): Member[] {
  if (!Array.isArray(members)) return [];
  return members.slice(0, LIMITS.teamMembers).map((m) => ({
    name: String(m?.name ?? "").trim().slice(0, LIMITS.personName),
    email: String(m?.email ?? "").trim().slice(0, LIMITS.email),
    designation: String(m?.designation ?? "").trim().slice(0, LIMITS.designation),
    ...(m?.azureIdentity ? { azureIdentity: String(m.azureIdentity).slice(0, LIMITS.email) } : {}),
    role: MEMBER_ROLES.includes(m?.role) ? m.role : "member",
  }));
}

/**
 * Whether the environment alone is enough to reach Azure.
 *
 * All three are required. Two out of three is a half-finished `.env.local`, and
 * provisioning a POD that cannot connect is worse than provisioning none — it
 * looks configured and fails at sync.
 */
export function azureConfiguredInEnv(): boolean {
  return Boolean(
    process.env.AZDO_ORG_URL?.trim() && process.env.AZDO_PROJECT?.trim() && process.env.AZDO_PAT?.trim(),
  );
}

/**
 * Create a POD from the environment when Azure is configured but none exists.
 *
 * The intent is that adding `AZDO_ORG_URL`, `AZDO_PROJECT` and `AZDO_PAT` is
 * *all* an operator has to do — the board connects and syncs on its own. Without
 * this it does not: every item belongs to a POD, and a fresh install has none,
 * so a fully-configured environment still showed an empty dashboard until
 * somebody opened admin and made one by hand.
 *
 * Deliberately only when the list is **empty**. Once anyone has onboarded a real
 * POD this must never run again, or deleting your last POD would conjure another.
 * The team's own Azure fields stay blank so it keeps following the environment;
 * `azure.ts` already falls back to those env vars per field.
 */
async function ensureDefaultTeam(existing: Team[]): Promise<Team[]> {
  if (existing.length > 0 || !azureConfiguredInEnv()) return existing;

  const name = process.env.AZDO_PROJECT?.trim() || AZURE.defaultPodName;
  try {
    const team = await saveTeam({ name, description: "Created from the environment. Edit or rename it freely." });
    return [team];
  } catch {
    // A racing request already made it, or OpenSearch is unhappy. Either way the
    // dashboard must still render; the next call will pick the POD up.
    return existing;
  }
}

export async function listTeams(): Promise<Team[]> {
  const teams = await findAllTeams();
  const withDefault = await ensureDefaultTeam(teams);
  return withDefault.sort((a, b) => a.name.localeCompare(b.name));
}

export async function getTeam(id: string): Promise<Team | null> {
  return findTeamById(id);
}

/**
 * A POD-level threshold, folded into the severities inheriting it.
 *
 * The single POD-level box left the admin form: with one per severity,
 * `Unknown` included, it could only agree with them or silently overrule them.
 * A POD that had set one must not start ageing differently, so its value is
 * written into every severity with no rule of its own.
 *
 * A POD on the default has nothing to fold and keeps an empty map, which is
 * what keeps "aged means open past 7 days" true on screen for the common case.
 *
 * Idempotent: the stored default is pinned back afterwards, so the next save
 * finds nothing to fold.
 */
function foldPodDefault(
  podDefault: number,
  overrides: Partial<Record<Severity, number>>,
): Partial<Record<Severity, number>> {
  if (podDefault === DEFAULT_THRESHOLD_DAYS) return overrides;
  return Object.fromEntries(SEVERITIES.map((s) => [s, overrides[s] ?? podDefault]));
}

export async function saveTeam(input: Partial<Team> & { name: string; id?: string }): Promise<Team> {
  const name = input.name.trim().slice(0, MAX_NAME_LENGTH);
  const id = input.id || slugify(name);
  const existing = await findTeamById(id);

  // Creating (no id supplied) onto a slug another POD already owns would
  // overwrite it. Renaming or editing that POD passes its id and is fine.
  if (!input.id && existing && existing.name !== name) {
    throw new HttpError(409, `"${existing.name}" already uses a very similar name. Pick a more distinct one.`);
  }

  const team: Team = {
    id,
    name,
    description: String(input.description ?? existing?.description ?? "").slice(0, LIMITS.teamDescription),
    members: input.members === undefined ? (existing?.members ?? []) : cleanMembers(input.members),
    azure: {
      orgUrl: "",
      project: "",
      pat: "",
      areaPath: "",
      workItemTypes: [...AZURE.defaultWorkItemTypes],
      ...existing?.azure,
      ...input.azure,
    },
    fieldMap: { ...DEFAULT_FIELD_MAP, ...existing?.fieldMap, ...input.fieldMap },
    valueMap: {
      severity: {},
      environment: {},
      status: {},
      ...existing?.valueMap,
      ...input.valueMap,
    },
    /*
     * Pinned to the default, because the admin form no longer offers it. The
     * four severities are the POD's ageing rules now; see `foldPodDefault`.
     */
    ageingThresholdDays: DEFAULT_THRESHOLD_DAYS,
    /*
     * Replaced wholesale, not merged. A merge would make clearing one severity
     * impossible — the cleared key simply falls back to the stored value — and
     * the form sends the complete set every time. Omitting the field entirely
     * still keeps what is stored, which is what a partial update means.
     */
    severityThresholdDays: foldPodDefault(
      clampThreshold(input.ageingThresholdDays ?? existing?.ageingThresholdDays),
      clampSeverityThresholds(input.severityThresholdDays ?? existing?.severityThresholdDays),
    ),
    createdAt: existing?.createdAt ?? new Date().toISOString(),
  };

  await saveTeamDoc(team);
  return team;
}

/** Deleting a team takes its items with it — orphaned items would skew every global count. */
export async function deleteTeam(id: string) {
  await deleteTeamDoc(id);
}
