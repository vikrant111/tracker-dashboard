/**
 * A lock that holds **across processes**, and waits without blocking.
 *
 * The in-process queue in `json-files.ts` stops two requests in the same server
 * clobbering each other. It does nothing about two *processes*, and that is not
 * hypothetical: running `pnpm seed` while `pnpm dev` is up is an ordinary thing
 * to do, and the check suite writes to the store while the server it is testing
 * writes too. Without this, one side reads, the other writes, the first writes
 * back its stale copy, and the second set of changes is gone.
 *
 * `open(..., "wx")` is the primitive: it creates the file **or fails**, and the
 * kernel decides which — so exactly one process wins, with no window between
 * checking and creating.
 *
 * **Waiting is asynchronous, and that is not a detail.** The first version spun
 * on `while (Date.now() < until)`, which in a single-threaded server blocks the
 * event loop — so a request waiting for the lock prevented the very work that
 * would release it from ever running. Under any real contention it failed
 * scattered, unrelated requests, which is exactly what it looked like.
 */
import { closeSync, existsSync, openSync, rmSync, statSync, writeSync } from "node:fs";
import { join } from "node:path";
import { STORE_DIR } from "./json-paths.ts";

/**
 * How long to keep trying, and when to declare a lock abandoned.
 *
 * A write here is a few milliseconds, so waiting five seconds means something
 * is badly wrong. Ten seconds of staleness is far longer than any real write
 * and short enough that a crashed process does not wedge the store until a
 * human notices.
 */
const WAIT_MS = 5_000;
const STALE_MS = 10_000;
const RETRY_MS = 8;

const lockPath = (name: string) => join(STORE_DIR, `.${name}.lock`);

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Is this lock abandoned?
 *
 * Judged by the file's own **mtime**, not by what is written inside it.
 * Reading the contents was a race that defeated the whole lock: `open(…, "wx")`
 * creates the file *empty* and the pid is written a moment later, so another
 * process reading in that window saw `""`, concluded the lock was abandoned and
 * took it. Two processes then held it at once.
 */
function isStale(path: string): boolean {
  try {
    return Date.now() - statSync(path).mtimeMs > STALE_MS;
  } catch {
    /* Gone between the failed create and this check: not a live lock. */
    return true;
  }
}

/** Take the lock, or return null if somebody else has it. */
function tryAcquire(path: string): number | null {
  try {
    const fd = openSync(path, "wx");
    writeSync(fd, `${process.pid} ${Date.now()}`);
    return fd;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "EEXIST") throw err;
    return null;
  }
}

function release(path: string, fd: number): void {
  try {
    closeSync(fd);
  } catch {
    /* already closed */
  }
  try {
    rmSync(path, { force: true });
  } catch {
    /* the next writer's staleness check will clear it */
  }
}

/**
 * Hold the lock for one collection while `work` runs.
 *
 * Released in a `finally`, so a throw inside the write does not leave the store
 * locked for the next ten seconds.
 */
export async function withLock<T>(name: string, work: () => T): Promise<T> {
  const path = lockPath(name);
  const deadline = Date.now() + WAIT_MS;
  let fd: number | null = null;

  while (fd === null) {
    fd = tryAcquire(path);
    if (fd !== null) break;

    /*
     * Somebody holds it. If they died holding it, take it — otherwise a crashed
     * seed would block every write until somebody deleted the file by hand.
     */
    if (isStale(path)) {
      try {
        rmSync(path, { force: true });
      } catch {
        /* another process got there first; the next attempt finds out */
      }
      continue;
    }

    if (Date.now() > deadline) {
      throw new Error(
        `Timed out waiting to write ${name}.json — another process has held the lock for over ` +
          `${Math.round(WAIT_MS / 1000)}s. If nothing else is running, delete ${path}.`,
      );
    }
    await sleep(RETRY_MS);
  }

  try {
    return work();
  } finally {
    release(path, fd);
  }
}

/** Whether a lock is currently held. For the checks, and for diagnostics. */
export const isLocked = (name: string): boolean => existsSync(lockPath(name)) && !isStale(lockPath(name));
