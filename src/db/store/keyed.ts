/**
 * A collection read and written by id, for each driver.
 *
 * PODs, accounts, repos and everything the DevOps board stores are the same
 * shape of thing: a handful of documents, fetched whole, addressed by a
 * deterministic id. Hand-writing that per collection per driver meant four
 * near-identical copies before the DevOps work and would have meant sixteen
 * after, which is four chances for one of them to drift.
 *
 * So each driver supplies one factory here and a new collection costs a line.
 * Every write still goes through `toDocument`, so what a file stores is what
 * MongoDB would store. See `db/document.ts`.
 */
import { fromStored, toDocument, toStoredRow, type AnyModel } from "../document.ts";
import { mutate, readCollection } from "./json-files.ts";
import { removeRow, upsertRow } from "./json-rowops.ts";
import { connectToDatabase } from "../connect.ts";
import type { CollectionName } from "./json-paths.ts";

/** Every collection except `items`, which has its own query-heavy store. */
type Keyable = Exclude<CollectionName, "items">;

/** Read by id, write by id, count. What every small collection needs. */
export type KeyedStore<T> = {
  all(): Promise<T[]>;
  byId(id: string): Promise<T | null>;
  save(doc: T): Promise<T>;
  remove(id: string): Promise<void>;
  count(): Promise<number>;
};

/** Anything with the id the row is keyed by. */
type Keyed = { id?: string };

/**
 * The sentence shown when a document will not store.
 *
 * Named per collection so the reader is told what failed to save rather than
 * "validation failed" — they are looking at a form, not at a schema.
 */
const refusal = (label: string, reason: string | null) => `Cannot save that ${label}: ${reason}.`;

/* ------------------------------------------------------------------ json */

export function jsonKeyed<T extends Keyed>(name: Keyable, model: AnyModel, label: string): KeyedStore<T> {
  return {
    async all() {
      const out: T[] = [];
      for (const row of readCollection<Record<string, unknown>>(name)) {
        const doc = fromStored<T>(model, row);
        // A row that will not read is skipped, not fatal. It predates a schema
        // change or was hand-edited, and one bad row must not empty the screen.
        if (doc) out.push(doc);
      }
      return out;
    },

    async byId(id: string) {
      if (typeof id !== "string" || !id) return null;
      const row = readCollection<Record<string, unknown>>(name).find((r) => r._id === id || r.id === id);
      return fromStored<T>(model, row);
    },

    async save(doc: T) {
      const checked = toDocument<T>(model, doc, doc?.id ?? "");
      if (!checked.doc) throw new Error(refusal(label, checked.error));

      await upsertRow(name, doc.id as string, toStoredRow(model, checked.doc as Record<string, unknown>, doc.id as string));
      return checked.doc;
    },

    async remove(id: string) {
      if (typeof id !== "string" || !id) return;
      await removeRow(name, id);
    },

    async count() {
      return readCollection<unknown>(name).length;
    },
  };
}

/* --------------------------------------------------------------- mongodb */

export function mongoKeyed<T extends Keyed>(model: AnyModel, label: string): KeyedStore<T> {
  return {
    async all() {
      await connectToDatabase();
      const docs = (await model.find({}).lean()) as Record<string, unknown>[];
      return docs.map((d) => fromStored<T>(model, d)).filter((d): d is T => d !== null);
    },

    async byId(id: string) {
      if (typeof id !== "string" || !id) return null;
      await connectToDatabase();
      const doc = (await model.findById(id).lean()) as Record<string, unknown> | null;
      return fromStored<T>(model, doc ?? undefined);
    },

    async save(doc: T) {
      await connectToDatabase();
      const checked = toDocument<T>(model, doc, doc?.id ?? "");
      if (!checked.doc) throw new Error(refusal(label, checked.error));

      await model.replaceOne({ _id: doc.id }, checked.doc, { upsert: true });
      return checked.doc;
    },

    async remove(id: string) {
      if (typeof id !== "string" || !id) return;
      await connectToDatabase();
      await model.deleteOne({ _id: id });
    },

    async count() {
      await connectToDatabase();
      return model.countDocuments({});
    },
  };
}

/* ---------------------------------------------------------------- memory */

export function memoryKeyed<T extends Keyed>(table: Map<string, Record<string, unknown>>, model: AnyModel, label: string): KeyedStore<T> {
  return {
    async all() {
      return [...table.values()].map((r) => fromStored<T>(model, r)).filter((d): d is T => d !== null);
    },

    async byId(id: string) {
      if (typeof id !== "string" || !id) return null;
      return fromStored<T>(model, table.get(id));
    },

    async save(doc: T) {
      const checked = toDocument<T>(model, doc, doc?.id ?? "");
      if (!checked.doc) throw new Error(refusal(label, checked.error));

      table.set(doc.id as string, toStoredRow(model, checked.doc as Record<string, unknown>, doc.id as string));
      return checked.doc;
    },

    async remove(id: string) {
      if (typeof id === "string") table.delete(id);
    },

    async count() {
      return table.size;
    },
  };
}
