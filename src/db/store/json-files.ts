/**
 * One JSON file per collection, read and written safely.
 *
 * The whole storage layer for the `json` driver, so a machine that cannot run a
 * database — no Docker, no admin rights, an outbound port blocked — still runs
 * the entire app from files in the repository.
 *
 * **Correctness over cleverness.** An earlier version cached reads by file
 * metadata and was wrong in three separate ways, each producing *intermittent*
 * stale data — the fastest way to lose trust in a dashboard. There is no cache
 * now. A 270 KB parse costs about a millisecond, the board polls every thirty
 * seconds, and a read that is always right is worth far more than one that is
 * usually fast and occasionally wrong.
 *
 * Two mechanisms, and both are needed:
 *
 *  - an **async mutex per file**, shared across this process, so concurrent
 *    requests inside one server take turns;
 *  - a **lock file**, so a second process — `pnpm seed` in another terminal,
 *    the check suite — takes its turn too.
 */
import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { withLock } from "./json-lock.ts";
import { STORE_DIR, storeFile, type CollectionName } from "./json-paths.ts";

/** What every file holds: a version, and the rows. */
type FileShape<T> = { version: number; collection: string; updatedAt: string; rows: T[] };

const VERSION = 1;

/**
 * The write queues, on `globalThis`.
 *
 * A bundler may load this module more than once — different route chunks, a hot
 * reload — and a module-level `Map` would then give each copy its own queue,
 * serialising nothing. The lock file would still hold, but two uncoordinated
 * queues inside one process is the kind of subtlety that only bites under load.
 */
const globalForFiles = globalThis as unknown as { __podTrackerFileQueues?: Map<string, Promise<unknown>> };
const queues: Map<string, Promise<unknown>> = (globalForFiles.__podTrackerFileQueues ??= new Map());

export function ensureStoreDir(): void {
  if (!existsSync(STORE_DIR)) mkdirSync(STORE_DIR, { recursive: true });
}

/**
 * Every row in a collection, read fresh.
 *
 * An absent file is the normal first run and reads as empty. A *corrupt* one is
 * not: it says so loudly and still returns empty, because taking the whole app
 * down over one unreadable file helps nobody find it.
 */
export function readCollection<T>(name: CollectionName): T[] {
  try {
    const parsed = JSON.parse(readFileSync(storeFile(name), "utf8")) as FileShape<T>;
    return Array.isArray(parsed?.rows) ? parsed.rows : [];
  } catch (err) {
    if ((err as NodeJS.ErrnoException)?.code !== "ENOENT") {
      console.error(`[store] ${name}.json could not be read (${(err as Error).message}). Treating as empty.`);
    }
    return [];
  }
}

/**
 * Publish a collection atomically.
 *
 * Written to a uniquely-named temp file and renamed over the target. `rename`
 * within one filesystem is atomic, so a reader sees the whole previous file or
 * the whole new one — and a crash mid-write leaves the previous file intact.
 *
 * The temp name carries a UUID, not just the pid: two concurrent writers in one
 * process once shared a path, and the second truncated the first's file before
 * it was renamed into place.
 */
export function writeCollection<T>(name: CollectionName, rows: T[]): void {
  ensureStoreDir();
  const path = storeFile(name);
  const tmp = join(STORE_DIR, `.${name}.${process.pid}.${randomUUID()}.tmp`);

  const body: FileShape<T> = { version: VERSION, collection: name, updatedAt: new Date().toISOString(), rows };

  try {
    writeFileSync(tmp, JSON.stringify(body, null, 2) + "\n", "utf8");
    renameSync(tmp, path);
  } catch (err) {
    try {
      if (existsSync(tmp)) unlinkSync(tmp);
    } catch {
      /* the temp file is not worth a second failure */
    }
    throw err;
  }
}

/**
 * Read, change, write — with every other writer waiting its turn.
 *
 * The read happens **inside** both the queue and the lock. A read-modify-write
 * against a snapshot taken earlier is precisely the lost update this prevents.
 */
export function mutate<T, R>(name: CollectionName, change: (rows: T[]) => { rows: T[]; result: R }): Promise<R> {
  const key = storeFile(name);
  const previous = queues.get(key) ?? Promise.resolve();

  const next = previous.then(() =>
    withLock(name, () => {
      const { rows, result } = change(readCollection<T>(name));
      writeCollection(name, rows);
      return result;
    }),
  );

  /* Keep the chain alive even when one write fails, or the file jams forever. */
  queues.set(
    key,
    next.catch(() => undefined),
  );
  return next;
}

/**
 * Wait for every queued write to finish.
 *
 * So a script exits after its writes have landed rather than while one is still
 * in flight.
 */
export async function drain(): Promise<void> {
  await Promise.allSettled([...queues.values()]);
}
