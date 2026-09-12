/**
 * Pull request records: reading them, filtering them, signing them off.
 */
import { HttpError } from "../http-error.ts";
import { getStore } from "../../db/store/index.ts";
import { devopsConfig } from "./config.ts";
import { inPeriod } from "./period.ts";
import { movedPulls } from "./scope-link.ts";
import { inReportOrder } from "./report.ts";
import { mergePull, readMergedPulls } from "./pull-sync.ts";
import { setSignoff, SIGNOFF_LEVELS, type SignoffLevel } from "./signoff.ts";
import { ENVIRONMENTS } from "../types.ts";
import { pickTeam } from "./pods.ts";
import { findRepoById } from "../../controllers/repos.controller.ts";
import { cleanDay, type PullRecord, type Repo } from "./types.ts";

export type PullQuery = { repoId?: string; on?: string; riskOnly?: boolean };

export async function listPulls(q: PullQuery = {}): Promise<PullRecord[]> {
  const store = getStore();
  await store.init();

  const all = await store.pulls.all();
  const matched = all.filter((pr) => {
    if (q.repoId && pr.repoId !== q.repoId) return false;
    // `on` is a prefix: a year, a month and a day are the same filter.
    if (q.on && !inPeriod(pr.mergedOn, q.on)) return false;
    return true;
  });

  return inReportOrder(await reconcileMoved(matched));
}

/**
 * Correct "already on a scope sheet" from the sheets themselves, and store the
 * correction.
 *
 * The flag drifted: a row removed by an older build left it saying "moved"
 * with no row anywhere, and the pull request then belonged to no screen at all.
 *
 * The write-back is the part that matters. Deriving it for the report alone
 * fixed what the reader saw and left the stored value wrong, so the button
 * offered a move that the API — which reads the record, not the report —
 * refused as "already on the sheet". Correcting the record means every path
 * gets the same answer, which was the whole point of one shared rule.
 *
 * Only rows whose answer actually changed are written. `movedPulls` hands back
 * the very same object when it has nothing to correct, so this is a reference
 * check rather than a diff.
 */
export async function reconcileMoved(pulls: PullRecord[]): Promise<PullRecord[]> {
  const store = getStore();
  await store.init();

  const rows = await store.deployments.all();
  const fixed = movedPulls(pulls, rows);

  for (const [i, pr] of fixed.entries()) if (pr !== pulls[i]) await store.pulls.save(pr);
  return fixed;
}

/** One pull request, with that same correction applied. */
export async function findPullOnSheets(id: string): Promise<PullRecord | null> {
  const store = getStore();
  await store.init();
  if (typeof id !== "string" || !id) return null;

  const pr = await store.pulls.byId(id);
  return pr ? (await reconcileMoved([pr]))[0] : null;
}

/** Read a repo's merged PRs from GitHub and store them, keeping our sign-offs. */
export async function syncPulls(repo: Repo, now = Date.now(), branch?: string) {
  // How far back one sync reaches is an operator's decision, not a product one:
  // a first import wants more pages than a nightly top-up. See
  // DEVOPS_SYNC_PAGES in `.env.devopsdashboard`.
  const outcome = await readMergedPulls(repo, now, devopsConfig().syncPages, branch);
  if (!outcome.ok) return { ...outcome, stored: 0 };

  const store = getStore();
  await store.init();

  let stored = 0;
  for (const fresh of outcome.rows) {
    const existing = await store.pulls.byId(fresh.id);
    await store.pulls.save(mergePull(fresh, existing));
    stored++;
  }

  return { ...outcome, stored };
}

/**
 * Record or withdraw a sign-off.
 *
 * The signature carries who and when, because that is the entire value of the
 * record. A tick with no name attached tells a later reader nothing about who
 * to ask.
 */
export async function signOff(
  id: string,
  level: string,
  on: boolean,
  by: string,
  now = Date.now(),
): Promise<PullRecord> {
  if (!(SIGNOFF_LEVELS as readonly string[]).includes(level)) {
    throw new HttpError(400, `"${level}" is not a sign-off level.`);
  }

  const store = getStore();
  await store.init();

  const pr = await store.pulls.byId(id);
  if (!pr) throw new HttpError(404, "No such pull request on this board.");

  return store.pulls.save({
    ...pr,
    signoffs: setSignoff(pr.signoffs, level as SignoffLevel, on, by, new Date(now).toISOString()),
  });
}

/**
 * Note where and when a merged change actually landed.
 *
 * Only the fields a person can know better than GitHub can: the deploy date,
 * the environment, and a ticket the title got wrong. Everything else is read
 * from GitHub and would be overwritten by the next sync anyway.
 */
export async function annotate(id: string, patch: Partial<PullRecord>): Promise<PullRecord> {
  const store = getStore();
  await store.init();

  const pr = await store.pulls.byId(id);
  if (!pr) throw new HttpError(404, "No such pull request on this board.");

  /*
   * The POD has to be one the repository actually has, for the same reason a
   * scope row's does: a wrong team reads as an answer and is wrong.
   */
  const repo = await findRepoById(pr.repoId);

  return store.pulls.save({
    ...pr,
    teamId: "teamId" in patch ? pickTeam(patch.teamId, repo?.teamIds) : pr.teamId,
    deployedOn: "deployedOn" in patch ? cleanDay(patch.deployedOn) : pr.deployedOn,
    environment:
      "environment" in patch
        ? oneOfEnvironment(patch.environment) ?? pr.environment
        : pr.environment,
    ticket: "ticket" in patch ? String(patch.ticket ?? "").trim().slice(0, 60) : pr.ticket,
    cycleId: "cycleId" in patch ? String(patch.cycleId ?? "").trim().slice(0, 120) : pr.cycleId,
  });
}

/** An environment from the shared vocabulary, or null when it is not one. */
const oneOfEnvironment = (value: unknown): string | null => {
  const raw = String(value ?? "");
  if (raw === "") return "";
  return (ENVIRONMENTS as readonly string[]).includes(raw) ? raw : null;
};
