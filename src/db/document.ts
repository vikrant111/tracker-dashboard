/**
 * One gate every write passes through, on every driver.
 *
 * Mongoose does not need a connection to use a schema. `new Model(raw)` casts
 * values, fills defaults and drops undeclared keys; `validateSync()` checks the
 * enums and required fields. Both are ordinary in-process calls, so the JSON
 * driver uses the same schemas MongoDB will.
 *
 * That is the whole point: what the file driver stores is what MongoDB would
 * store, and what it refuses MongoDB would refuse. Adding a real database later
 * is a config change, not a migration.
 *
 * Without this the drivers drift quietly. A typo'd severity writes fine to a
 * file and fails on Mongo. A field missing from a schema is kept by the file
 * store and dropped by Mongo's `strict: true`. Both surface on the day of the
 * switch, which is the worst day to find out.
 */
import type { Model } from "mongoose";

/*
 * Any compiled model. Mongoose's `Model` generics are invariant, so
 * `Model<ItemDoc>` will not pass as `Model<unknown>`. Nothing here reads them —
 * every function works off `schema.paths`.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyModel = Model<any>;

/** A document that passed, or the reason it did not. Never both. */
export type Checked<T> = { doc: T; error: null } | { doc: null; error: string };

/**
 * Cast and check `raw` against a model's schema.
 *
 * Returns the object to store, or a message naming the fields that failed. The
 * caller decides: an import counts the failure and carries on, a single save
 * throws. Neither writes the document.
 */
export function toDocument<T>(model: AnyModel, raw: unknown, id: string): Checked<T> {
  if (!raw || typeof raw !== "object") return { doc: null, error: "not an object" };
  if (typeof id !== "string" || !id) return { doc: null, error: "missing id" };

  try {
    const doc = new model({ ...(raw as Record<string, unknown>), _id: id });
    const invalid = doc.validateSync();
    if (invalid) {
      // Name the fields. "validation failed" does not tell somebody which
      // column of their spreadsheet to go and look at.
      const fields = Object.keys(invalid.errors ?? {});
      return { doc: null, error: fields.length ? `invalid ${fields.join(", ")}` : invalid.message };
    }
    return { doc: doc.toObject() as T, error: null };
  } catch (err) {
    // A cast that cannot be attempted, such as a string where an array belongs.
    // Mongoose throws for those rather than returning a validation error.
    return { doc: null, error: err instanceof Error ? err.message : "could not be read" };
  }
}

/**
 * Which fields a schema stores as dates.
 *
 * JSON has no date type, so these go to file as ISO strings and come back as
 * `Date`. Read off the schema, so adding a date field is all it takes — there
 * is no second list to keep in step. Cached; schemas do not change at runtime.
 */
const dateFieldCache = new WeakMap<AnyModel, string[]>();

export function dateFields(model: AnyModel): string[] {
  const cached = dateFieldCache.get(model);
  if (cached) return cached;

  const paths = model.schema?.paths ?? {};
  const found = Object.keys(paths).filter((key) => paths[key]?.instance === "Date");
  dateFieldCache.set(model, found);
  return found;
}

/** A `Date`, or null when the value is missing or unusable. */
function asDate(value: unknown): Date | null {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value !== "string" && typeof value !== "number") return null;
  const at = new Date(value);
  return Number.isNaN(at.getTime()) ? null : at;
}

/**
 * A stored row, with its dates revived.
 *
 * `_id` is kept, because `ItemDoc` declares it and the Mongo driver returns it.
 * Dropping it here would mean the same item came back with a different set of
 * keys depending on the driver, which is exactly what these two functions exist
 * to prevent.
 */
export function fromStoredDoc<T>(model: AnyModel, row: Record<string, unknown> | undefined): T | null {
  if (!row || typeof row !== "object") return null;

  const out: Record<string, unknown> = { ...row };
  for (const field of dateFields(model)) {
    if (field === "_id" || !(field in out)) continue;
    out[field] = asDate(out[field]);
  }
  return out as T;
}

/**
 * The same, without `_id`.
 *
 * PODs, accounts and watermarks are handed out as domain types — `Team`,
 * `User`, `SyncState` — and none of those carry a storage id. The Mongo driver
 * drops it on the way out too.
 */
export function fromStored<T>(model: AnyModel, row: Record<string, unknown> | undefined): T | null {
  const doc = fromStoredDoc<Record<string, unknown>>(model, row);
  if (!doc) return null;

  const { _id, ...rest } = doc;
  void _id;
  return rest as T;
}

/**
 * A document on its way into a JSON file. Dates become ISO strings, and `_id`
 * is written alongside so the file keeps the primary key MongoDB would.
 */
export function toStoredRow(model: AnyModel, doc: Record<string, unknown>, id: string): Record<string, unknown> {
  const row: Record<string, unknown> = { ...doc, _id: id };
  for (const field of dateFields(model)) {
    if (field === "_id") continue;
    const at = asDate(row[field]);
    row[field] = at ? at.toISOString() : null;
  }
  return row;
}
