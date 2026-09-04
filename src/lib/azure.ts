import type { Team } from "./types.ts";
import { AZURE } from "./constants.ts";
import { logBatch, logSample, logStructure, logWiql } from "./azure-debug.ts";

const API = `api-version=${AZURE.apiVersion}`;

export class AzureError extends Error {}

function authHeader(pat: string) {
  return `Basic ${Buffer.from(`:${pat}`).toString("base64")}`;
}

/**
 * The connection a team will actually use: its own fields, falling back to the
 * environment field by field. A POD may set only a project and inherit the rest.
 */
export function resolveCreds(team: Team) {
  return {
    orgUrl: (team.azure.orgUrl || process.env.AZDO_ORG_URL || "").trim().replace(/\/+$/, ""),
    project: (team.azure.project || process.env.AZDO_PROJECT || "").trim(),
    pat: (team.azure.pat || process.env.AZDO_PAT || "").trim(),
  };
}

/** Whether a team has everything it needs to reach Azure, from either source. */
export function isConnectable(team: Team): boolean {
  const c = resolveCreds(team);
  return Boolean(c.orgUrl && c.project && c.pat);
}

function creds(team: Team) {
  const { orgUrl, project, pat } = resolveCreds(team);
  if (!orgUrl || !project || !pat) {
    throw new AzureError(
      `Team "${team.name}" has no Azure connection. Add org URL, project and PAT on the team, or set AZDO_ORG_URL / AZDO_PROJECT / AZDO_PAT.`,
    );
  }
  return { orgUrl, project, pat };
}

async function call<T>(url: string, pat: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: authHeader(pat),
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
    cache: "no-store",
  });
  if (!res.ok) {
    const body = await res.text();
    // A PAT that lacks scope gets a sign-in page rather than a 401, so say so plainly.
    if (res.status === 203 || body.startsWith("<!DOCTYPE html")) {
      throw new AzureError("Azure DevOps rejected the PAT. Check it has not expired and has Work Items (Read) scope.");
    }
    throw new AzureError(`Azure DevOps ${res.status}: ${body.slice(0, 300)}`);
  }
  return res.json() as Promise<T>;
}

/** WIQL wants `yyyy-MM-ddTHH:mm:ssZ` — it rejects the milliseconds ISO gives us. */
function wiqlDate(iso: string) {
  return new Date(iso).toISOString().replace(/\.\d{3}Z$/, "Z");
}

const escapeWiql = (v: string) => v.replace(/'/g, "''");

/** IDs of work items changed at or after `since`. Oldest first, so a partial run still advances the watermark. */
export async function queryChangedIds(team: Team, since: string): Promise<number[]> {
  const { orgUrl, project, pat } = creds(team);
  const types = team.azure.workItemTypes?.length
    ? team.azure.workItemTypes
    : ["Bug", "Issue", "Task", "User Story"];

  const clauses = [
    `[System.TeamProject] = '${escapeWiql(project)}'`,
    `[System.WorkItemType] IN (${types.map((t) => `'${escapeWiql(t)}'`).join(", ")})`,
    `[System.ChangedDate] >= '${wiqlDate(since)}'`,
  ];
  if (team.azure.areaPath) clauses.push(`[System.AreaPath] UNDER '${escapeWiql(team.azure.areaPath)}'`);

  const query = `SELECT [System.Id] FROM WorkItems WHERE ${clauses.join(" AND ")} ORDER BY [System.ChangedDate] ASC`;

  const started = performance.now();
  const res = await call<{ workItems?: { id: number }[] }>(
    `${orgUrl}/${encodeURIComponent(project)}/_apis/wit/wiql?${API}`,
    pat,
    { method: "POST", body: JSON.stringify({ query }) },
  );
  const ids = (res.workItems || []).map((w) => w.id);

  /* Only when AZDO_DEBUG asks. See src/lib/azure-debug.ts. */
  logWiql({ project, types, since, ids, ms: performance.now() - started });
  return ids;
}

const BATCH = AZURE.batchSize; // Azure's hard cap for workitemsbatch

export async function fetchWorkItems(team: Team, ids: number[]) {
  const { orgUrl, pat } = creds(team);
  const out: { id: number; fields: Record<string, unknown>; _links?: { html?: { href?: string } } }[] = [];

  const chunks = Math.ceil(ids.length / BATCH);
  for (let i = 0; i < ids.length; i += BATCH) {
    const slice = ids.slice(i, i + BATCH);
    const started = performance.now();
    const res = await call<{ value: typeof out }>(`${orgUrl}/_apis/wit/workitemsbatch?${API}`, pat, {
      method: "POST",
      body: JSON.stringify({ ids: slice, $expand: "links" }),
    });
    out.push(...res.value);
    logBatch({
      chunk: i / BATCH + 1,
      chunks,
      requested: slice.length,
      received: res.value?.length ?? 0,
      ms: performance.now() - started,
    });
  }

  /*
   * The shape, once per fetch rather than once per chunk — the interesting
   * number is how often a field is populated across everything that came back.
   */
  logStructure(out);
  logSample(out[0]);
  return out;
}

/** Verify a connection from the admin UI without importing anything. */
export async function testConnection(
  team: Team,
): Promise<{ ok: true; project: string; types: string[]; unmatched: string[] } | { ok: false; error: string }> {
  try {
    const { orgUrl, project, pat } = creds(team);
    await call(`${orgUrl}/_apis/projects/${encodeURIComponent(project)}?${API}`, pat);

    /*
     * What this project actually calls its work items. Reported back so the
     * admin can copy them rather than guess — the query matches type names
     * exactly, and a board using "3IN1 TASK" matches none of the defaults.
     */
    let types: string[] = [];
    try {
      const res = await call<{ value?: { name?: string; isDisabled?: boolean }[] }>(
        `${orgUrl}/${encodeURIComponent(project)}/_apis/wit/workitemtypes?${API}`,
        pat,
      );
      types = (res.value ?? [])
        .filter((t) => t?.name && !t.isDisabled)
        .map((t) => String(t.name))
        .sort((a, b) => a.localeCompare(b));
    } catch {
      // Listing types needs no extra scope, but if it fails the connection is
      // still good — report that rather than turning a success into an error.
    }

    /*
     * Which of the configured types this project does not have. Empty when the
     * POD has none set, because then the defaults apply and naming them as
     * "unmatched" would be noise on a board that has a Bug and nothing else.
     */
    const configured = team.azure.workItemTypes ?? [];
    const unmatched = types.length
      ? configured.filter((t) => !types.some((real) => real.toLowerCase() === String(t).trim().toLowerCase()))
      : [];

    return { ok: true, project, types, unmatched };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
