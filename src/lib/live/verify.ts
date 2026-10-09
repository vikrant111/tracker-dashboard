/**
 * Checking a fetched work item against the filters that asked for it.
 *
 * The WIQL already carries those filters, so in principle this is redundant —
 * and it is here because "in principle" is doing a lot of work in that
 * sentence. Azure matches an identity field generously: a clause naming an
 * email can come back matched on a display name, and a multi-select field holds
 * several values in one string. Either way an item can arrive that does not
 * carry the value the contract asked for, and nothing downstream would ever
 * question it.
 *
 * So the clauses are evaluated a second time, here, against the item's own
 * fields. Pure, so `pnpm check:ui` can put every awkward payload shape through
 * it — an identity object, a semicolon list, a field Azure left out entirely —
 * without an org to ask.
 */
import type { AzureSource, SourceClause } from "../contracts/azure-sources.ts";

/** What `workitemsbatch` puts in `fields`: a string, a number, or an identity. */
type FieldValue = unknown;

const clean = (v: string) => v.trim().toLowerCase();

/**
 * Every way one field can carry a value worth comparing.
 *
 * An identity contributes **both** its display name and its sign-in name,
 * because a contract may name either and Azure will have matched on either.
 * A multi-select field holds `"A; B"` in one string, so it contributes each
 * part — comparing the whole string would reject an item that genuinely
 * carries the value alongside another.
 */
export function valuesOf(field: FieldValue): string[] {
  if (field == null) return [];
  if (typeof field === "number" || typeof field === "boolean") return [clean(String(field))];
  if (typeof field === "string") {
    return field
      .split(";")
      .map(clean)
      .filter(Boolean);
  }
  if (typeof field === "object") {
    const id = field as { displayName?: unknown; uniqueName?: unknown; name?: unknown };
    return [id.displayName, id.uniqueName, id.name]
      .filter((v) => typeof v === "string" && v.trim())
      .map((v) => clean(String(v)));
  }
  return [];
}

/**
 * Does the item carry one of the values this clause asked for?
 *
 * An **absent** field is a no. Azure cannot have matched a field the item does
 * not have, so its absence here means the item arrived for some other reason —
 * which is the case worth catching rather than waving through.
 */
export function satisfiesClause(fields: Record<string, FieldValue>, clause: SourceClause): boolean {
  const held = valuesOf(fields[clause.field]);
  if (!held.length) return false;
  const wanted = clause.values.map((v) => clean(String(v ?? ""))).filter(Boolean);
  return wanted.some((want) => held.includes(want));
}

/**
 * Does the item satisfy the source that fetched it?
 *
 * `all` clauses every one, `any` clauses at least one — the same shape the WIQL
 * is built from, deliberately, so the two cannot drift into disagreeing about
 * what the contract says. A source with no clauses at all is satisfied by
 * anything, because the project and type bounds are the whole filter.
 */
export function satisfiesSource(fields: Record<string, FieldValue>, source: AzureSource): boolean {
  for (const clause of source.all ?? []) {
    if (!satisfiesClause(fields, clause)) return false;
  }
  const any = source.any ?? [];
  if (any.length && !any.some((clause) => satisfiesClause(fields, clause))) return false;
  return true;
}
