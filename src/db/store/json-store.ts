/**
 * The `json` driver: every collection is a file under `DB_store/`.
 *
 * No database, no daemon, no port. A clone of this repository runs the whole
 * app — dashboard, drill-downs, uploads, sync, admin — with nothing installed
 * beyond Node, which is the point on a machine an organisation locks down.
 *
 * Dates are stored as **ISO strings**, because that is what JSON has. They are
 * revived into `Date` on read so everything above this file sees the same
 * `ItemDoc` shape the Mongo driver produces — the aggregation must not be able
 * to tell which driver it is reading from.
 */
import { existsSync } from "node:fs";
import type { ItemDoc } from "../models/index.ts";
import { ItemModel } from "../models/index.ts";
import { fromStoredDoc, toDocument, toStoredRow } from "../document.ts";
import { jsonSync, jsonTeams, jsonUsers } from "./json-collections.ts";
import type { Filters } from "../../lib/metrics/types.ts";
import { matchesFilters } from "../query/predicate.ts";
import { drain, ensureStoreDir, mutate, readCollection } from "./json-files.ts";
import { COLLECTION_NAMES, STORE_DIR, storeFile } from "./json-paths.ts";
import type { Store } from "./types.ts";

export function createJsonStore(): Store {
  return {
    driver: "json",
    describe: () => `${STORE_DIR} (json files)`,

    async init() {
      ensureStoreDir();
      /*
       * Create a **missing** file, never rewrite an existing one.
       *
       * This used to write any collection that read as empty — which is most of
       * them early on — and `init()` runs on every request. Each write bumped
       * the file's mtime, invalidating every reader's cache and racing whatever
       * else was writing, so results varied between identical runs.
       */
      for (const name of COLLECTION_NAMES) {
        if (existsSync(storeFile(name))) continue;
        /*
         * Through `mutate`, so creating a missing file takes the same lock every
         * other write does. Writing directly here raced a concurrent writer —
         * `pnpm seed` in another terminal is exactly that.
         */
        await mutate<unknown, void>(name, (rows) => ({ rows, result: undefined }));
      }
    },

    async ping() {
      ensureStoreDir();
      // Reading the smallest collection proves the directory is actually usable.
      readCollection("sync");
    },

    async ensureIndexes() {
      /* Files have no indexes. Kept so the drivers share one shape. */
    },

    async close() {
      /* Let queued writes land, so a script does not exit mid-write. */
      await drain();
    },

    async dropAll() {
      /*
       * Emptying is a write like any other, so it takes the lock. It used to
       * call `writeCollection` directly, outside both the queue and the lock —
       * so `pnpm seed --reset` against a running server raced every request in
       * flight, and the board came back inconsistent.
       */
      for (const name of COLLECTION_NAMES) {
        await mutate<unknown, void>(name, () => ({ rows: [], result: undefined }));
      }
      await drain();
    },

    items: {
      async find(filters: Filters, now: number) {
        const rows = readCollection<Record<string, unknown>>("items");
        const out: ItemDoc[] = [];
        for (const row of rows) {
          const doc = fromStoredDoc<ItemDoc>(ItemModel, row);
          // A row that cannot be read is skipped rather than crashing the board.
          // It was written by an older version or edited by hand; either way one
          // bad row must not take the dashboard down with it.
          if (doc && matchesFilters(doc, filters, now)) out.push(doc);
        }
        return out;
      },

      async bulkUpsert(docs: ItemDoc[]) {
        if (!docs.length) return 0;
        return mutate<Record<string, unknown>, number>("items", (rows) => {
          const byId = new Map(rows.map((r) => [String(r._id ?? r.id), r]));
          let failed = 0;
          for (const doc of docs) {
            const id = String(doc?.id ?? "");
            /*
             * Checked against the same schema MongoDB would apply, so a bad
             * severity or a missing date is rejected here rather than becoming
             * a row that only fails on the day this moves to a real database.
             * A rejected document is counted, not thrown: an import of 500 rows
             * should land 499 and tell you about the one.
             */
            const checked = toDocument<Record<string, unknown>>(ItemModel, doc, id);
            if (!checked.doc) {
              failed++;
              continue;
            }
            byId.set(id, toStoredRow(ItemModel, checked.doc, id));
          }
          return { rows: [...byId.values()], result: failed };
        });
      },

      async deleteById(id: string) {
        if (typeof id !== "string" || !id) return;
        await mutate<Record<string, unknown>, void>("items", (rows) => ({
          rows: rows.filter((r) => String(r._id ?? r.id) !== id),
          result: undefined,
        }));
      },

      async deleteByTeam(teamId: string) {
        if (typeof teamId !== "string" || !teamId) return 0;
        return mutate<Record<string, unknown>, number>("items", (rows) => {
          const kept = rows.filter((r) => r.teamId !== teamId);
          return { rows: kept, result: rows.length - kept.length };
        });
      },

      async count() {
        return readCollection<unknown>("items").length;
      },
    },

    teams: jsonTeams(),
    users: jsonUsers(),
    sync: jsonSync(),
  };
}
