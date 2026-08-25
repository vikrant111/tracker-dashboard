/**
 * Turning environment variables into one connection string, and refusing the
 * ones that would fail silently.
 *
 * Pure and dependency-free on purpose: the check suite imports this and
 * exercises every branch without a database, a server, or a network.
 *
 * The contract the user asked for is simply *put a URL in the env*:
 *
 * ```
 * MONGODB_URI=mongodb://127.0.0.1:27017          # a laptop
 * MONGODB_URI=mongodb+srv://…@cluster.mongodb.net # Atlas, hosted, nothing installed
 * ```
 */
import { DEFAULT_DB, DEFAULT_URI, PLACEHOLDER_URIS } from "./constants/connection.ts";

export type UriVerdict =
  | { ok: true; uri: string; dbName: string; hosted: boolean; usedDefault: boolean }
  | { ok: false; reason: string };

/** `mongodb://` for a normal host list, `mongodb+srv://` for a hosted cluster. */
const SCHEME = /^mongodb(\+srv)?:\/\//i;

/**
 * Pull the database name out of the path, if the string carries one.
 *
 * Hand-parsed rather than with `new URL()`: `mongodb+srv://` is not a scheme
 * WHATWG URL parses usefully, and a password containing `/` or `@` — which
 * Atlas cheerfully generates — makes naive splitting wrong. Everything after
 * the **last** `@` is the host section, and the first `/` after that starts the
 * path.
 */
export function databaseFromUri(uri: string): string | null {
  const afterScheme = uri.replace(SCHEME, "");
  const hostSection = afterScheme.slice(afterScheme.lastIndexOf("@") + 1);
  const slash = hostSection.indexOf("/");
  if (slash === -1) return null;
  const path = hostSection.slice(slash + 1).split("?")[0];
  return path ? decodeURIComponent(path) : null;
}

/**
 * A database name Mongo will actually accept.
 *
 * The illegal set is small and specific, and a name that breaks one of these
 * rules fails at connection time with a message that does not mention the
 * environment variable it came from.
 */
export function isValidDbName(name: string): boolean {
  if (!name || name.length > 63) return false;
  return !/[/\\. "$*<>:|?]/.test(name);
}

/**
 * Resolve the connection string, the database, and whether either was guessed.
 *
 * `isProduction` is a parameter rather than a read of `NODE_ENV`, so the checks
 * can exercise production behaviour without pretending to be production.
 */
export function resolveMongoUri(
  env: Record<string, string | undefined>,
  isProduction: boolean,
): UriVerdict {
  const raw = (env.MONGODB_URI ?? "").trim();

  /*
   * No URI at all is fine on a laptop and never fine in production. Defaulting
   * to localhost in a container means connecting to the container itself,
   * which fails with `ECONNREFUSED 127.0.0.1` — an error that sends people
   * looking at the wrong machine entirely.
   */
  if (!raw) {
    if (isProduction) {
      return {
        ok: false,
        reason:
          "MONGODB_URI is not set. Production will not fall back to localhost — " +
          "set it to your cluster's connection string.",
      };
    }
    const dbName = (env.MONGODB_DB ?? "").trim() || DEFAULT_DB;
    if (!isValidDbName(dbName)) return { ok: false, reason: badDbName(dbName) };
    return { ok: true, uri: DEFAULT_URI, dbName, hosted: false, usedDefault: true };
  }

  if (!SCHEME.test(raw)) {
    return {
      ok: false,
      reason:
        `MONGODB_URI must start with "mongodb://" or "mongodb+srv://" — got "${preview(raw)}". ` +
        "Copy the string from Atlas → Connect → Drivers, or use mongodb://127.0.0.1:27017 locally.",
    };
  }

  const placeholder = PLACEHOLDER_URIS.some((p) => raw.toLowerCase().startsWith(p.toLowerCase()));
  if (placeholder || raw.includes("<username>") || raw.includes("<password>")) {
    return {
      ok: false,
      reason:
        "MONGODB_URI is still the example from the docs. Replace the username, " +
        "password and host with your own cluster's values.",
    };
  }

  /*
   * A host must survive the scheme and the credentials. `mongodb://` on its own
   * passes the scheme test and then fails much later, inside the driver.
   */
  const afterScheme = raw.replace(SCHEME, "");
  const host = afterScheme.slice(afterScheme.lastIndexOf("@") + 1).split(/[/?]/)[0];
  if (!host) {
    return { ok: false, reason: `MONGODB_URI has no host: "${preview(raw)}".` };
  }

  /*
   * `MONGODB_DB` wins over a database in the path, so one connection string can
   * be pointed at a scratch database without being rewritten. Atlas strings
   * usually carry no path at all, which is why a default exists.
   */
  const dbName = (env.MONGODB_DB ?? "").trim() || databaseFromUri(raw) || DEFAULT_DB;
  if (!isValidDbName(dbName)) return { ok: false, reason: badDbName(dbName) };

  return { ok: true, uri: raw, dbName, hosted: /^mongodb\+srv:/i.test(raw), usedDefault: false };
}

/** Never echo a connection string wholesale — it carries the password. */
function preview(uri: string): string {
  const head = uri.slice(0, 24);
  return uri.length > 24 ? `${head}…` : head;
}

const badDbName = (name: string) =>
  `"${name}" is not a usable database name. Avoid / \\ . " $ * < > : | ? and spaces, and keep it under 64 characters.`;

/**
 * A connection string with the password replaced, safe to log or show.
 *
 * Anything between `://` and the last `@` is credentials. Everything is
 * redacted rather than only the part after `:`, because a username is also
 * worth not printing into a shared terminal.
 */
export function redactUri(uri: string): string {
  return uri.replace(/(mongodb(?:\+srv)?:\/\/)[^@/]*@/i, "$1***:***@");
}
