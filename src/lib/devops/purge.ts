/**
 * Clearing a period's data, to free space — on **both** boards.
 *
 * Two operations, and the split is the whole safety design: **count first, then
 * delete**. The screen asks for a count, shows what would go, and only then
 * sends the delete with the same period. Nothing here deletes as a side effect
 * of being asked how much there is.
 *
 * It goes through the `Store`, so it clears files or a real database depending
 * on `DB_DRIVER` and nothing here knows which. That is the same promise the
 * rest of the app makes: switching drivers is one environment variable.
 *
 * The period may be a year, a month, a day **or a `from..to` range**. All four
 * are the same question to `inPeriod`, so all four are the same code here.
 */
import { HttpError } from "../http-error.ts";
import { getStore } from "../../db/store/index.ts";
import { cleanSpan, dayOf, describePeriod, inPeriod } from "./period.ts";
import { PURGE_TARGETS, type PurgeTarget } from "./purge-targets.ts";

/* The list lives next door so the panels can import it without reaching the store. */
export {
  PURGE_TARGETS,
  POD_PURGE_TARGETS,
  DEVOPS_PURGE_TARGETS,
  PURGE_LABEL,
  PURGE_DATE_FIELD,
  type PurgeTarget,
} from "./purge-targets.ts";

export type PurgeCount = { target: PurgeTarget; rows: number };

/**
 * What a purge is narrowed to.
 *
 * Both are optional and both mean "only this one". A repository scopes the
 * DevOps rows; a POD scopes the work items. Neither widens anything — an
 * absent scope means every row in the period, which is what the screen says.
 */
export type PurgeScope = { repoId?: string; teamId?: string };

/** The sentence for a period nothing can be done with. */
const BAD_PERIOD = "Pick a year, a month, a day or a date range to clear.";

/**
 * What a period holds, per collection.
 *
 * Read-only. This is what the confirmation is built from, so it must never be
 * the thing that also removes them.
 */
export async function countInPeriod(period: unknown, scope: PurgeScope = {}): Promise<PurgeCount[]> {
  const clean = cleanSpan(period);
  if (!clean) throw new HttpError(400, BAD_PERIOD);

  const store = getStore();
  await store.init();

  const [deployments, pulls, announcements, items] = await Promise.all([
    store.deployments.all(),
    store.pulls.all(),
    store.announcements.all(),
    itemsInPeriod(clean, scope),
  ]);

  const byRepo = <T extends { repoId?: string }>(rows: T[]) =>
    scope.repoId ? rows.filter((r) => r.repoId === scope.repoId) : rows;

  return [
    { target: "items", rows: items.length },
    { target: "deployments", rows: byRepo(deployments).filter((d) => inPeriod(d.deployedOn, clean)).length },
    { target: "pulls", rows: byRepo(pulls).filter((p) => inPeriod(p.mergedOn, clean)).length },
    { target: "announcements", rows: byRepo(announcements).filter((a) => inPeriod(a.createdAt, clean)).length },
  ];
}

/**
 * The work items in a period.
 *
 * By `createdDate` — the day the bug was raised, which is the date the POD
 * board is read by and the one somebody means when they say "clear last
 * quarter". It arrives as a real `Date` from both drivers, so it goes through
 * `dayOf` rather than being sliced as a string.
 *
 * Read whole and filtered here rather than pushed into the driver, for the same
 * reason every other number on this board is: one implementation, so files and
 * MongoDB cannot disagree about what a period contains.
 */
async function itemsInPeriod(clean: string, scope: PurgeScope) {
  const store = getStore();
  await store.init();

  const all = await store.items.find({}, Date.now());
  return all.filter((item) => {
    if (scope.teamId && item.teamId !== scope.teamId) return false;
    return inPeriod(dayOf(item.createdDate), clean);
  });
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
  scope: PurgeScope = {},
): Promise<{ removed: PurgeCount[]; describes: string }> {
  const clean = cleanSpan(period);
  if (!clean) throw new HttpError(400, BAD_PERIOD);

  const wanted = (Array.isArray(targets) ? targets : []).filter((t) =>
    (PURGE_TARGETS as readonly string[]).includes(t),
  );
  if (wanted.length === 0) throw new HttpError(400, "Nothing was selected to clear.");

  const store = getStore();
  await store.init();
  const removed: PurgeCount[] = [];

  if (wanted.includes("items")) {
    const doomed = await itemsInPeriod(clean, scope);
    for (const item of doomed) await store.items.deleteById(String(item.id ?? item._id ?? ""));
    removed.push({ target: "items", rows: doomed.length });
  }

  if (wanted.includes("deployments")) {
    removed.push({ target: "deployments", rows: await drop(store.deployments, (d) => inPeriod(d.deployedOn, clean), scope.repoId) });
  }
  if (wanted.includes("pulls")) {
    removed.push({ target: "pulls", rows: await drop(store.pulls, (p) => inPeriod(p.mergedOn, clean), scope.repoId) });
  }
  if (wanted.includes("announcements")) {
    removed.push({ target: "announcements", rows: await drop(store.announcements, (a) => inPeriod(a.createdAt, clean), scope.repoId) });
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
