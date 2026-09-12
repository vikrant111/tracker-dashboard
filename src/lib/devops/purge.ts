/**
 * Clearing a period's data, to free space.
 *
 * Two operations, and the split is the whole safety design: **count first, then
 * delete**. The screen asks for a count, shows what would go, and only then
 * sends the delete with the same period. Nothing here deletes as a side effect
 * of being asked how much there is.
 */
import { HttpError } from "../http-error.ts";
import { getStore } from "../../db/store/index.ts";
import { cleanSpan, describePeriod, inPeriod } from "./period.ts";
import { PURGE_TARGETS, type PurgeTarget } from "./purge-targets.ts";

/* The list lives next door so the panel can import it without reaching the store. */
export { PURGE_TARGETS, type PurgeTarget } from "./purge-targets.ts";

export type PurgeCount = { target: PurgeTarget; rows: number };

/**
 * What a period holds, per collection.
 *
 * Read-only. This is what the confirmation is built from, so it must never be
 * the thing that also removes them.
 */
export async function countInPeriod(period: unknown, repoId?: string): Promise<PurgeCount[]> {
  const clean = cleanSpan(period);
  if (!clean) throw new HttpError(400, "Pick a year, a month, a day or a date range to clear.");

  const store = getStore();
  await store.init();

  const [deployments, pulls, announcements] = await Promise.all([
    store.deployments.all(),
    store.pulls.all(),
    store.announcements.all(),
  ]);

  const scoped = <T extends { repoId?: string }>(rows: T[]) =>
    repoId ? rows.filter((r) => r.repoId === repoId) : rows;

  return [
    { target: "deployments", rows: scoped(deployments).filter((d) => inPeriod(d.deployedOn, clean)).length },
    { target: "pulls", rows: scoped(pulls).filter((p) => inPeriod(p.mergedOn, clean)).length },
    { target: "announcements", rows: scoped(announcements).filter((a) => inPeriod(a.createdAt, clean)).length },
  ];
}

/**
 * Remove everything in a period.
 *
 * Irreversible, and there is no undo anywhere in this app — which is why the
 * period is parsed strictly, why an empty period matches nothing rather than
 * everything, and why the caller has to have asked for a count first to know
 * what it is agreeing to.
 */
export async function purgePeriod(
  period: unknown,
  targets: readonly PurgeTarget[],
  repoId?: string,
): Promise<{ removed: PurgeCount[]; describes: string }> {
  const clean = cleanSpan(period);
  if (!clean) throw new HttpError(400, "Pick a year, a month, a day or a date range to clear.");

  const wanted = targets.filter((t) => (PURGE_TARGETS as readonly string[]).includes(t));
  if (wanted.length === 0) throw new HttpError(400, "Nothing was selected to clear.");

  const store = getStore();
  await store.init();
  const removed: PurgeCount[] = [];

  if (wanted.includes("deployments")) {
    removed.push({ target: "deployments", rows: await drop(store.deployments, (d) => inPeriod(d.deployedOn, clean), repoId) });
  }
  if (wanted.includes("pulls")) {
    removed.push({ target: "pulls", rows: await drop(store.pulls, (p) => inPeriod(p.mergedOn, clean), repoId) });
  }
  if (wanted.includes("announcements")) {
    removed.push({ target: "announcements", rows: await drop(store.announcements, (a) => inPeriod(a.createdAt, clean), repoId) });
  }

  return { removed, describes: describePeriod(clean) };
}

/** Delete the rows a predicate picks, and report how many went. */
async function drop<T extends { id: string; repoId?: string }>(
  collection: { all(): Promise<T[]>; remove(id: string): Promise<void> },
  matches: (row: T) => boolean,
  repoId?: string,
): Promise<number> {
  const rows = (await collection.all()).filter((r) => (!repoId || r.repoId === repoId) && matches(r));
  for (const row of rows) await collection.remove(row.id);
  return rows.length;
}
