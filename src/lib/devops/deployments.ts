/**
 * What a deployment record is, before it is stored.
 *
 * The row somebody fills in before a deploy and reads afterwards. Most of the
 * rules here exist because this sheet is read weeks later by people who were
 * not in the room: a row with no title, or a date nobody can group by, is a row
 * that quietly stops counting.
 */
import { HttpError } from "../http-error.ts";
import { canEditRecords, refuseEdit, type EditorSubject } from "./editors.ts";
import { LIMITS } from "../constants.ts";
import { ENVIRONMENTS } from "../types.ts";
import {
  findAllDeployments,
  findDeploymentById,
  saveDeploymentDoc,
} from "../../controllers/deployments.controller.ts";
import { findRepoById } from "../../controllers/repos.controller.ts";
import { findCycleById } from "../../controllers/cycles.controller.ts";
import { refuseIfScopeFrozen } from "./cycles.ts";
import { inPeriod } from "./period.ts";
import { pickTeam } from "./pods.ts";
import { idForRow } from "./scope-link.ts";
import { getStore } from "../../db/store/index.ts";
import {
  DEPLOY_KINDS,
  DEPLOY_STATES,
  cleanBranch,
  cleanDay,
  deploymentId,
  type DeployKind,
  type DeployState,
  type Deployment,
} from "./types.ts";

const oneOf = <T extends string>(list: readonly T[], value: unknown, fallback: T): T =>
  (list as readonly string[]).includes(String(value)) ? (value as T) : fallback;

/** Newest first, by the day it went out, then by when the row was made. */
export const inSheetOrder = (rows: Deployment[]): Deployment[] =>
  [...rows].sort(
    (a, b) =>
      // A row with no date yet is not yet deployed, so it belongs at the top
      // with the things still to come rather than buried at the bottom.
      (b.deployedOn || "9999-99-99").localeCompare(a.deployedOn || "9999-99-99") ||
      b.createdAt.localeCompare(a.createdAt),
  );

export type DeploymentQuery = {
  repoId?: string;
  cycleId?: string;
  environment?: string;
  branch?: string;
  /** A `YYYY`, `YYYY-MM` or `YYYY-MM-DD` prefix. */
  on?: string;
};

/**
 * The rows matching a query.
 *
 * `on` is a **prefix or a range**, which is the whole reason dates are stored
 * as `YYYY-MM-DD` strings: a year, a month, a day and a span are all the same
 * filter, and none of them needs date maths or a timezone.
 */
export async function listDeployments(q: DeploymentQuery = {}): Promise<Deployment[]> {
  const all = await healScopeLinks(await findAllDeployments());

  const matched = all.filter((row) => {
    if (q.repoId && row.repoId !== q.repoId) return false;
    if (q.cycleId && row.cycleId !== q.cycleId) return false;
    if (q.environment && row.environment !== q.environment) return false;
    if (q.branch && row.branch !== q.branch) return false;
    /*
     * `inPeriod`, not `startsWith`. The raw prefix test was wrong twice over:
     * `on=2026-0` matched `2026-09-15`, because a prefix has to end on a
     * boundary and a bare `startsWith` does not know that; and a `from..to`
     * range matched nothing at all, silently, so a filtered download came back
     * empty with no explanation. The sign-off report already asked the shared
     * rule — this is the same question and now gets the same answer.
     */
    if (q.on && !inPeriod(row.deployedOn, q.on)) return false;
    return true;
  });

  return inSheetOrder(matched);
}

/**
 * Fill in the link back to the pull request on rows that were written without
 * one, and store it.
 *
 * Rows moved onto a sheet by an older build carry the PR's URL and nothing
 * else. Without the id, removing one deleted it and the pull request never
 * came back to the sign-off report — which is exactly the failure this exists
 * to stop. Done once, on the read the sheet already performs, so a board that
 * has been open since before the fix repairs itself rather than waiting for
 * somebody to notice.
 *
 * A URL matching nothing on the report is left alone: somebody typed it into
 * the form by hand, and that is not a move.
 */
async function healScopeLinks(rows: Deployment[]): Promise<Deployment[]> {
  const stale = rows.filter((row) => !row.pullId && row.prUrl);
  if (!stale.length) return rows;

  const store = getStore();
  await store.init();
  const pulls = await store.pulls.all();

  const filled = new Map<string, string>();
  for (const row of stale) {
    const id = idForRow(row, pulls);
    if (id) filled.set(row.id, id);
  }
  if (!filled.size) return rows;

  const healed = rows.map((row) => (filled.has(row.id) ? { ...row, pullId: filled.get(row.id)! } : row));
  for (const row of healed) if (filled.has(row.id)) await store.deployments.save(row);
  return healed;
}

/**
 * Add or edit a row.
 *
 * Refuses while the repository's scoresheet is closed — including for the admin
 * who closed it. The record for a release is either final or it is not, and an
 * exception for one person would make "final" mean nothing.
 */
export async function saveDeployment(
  input: Partial<Deployment>,
  author: string,
  editor: EditorSubject,
  now = Date.now(),
): Promise<Deployment> {
  const repoId = String(input.repoId ?? "").trim();
  const repo = await findRepoById(repoId);
  if (!repo) throw new HttpError(400, "Pick the repository this is going out on.");

  const cycleId = String(input.cycleId ?? "").trim();
  const cycle = await findCycleById(cycleId);
  if (!cycle) throw new HttpError(400, "Pick the deployment cycle this is in scope for.");
  if (cycle.repoId !== repoId) throw new HttpError(400, `${cycle.name} is not a cycle of that repository.`);

  /*
   * Frozen scope refuses the write, for everyone including the admin who froze
   * it. The scope of a release is either agreed or it is not, and an exception
   * for one person would make "agreed" mean nothing.
   */
  const shut = refuseIfScopeFrozen(cycle);
  if (shut) throw new HttpError(409, shut);

  const title = String(input.title ?? "").trim().slice(0, LIMITS.itemTitle);
  if (!title) throw new HttpError(400, "Give the row a title. It is what the sheet is read by.");

  const existing = input.id ? await findDeploymentById(String(input.id)) : null;

  /*
   * Adding is open to everyone; changing a row that already exists is not.
   * The person who shipped a change is the one who knows what it was, so the
   * sheet has to be fillable by anyone — but once written it is evidence, and
   * a quiet correction by whoever is passing is how evidence stops counting.
   */
  if (existing && !canEditRecords(editor)) throw new HttpError(403, refuseEdit());
  const at = new Date(now).toISOString();

  return saveDeploymentDoc({
    id: existing?.id ?? deploymentId(repoId, now),
    repoId,
    /*
     * Has to be one of the repo's PODs. A row filed against a team that does
     * not work on the repository is worse than a blank one: it reads as an
     * answer and is wrong. Anything else falls back to the repo's only POD when
     * there is exactly one, because then there is nothing to choose.
     */
    teamId: pickTeam(input.teamId ?? existing?.teamId, repo.teamIds),
    cycleId,
    branch: cleanBranch(input.branch ?? existing?.branch ?? cycle.releaseBranch, cycle.releaseBranch),
    environment: oneOf(ENVIRONMENTS, input.environment ?? existing?.environment, "Unknown"),
    kind: oneOf<DeployKind>(DEPLOY_KINDS, input.kind ?? existing?.kind, "bug"),
    state: oneOf<DeployState>(DEPLOY_STATES, input.state ?? existing?.state, "planned"),
    ticket: String(input.ticket ?? existing?.ticket ?? "").trim().slice(0, 60),
    title,
    prUrl: String(input.prUrl ?? existing?.prUrl ?? "").trim().slice(0, LIMITS.repoUrl),
    pullId: String(input.pullId ?? existing?.pullId ?? "").trim().slice(0, 120),
    // The original filler keeps the byline; an edit does not steal it.
    author: existing?.author || author,
    notes: String(input.notes ?? existing?.notes ?? "").trim().slice(0, LIMITS.teamDescription * 4),
    deployedOn: cleanDay(input.deployedOn ?? existing?.deployedOn),
    createdAt: existing?.createdAt ?? at,
    updatedAt: at,
  });
}
