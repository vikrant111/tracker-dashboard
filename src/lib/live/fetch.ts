/**
 * A POD's items, read from Azure on the request that needs them.
 *
 * **Nothing here is stored.** No collection, no JSON file, no watermark — the
 * only thing that outlives a request is a short-lived cache in this process's
 * memory, so a dashboard, the drawer it opens and the export behind it read one
 * answer instead of three. Restart and it is gone, which is the point: the only
 * durable records this app keeps are accounts, PODs, permissions and tokens.
 *
 * The window is the reason this is affordable. One POD's last 365 days is a few
 * thousand items; the same query without a bound is a project's whole history,
 * which is what made an earlier version slow and wrong at the same time —
 * items raised years ago arriving as though they were this year's.
 */
import { callJson, credsFor, fetchByIds, queryIds, resolveCreds, type AzureCreds, type AzureWorkItem } from "../azure.ts";
import { sourcesFor, type AzureSource } from "../contracts/azure-sources.ts";
import { LIVE, allows } from "../contracts/item-filters.ts";
import { HttpError } from "../http-error.ts";
import { fromAzure } from "../normalize.ts";
import type { Item, Team } from "../types.ts";
import { verifiedItems } from "./verify.ts";
import { cached } from "./cache.ts";
import { resolveFields } from "./fields.ts";
import { buildSourceWiql, fieldsUsedBy, type FieldMap } from "./wiql.ts";

/**
 * Whether this POD reads live. Naming it in the contract is the whole test.
 *
 * **There is no fallback to the store, and that is deliberate.** It used to
 * fall back when no PAT was configured, so a fresh clone still showed the demo
 * board — but those rows are whatever was seeded or synced once, which is
 * exactly the data the contract's filters exist to exclude. Showing them under
 * a POD that is supposed to carry only what the filters matched is the quiet
 * version of being wrong.
 *
 * So a POD named in the contract carries contract data or says why it cannot.
 */
export function readsLive(team: Team): boolean {
  return sourcesFor(team).length > 0;
}

/** The ISO instant the window starts at. */
export const windowStart = (now = Date.now()) => new Date(now - LIVE.windowDays * 86_400_000).toISOString();

/**
 * The POD, as the normaliser should see it for one source.
 *
 * `fromAzure` reads the org, project and field mapping off the team, so each
 * source gets a view of the POD pointed at its own project. Without this, an
 * item from the second project would be given the first project's URL and the
 * first project's status field — a link that 404s and a status that is blank.
 */
export function viewFor(team: Team, source: AzureSource, creds: AzureCreds, fields: FieldMap): Team {
  /*
   * The field mapping is resolved too. `fieldMap` is written the way the form
   * writes it — `Bug Status`, `Severity` — and `fromAzure` reads the raw item,
   * where the keys are reference names.
   */
  const mapped = Object.fromEntries(
    Object.entries(source.fieldMap ?? {}).map(([k, v]) => [k, fields.get(String(v)) ?? String(v)]),
  );
  return {
    ...team,
    azure: {
      ...team.azure,
      orgUrl: creds.orgUrl,
      project: source.project,
      areaPath: source.areaPath ?? "",
      workItemTypes: [...source.workItemTypes],
    },
    fieldMap: { ...team.fieldMap, ...mapped },
  };
}

/**
 * What survives the window, and the allowlists if they are switched on.
 *
 * The window is applied again here, but **not** as "raised inside it". The rule
 * is *finished long ago and raised long ago*:
 *
 * - raised inside the window → kept, closed or not
 * - **still open** → kept whatever its age, because a bug that has waited two
 *   years is the single most important row an ageing board has. The buckets
 *   handle it correctly: it lands in `30+ days`, and the trend chart ignores a
 *   `createdDate` outside its own range, so nothing is distorted by keeping it.
 * - closed inside the window → kept, so the closure trend is complete
 * - closed **before** the window and raised before it → dropped. That is
 *   finished history, and it is the only thing here that would inflate a total
 *   with a year nobody asked about.
 */
export function keepAllowed(items: Item[], now: number): Item[] {
  const floor = now - LIVE.windowDays * 86_400_000;
  return items.filter((i) => {
    const created = new Date(i.createdDate).getTime();
    // An unparseable date is dropped rather than treated as now, which would
    // put a broken row in the newest ageing bucket and in today's trend point.
    if (!Number.isFinite(created)) return false;
    const closed = i.closedDate ? new Date(i.closedDate).getTime() : null;
    const current =
      created >= floor || i.isActive || (closed !== null && Number.isFinite(closed) && closed >= floor);
    if (!current) return false;
    return allows("severity", i.severity) && allows("environment", i.environment) && allows("status", i.status);
  });
}

/**
 * The one thing the contract cannot supply.
 *
 * Org and project come from the source, so a PAT is all that is missing — and
 * saying that is the point. The generic "no Azure connection" message sends
 * somebody to fill in an org URL and a project that this POD does not use.
 */
function requirePat(team: Team): void {
  const { orgUrl, pat } = resolveCreds(team);
  const missing = [
    !orgUrl ? "an organisation URL (AZDO_ORG_URL)" : "",
    !pat ? "a personal access token (AZDO_PAT, or the POD's own in Admin → Azure Boards)" : "",
  ].filter(Boolean);
  if (!missing.length) return;
  /*
   * Named precisely, because the project is **not** one of them — that comes
   * from `contracts/azure-sources.ts`. The generic "add org URL, project and
   * PAT on the team" sends somebody to fill in a project this POD does not use.
   */
  throw new HttpError(
    503,
    `${team.name} reads its items from Azure and is missing ${missing.join(" and ")}. ` +
      `Set it in .env.local and restart. Nothing is shown from the store for this POD, because stored rows are not what the contract's filters matched.`,
  );
}

/**
 * Everything needed to ask one board for one POD's work: the connection, the
 * field names resolved from the form's labels, and the query itself.
 *
 * Exported because `pnpm azure:probe` reports on exactly this, and a probe
 * building its own query would describe a board nobody reads.
 */
export async function planSource(team: Team, source: AzureSource, now = Date.now()) {
  requirePat(team);
  const creds = credsFor(team, { orgUrl: source.orgUrl, project: source.project });
  const since = windowStart(now);
  const fields = await resolveFields(
    creds,
    [...fieldsUsedBy(source), ...Object.values(source.fieldMap ?? {})],
    (url, pat) => callJson(url, pat),
  );
  return { creds, since, fields, query: buildSourceWiql(source, since, fields) };
}
async function fetchSource(team: Team, source: AzureSource, now: number): Promise<Item[]> {
  const { creds, since, fields, query } = await planSource(team, source, now);
  const ids = await queryIds(creds, query, { types: source.workItemTypes, since });
  if (!ids.length) return [];

  // ponytail: batches in series, as sync has always done. A cold read of a few
  // thousand items is a handful of seconds; parallelise here if that changes.
  /*
   * More than one board can hold: refused, never trimmed.
   *
   * This was `ids.slice(0, maxIds)` — a board returning one id past the cap
   * lost it with nothing said, which is precisely the "where did that bug go"
   * failure the window exists to avoid. An error naming the board and the
   * count is something somebody can act on; a quietly shorter list is not.
   */
  if (ids.length > LIVE.maxIds) {
    throw new HttpError(
      502,
      `${source.project} returned ${ids.length} work items for ${team.name}, past the ${LIVE.maxIds} this can read in one query. ` +
        `Narrow it in src/lib/contracts/ — a shorter window, or a tighter filter — rather than showing part of the board.`,
    );
  }
  const workItems: AzureWorkItem[] = await fetchByIds(creds, ids);

  /* What the filters vouch for, and a count of what they did not. See verify.ts. */
  const verified = verifiedItems(workItems, source, fields, { enabled: LIVE.verifyFilters });
  const view = viewFor(team, source, creds, fields);
  return verified.map((wi) => fromAzure(wi, view));
}

/** Every live source for this POD, merged and deduplicated by item id. */
async function fetchAll(team: Team, now: number): Promise<Item[]> {
  const byId = new Map<string, Item>();
  for (const source of sourcesFor(team)) {
    for (const item of await fetchSource(team, source, now)) byId.set(item.id, item);
  }
  return keepAllowed([...byId.values()], now);
}

/**
 * This POD's items, from cache when it is fresh.
 *
 * The cache itself is in `live/cache.ts`; what matters here is that a board
 * load, its roster and the drawer that opens on top of it share one answer
 * rather than each fetching a year.
 */
export const liveItems = (team: Team, now = Date.now()) =>
  cached(team.id, now, () => fetchAll(team, now));

export { forgetLive } from "./cache.ts";
