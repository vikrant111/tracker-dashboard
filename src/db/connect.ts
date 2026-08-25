/**
 * One connection, reused.
 *
 * This is the module that replaces `ensureIndices()` — every entry point awaits
 * it before touching data, and it is idempotent.
 *
 * **Why the global.** Next's dev server re-evaluates modules on every edit, and
 * serverless invocations reuse a warm process. A plain module-level `let` gives
 * you a new connection per reload, and a few dozen edits later Atlas starts
 * refusing them. Stashing the promise on `globalThis` is the documented way
 * out, and the reason this file looks stranger than it is.
 */
import mongoose from "mongoose";
import { CONNECTION } from "./constants/connection.ts";
import { redactUri, resolveMongoUri } from "./uri.ts";

type Cache = {
  conn: typeof mongoose | null;
  promise: Promise<typeof mongoose> | null;
  indexed: boolean;
};

const globalForMongoose = globalThis as unknown as { __podTrackerMongo?: Cache };

const cache: Cache = (globalForMongoose.__podTrackerMongo ??= {
  conn: null,
  promise: null,
  indexed: false,
});

/**
 * Strict queries: a filter naming a field the schema does not have is dropped
 * rather than sent. That turns a typo — `teamID` for `teamId` — from a filter
 * that silently matches everything into one that matches nothing, which is the
 * failure you notice. Set once, globally, because it is a correctness setting
 * and not a per-model preference.
 */
mongoose.set("strictQuery", true);

/** Where we are connected, with the password removed. Safe to log. */
export function describeConnection(): string {
  const verdict = resolveMongoUri(process.env, process.env.NODE_ENV === "production");
  if (!verdict.ok) return "not configured";
  return `${redactUri(verdict.uri)} → ${verdict.dbName}`;
}

/**
 * Connect, or return the live connection.
 *
 * Throws with a sentence a human can act on. Callers let it propagate:
 * `errorResponse()` turns it into a 500 and the readiness probe into a 503.
 */
export async function connectToDatabase(): Promise<typeof mongoose> {
  if (cache.conn && mongoose.connection.readyState === 1) return cache.conn;

  if (!cache.promise) {
    const verdict = resolveMongoUri(process.env, process.env.NODE_ENV === "production");
    if (!verdict.ok) {
      /*
       * Configuration errors are thrown *before* a promise is cached, so fixing
       * `.env.local` and reloading works without restarting the process.
       */
      throw new Error(`Cannot connect to MongoDB. ${verdict.reason}`);
    }

    cache.promise = mongoose
      .connect(verdict.uri, {
        dbName: verdict.dbName,
        serverSelectionTimeoutMS: CONNECTION.serverSelectionTimeoutMS,
        socketTimeoutMS: CONNECTION.socketTimeoutMS,
        maxPoolSize: CONNECTION.maxPoolSize,
        minPoolSize: CONNECTION.minPoolSize,
        bufferCommands: CONNECTION.bufferCommands,
      })
      .catch((err: unknown) => {
        /*
         * Clear the cache so the next request retries rather than being handed
         * this same rejected promise forever — the same reason `ensureIndices`
         * did it under OpenSearch.
         */
        cache.promise = null;
        throw new Error(explain(err, verdict.uri));
      });
  }

  cache.conn = await cache.promise;
  return cache.conn;
}

/**
 * Create the indexes the schemas declare, once per process.
 *
 * Separate from connecting, and deliberately **not** awaited on the read path:
 * `syncIndexes` on a large collection can take a while, and a dashboard that
 * blocks on it every cold start is worse than one whose first query is slow.
 * `pnpm seed` and the readiness probe call this; a plain request does not.
 */
export async function ensureIndexes(force = false): Promise<void> {
  if (cache.indexed && !force) return;
  await connectToDatabase();
  const { models } = await import("./models/index.ts");
  await Promise.all(Object.values(models).map((m) => m.createIndexes()));
  cache.indexed = true;
}

/**
 * Close the connection. For scripts and tests — a long-lived server never
 * needs it, and calling it mid-request would break in-flight queries.
 */
export async function disconnectFromDatabase(): Promise<void> {
  if (!cache.conn) return;
  await mongoose.disconnect();
  cache.conn = null;
  cache.promise = null;
  cache.indexed = false;
}

/** Is the connection live right now? Used by the readiness probe. */
export const isConnected = () => mongoose.connection.readyState === 1;

/**
 * Driver errors, translated.
 *
 * The raw messages name a hostname and a topology and never mention the thing
 * that is actually wrong — which for a first-time setup is nearly always the
 * IP allowlist or a password that was pasted with the angle brackets still on.
 */
function explain(err: unknown, uri: string): string {
  const raw = err instanceof Error ? err.message : String(err);
  const safe = redactUri(uri);

  if (/Authentication failed|bad auth/i.test(raw)) {
    return (
      `MongoDB refused the credentials in MONGODB_URI (${safe}). ` +
      `Check the database user's password — and if it contains @ : / ? # or %, ` +
      `it must be percent-encoded in the connection string.`
    );
  }
  if (/IP that isn't whitelisted|not allowed to access|whitelist/i.test(raw)) {
    return (
      `MongoDB accepted the address but refused this machine (${safe}). ` +
      `Add your current IP under Atlas → Network Access.`
    );
  }
  if (/ENOTFOUND|querySrv|EAI_AGAIN/i.test(raw)) {
    return (
      `The MongoDB host in MONGODB_URI could not be resolved (${safe}). ` +
      `Check the cluster address; a mongodb+srv:// string also needs DNS SRV lookups, ` +
      `which some corporate networks block.`
    );
  }
  if (/ECONNREFUSED/i.test(raw)) {
    return (
      `Nothing is listening at ${safe}. Start a local MongoDB, or point MONGODB_URI ` +
      `at a hosted cluster — see docs/restricted-environments.md.`
    );
  }
  if (/timed out|ETIMEDOUT|Server selection timed out/i.test(raw)) {
    return (
      `MongoDB did not answer within ${CONNECTION.serverSelectionTimeoutMS / 1000}s (${safe}). ` +
      `Either the host is wrong, or outbound port 27017 is blocked — which is common on ` +
      `a corporate network. See docs/restricted-environments.md.`
    );
  }
  return `Could not connect to MongoDB (${safe}): ${raw}`;
}
