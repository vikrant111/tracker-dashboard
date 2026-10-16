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
/**
 * One clause, or **null** when its array is empty.
 *
 * Emptying an array is how a filter is removed — that is the whole point of
 * the arrays being named and separate. It is safe because the clause is
 * dropped, not widened: the other clauses still bound the query, and a source
 * left with none at all is refused by `buildSourceWiql` rather than allowed to
 * read the entire project.
 */
function clause(c: SourceClause, sourceId: string, fields: FieldMap): string | null {
  const named = String(c.field ?? "").trim();
  const values = c.values.map((v) => String(v ?? "").trim()).filter(Boolean);
  if (!named) throw new SourceConfigError(`Source "${sourceId}" has a filter with no field name. Fix src/lib/contracts/azure-sources.ts.`);
  if (!values.length) return null;
  const field = fields?.get(named) ?? named;

  /*
   * `contains`, for a field that holds several things at once.
   *
   * The POD Name on a real request reads `AMC, Investment mall, Learning
   * Centre`, and Tags read `AMC_POD; App; Production` — `=` matches neither, so
   * a filter written as equality against them returns nothing at all and looks
   * exactly like a POD with no work. Each value gets its own `CONTAINS` and
   * they are ORed, because a clause asks "is this one of these", however many
   * other things the field also holds.
   */
  if (c.op === "contains") {
    const each = values.map((v) => `[${field}] CONTAINS ${quote(v)}`);
    return each.length === 1 ? each[0] : `(${each.join(" OR ")})`;
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
/**
 * What the contract called a field, mapped to what the query must call it.
 *
 * Built by `resolveFields` from the project's own field list, and passed in
 * rather than fetched here so this stays pure and the suite can assert on the
 * exact query text.
 */
export type FieldMap = ReadonlyMap<string, string>;

export function buildSourceWiql(source: AzureSource, sinceIso: string, fields: FieldMap = new Map()): string {
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

  const configured = [...(source.all ?? []), ...(source.any ?? [])];
  const all = (source.all ?? []).map((c) => clause(c, source.id, fields)).filter((x): x is string => x !== null);
  const any = (source.any ?? []).map((c) => clause(c, source.id, fields)).filter((x): x is string => x !== null);

  /*
   * A source whose filters have all been emptied would ask for every work item
   * in the project — the "it fetched everything" failure these arrays exist to
   * prevent. Refused, naming the file, rather than run.
   */
  if (configured.length && !all.length && !any.length) {
    throw new SourceConfigError(
      `Source "${source.id}" has filters but every one of their arrays is empty, which would read the whole project. ` +
        `Fill one in src/lib/contracts/azure-sources.ts, or delete the source.`,
    );
  }

  for (const c of all) and.push(c);
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

/** Every field a source filters on, for `resolveFields` to look up in one pass. */
export const fieldsUsedBy = (source: AzureSource): string[] =>
  [...(source.all ?? []), ...(source.any ?? [])]
    .map((c) => String(c?.field ?? "").trim())
    .filter(Boolean);
