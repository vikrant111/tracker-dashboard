/**
 * How this app talks to MongoDB, and what it refuses to guess.
 *
 * The whole point of the move off OpenSearch was that a locked-down machine
 * could not run it: no Docker, no admin rights. Mongo needs neither — a hosted
 * connection string is the entire configuration, and the same code path serves
 * a laptop, a shared dev cluster and production.
 */

/** The default a developer gets with nothing configured: a local server. */
export const DEFAULT_URI = "mongodb://127.0.0.1:27017";

/** The database inside the cluster. Atlas connection strings often omit it. */
export const DEFAULT_DB = "pod_tracker";

export const CONNECTION = {
  /**
   * How long to wait for a server before giving up.
   *
   * Mongoose's own default is 30s, which on a misconfigured host means a
   * request that hangs for half a minute and then fails — long enough that
   * people assume the app is broken rather than unreachable. Ten seconds is
   * enough for a cold Atlas cluster and short enough to read as an error.
   */
  serverSelectionTimeoutMS: 10_000,

  /** A single operation that has not answered in this long is not going to. */
  socketTimeoutMS: 45_000,

  /**
   * Pool size.
   *
   * Serverless and dev both open connections per instance, and Atlas shared
   * tiers cap total connections at 500. Ten is comfortable for a dashboard
   * whose traffic is one polled request every 30 seconds per viewer.
   */
  maxPoolSize: 10,
  minPoolSize: 0,

  /**
   * Never buffer.
   *
   * With buffering on, a query issued while disconnected sits in memory and
   * *looks* like it is working, then fails with a timeout that names the query
   * rather than the connection. Off, a disconnected client fails immediately
   * and says so — which is the error you actually want at 3am.
   */
  bufferCommands: false,
} as const;

/**
 * Values that are obviously a placeholder rather than a real cluster.
 *
 * Shipping one of these to production means the app quietly points at nothing,
 * so `resolveMongoUri` refuses them there instead of connecting to a host that
 * does not exist.
 */
export const PLACEHOLDER_URIS = [
  "mongodb+srv://username:password@cluster.mongodb.net",
  "mongodb+srv://<username>:<password>@<cluster>",
  "mongodb://user:pass@host",
  "changeme",
] as const;
