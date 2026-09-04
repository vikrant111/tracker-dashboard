/**
 * The `mongodb` driver: the same contract, backed by a real cluster.
 *
 * Thin on purpose. Every number is still computed by the shared aggregation
 * over what this returns, so switching drivers cannot change a figure on the
 * board — which is the only way "swap it later" is safe to promise.
 */
import type { ItemDoc } from "../models/index.ts";
import type { Filters } from "../../lib/metrics/types.ts";
import {
  connectToDatabase,
  describeConnection,
  disconnectFromDatabase,
  ensureIndexes as ensureMongoIndexes,
} from "../connect.ts";
import { ItemModel, models } from "../models/index.ts";
import { toDocument } from "../document.ts";
import { mongoSync, mongoTeams, mongoUsers } from "./mongo-collections.ts";
import { buildMatch } from "../query/match.ts";
import type { Store } from "./types.ts";

export function createMongoStore(): Store {
  return {
    driver: "mongodb",
    describe: () => describeConnection(),

    async init() {
      await connectToDatabase();
    },

    async ping() {
      const mongoose = await connectToDatabase();
      await mongoose.connection.db?.admin().ping();
    },

    async ensureIndexes(force = false) {
      await ensureMongoIndexes(force);
    },

    async close() {
      await disconnectFromDatabase();
    },

    async dropAll() {
      await connectToDatabase();
      for (const model of Object.values(models)) {
        await model.collection.drop().catch((err: { code?: number }) => {
          // 26 is NamespaceNotFound: there was nothing to drop, which is fine.
          if (err?.code !== 26) throw err;
        });
      }
    },

    items: {
      async find(filters: Filters, now: number) {
        await connectToDatabase();
        /*
         * `$match` in the database, then the shared aggregation in the app.
         * The driver narrows — it does not count. See `store/types.ts` for why,
         * and for the size at which this should grow a real `$facet`.
         */
        return (await ItemModel.find(buildMatch(filters, now)).lean()) as unknown as ItemDoc[];
      },

      async bulkUpsert(docs: ItemDoc[]) {
        if (!docs.length) return 0;
        await connectToDatabase();
        /*
         * Through the same gate the JSON driver uses, rather than trusting
         * `bulkWrite` to validate. `bulkWrite` talks to the driver underneath
         * Mongoose, and how much of the schema it applies has changed between
         * Mongoose versions. Checking here means the two drivers accept and
         * reject exactly the same documents, and that does not depend on which
         * version happens to be installed.
         */
        let rejected = 0;
        const operations: { replaceOne: { filter: { _id: string }; replacement: ItemDoc; upsert: true } }[] = [];
        for (const doc of docs) {
          const checked = toDocument<ItemDoc>(ItemModel, doc, String(doc?.id ?? ""));
          if (!checked.doc) {
            rejected++;
            continue;
          }
          operations.push({
            replaceOne: { filter: { _id: doc.id }, replacement: checked.doc, upsert: true },
          });
        }
        if (!operations.length) return rejected;
        try {
          const res = await ItemModel.bulkWrite(operations, { ordered: false });
          const written = (res.upsertedCount ?? 0) + (res.modifiedCount ?? 0) + (res.matchedCount ?? 0);
          return rejected + Math.max(0, operations.length - written);
        } catch (err) {
          /*
           * An unordered bulkWrite that partly fails throws while still having
           * written the good documents, so the count is recoverable. Treating
           * the throw as total failure reports a successful 499-row import as
           * a loss.
           */
          const failures = (err as { writeErrors?: unknown[] })?.writeErrors;
          if (Array.isArray(failures)) return rejected + failures.length;
          throw err;
        }
      },

      async deleteById(id: string) {
        if (typeof id !== "string" || !id) return;
        await connectToDatabase();
        await ItemModel.deleteOne({ _id: id });
      },

      async deleteByTeam(teamId: string) {
        if (typeof teamId !== "string" || !teamId) return 0;
        await connectToDatabase();
        return (await ItemModel.deleteMany({ teamId })).deletedCount ?? 0;
      },

      async count() {
        await connectToDatabase();
        return ItemModel.countDocuments({});
      },
    },

    teams: mongoTeams(),
    users: mongoUsers(),
    sync: mongoSync(),
  };
}
