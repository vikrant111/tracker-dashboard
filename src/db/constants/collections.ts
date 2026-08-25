/**
 * Collection names, and the prefix that keeps this app's data separate.
 *
 * One shared cluster is the normal case — an Atlas free tier holds several
 * projects — so every collection is prefixed. `MONGODB_COLLECTION_PREFIX`
 * replaces the old `OPENSEARCH_INDEX_PREFIX` and behaves the same way: change
 * it and you get a clean, parallel set of data.
 *
 * Never hardcode a collection name anywhere else. The models below are the only
 * place these strings are read.
 */

const RAW = process.env.MONGODB_COLLECTION_PREFIX ?? process.env.OPENSEARCH_INDEX_PREFIX ?? "tracker";

/**
 * A prefix has to survive being used as a collection name. Mongo rejects `$`
 * and the null byte outright, and a leading `system.` is reserved — so the
 * value is normalised rather than trusted, and an empty result falls back
 * instead of producing a collection called `-items`.
 */
const PREFIX = RAW.trim().replace(/[^A-Za-z0-9_-]/g, "").replace(/^system\.?/i, "") || "tracker";

export const COLLECTIONS = {
  items: `${PREFIX}_items`,
  teams: `${PREFIX}_teams`,
  users: `${PREFIX}_users`,
  sync: `${PREFIX}_sync`,
} as const;

/**
 * Model names, kept distinct from collection names.
 *
 * Mongoose caches compiled models on the connection by *model* name. Under
 * Next's dev hot-reload the module re-evaluates while the connection survives,
 * so registering the same name twice throws `OverwriteModelError` — the
 * registry in `../models` looks a model up by these keys before compiling.
 */
export const MODELS = {
  item: "Item",
  team: "Team",
  user: "User",
  sync: "SyncState",
} as const;

export { PREFIX as COLLECTION_PREFIX };
