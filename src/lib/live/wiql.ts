/**
 * A contract source, as the WIQL Azure will answer.
 *
 * Pure on purpose: the query is the part that decides what the board is made
 * of, and the one part that cannot be tested against a real org from a check
 * suite. Building the string here means `pnpm check:ui` asserts on the exact
 * text — including the bounds, which is where this goes wrong quietly.
 */
import { escapeWiql, wiqlDate } from "../azure.ts";
import type { AzureSource, SourceClause } from "../contracts/azure-sources.ts";
import { LIVE, WINDOW_MODES, type WindowMode } from "../contracts/item-filters.ts";

export class SourceConfigError extends Error {}

const quote = (v: string) => `'${escapeWiql(v)}'`;

/**
 * One clause, or **a thrown error** when its value list is empty.
 *
 * Empty is not "match everything". A `Custom.ModuleName IN ()` silently dropped
 * would turn a filter on one module into the whole project — which is exactly
 * the "it fetched everything" failure this contract exists to stop. So an empty
 * list is a configuration mistake and says so, naming the file to edit.
 */
function clause(c: SourceClause, sourceId: string): string {
  const field = String(c.field ?? "").trim();
  const values = c.values.map((v) => String(v ?? "").trim()).filter(Boolean);
  if (!field) throw new SourceConfigError(`Source "${sourceId}" has a filter with no field name. Fix src/lib/contracts/azure-sources.ts.`);
  if (!values.length) {
    throw new SourceConfigError(
      `Source "${sourceId}" filters on ${field} but lists no values. Fill the list in src/lib/contracts/azure-sources.ts, or remove the filter — an empty list would read the whole project.`,
    );
  }
  return values.length === 1
    ? `[${field}] = ${quote(values[0])}`
    : `[${field}] IN (${values.map(quote).join(", ")})`;
}

/**
 * The WIQL for one source, bounded to `sinceIso`.
 *
 * `all` clauses are ANDed, `any` clauses are ORed inside their own bracket.
 * That bracket is load-bearing: `a AND b OR c` reads as `(a AND b) OR c` in
 * WIQL as in most dialects, which would let an item through on the OR branch
 * alone — no project bound, no date bound, no work item type bound.
 */
export function buildSourceWiql(source: AzureSource, sinceIso: string): string {
  const and: string[] = [`[System.TeamProject] = ${quote(source.project)}`];

  const types = source.workItemTypes.map((t) => String(t ?? "").trim()).filter(Boolean);
  if (!types.length) {
    throw new SourceConfigError(`Source "${source.id}" lists no work item types. Add them in src/lib/contracts/azure-sources.ts.`);
  }
  and.push(`[System.WorkItemType] IN (${types.map(quote).join(", ")})`);

  const mode = source.windowMode ?? LIVE.windowMode;
  if (!(WINDOW_MODES as readonly string[]).includes(mode)) {
    throw new SourceConfigError(`Source "${source.id}" has window mode "${mode}". Use one of: ${WINDOW_MODES.join(", ")}.`);
  }
  and.push(windowClause(mode, sinceIso));

  if (source.areaPath?.trim()) and.push(`[System.AreaPath] UNDER ${quote(source.areaPath.trim())}`);

  for (const c of source.all ?? []) and.push(clause(c, source.id));

  const any = (source.any ?? []).map((c) => clause(c, source.id));
  if (any.length) and.push(any.length === 1 ? any[0] : `(${any.join(" OR ")})`);

  /*
   * Newest first. If a board ever returns more than Azure will hand over in one
   * query, the items kept are the recent ones rather than an arbitrary slice —
   * an ageing board is read from its live end.
   */
  return `SELECT [System.Id] FROM WorkItems WHERE ${and.join(" AND ")} ORDER BY [System.ChangedDate] DESC`;
}

/**
 * The date bound, per mode.
 *
 * Bracketed, because every one of these but `created` is an OR group and WIQL
 * binds `a AND b OR c` as `(a AND b) OR c` — unbracketed, an item would come
 * back on the date branch alone, with no project, type or filter bound.
 *
 * `open-or-touched` adds `ClosedDate = ''`, which is how WIQL asks for a field
 * with no value. It is the only clause here a customised process can reject,
 * and it does so loudly: the board errors rather than quietly narrowing.
 */
function windowClause(mode: WindowMode, sinceIso: string): string {
  const since = quote(wiqlDate(sinceIso));
  const created = `[System.CreatedDate] >= ${since}`;
  if (mode === "created") return created;
  const touched = `${created} OR [System.ChangedDate] >= ${since}`;
  if (mode === "touched") return `(${touched})`;
  return `(${touched} OR [Microsoft.VSTS.Common.ClosedDate] = '')`;
}
