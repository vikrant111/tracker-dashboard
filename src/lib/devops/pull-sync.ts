/**
 * Reading merged pull requests from GitHub.
 *
 * **`GITHUB_MODE` does not gate this.** That switch exists so deploying the app
 * cannot lock somebody's branch by accident; it guards *mutations*. Listing
 * pull requests changes nothing on GitHub, and a report that refused to read
 * until you turned live mode on would be a report nobody could use.
 *
 * What gates it is the token. No token, no read, and a sentence saying so.
 */
import { planMergedPulls } from "./github-plan.ts";
import { tokenFor } from "./github-config.ts";
import { send } from "./github-send.ts";
import { cleanBranch, pullId, ticketFrom, type PullRecord, type Repo } from "./types.ts";

/** What GitHub gives back for one pull request, of which we want a little. */
export type GitHubPull = {
  number?: number;
  title?: string;
  html_url?: string;
  merged_at?: string | null;
  user?: { login?: string };
  base?: { ref?: string };
  head?: { ref?: string };
};

/**
 * Was this pull request merged?
 *
 * Closed is not merged. GitHub has no "merged" filter, so a listing returns
 * abandoned PRs alongside shipped ones and only `merged_at` tells them apart —
 * an abandoned PR on the sign-off report is a change somebody has to
 * investigate that never happened.
 *
 * Pure and exported so that rule is checked, rather than living inside a
 * function that needs a network to reach.
 */
export const isMerged = (pr: GitHubPull | null | undefined): boolean =>
  typeof pr?.merged_at === "string" && pr.merged_at.length > 0;

/**
 * One GitHub pull request as a row of ours.
 *
 * Sign-offs start empty and are never taken from GitHub: it knows nothing about
 * who in the business agreed a change should ship, and inventing one would be
 * the worst thing this file could do.
 */
export function toPullRecord(pr: GitHubPull, repo: Pick<Repo, "id" | "releaseBranch">, at: string): PullRecord | null {
  const id = pullId(repo.id, pr?.number);
  if (!id) return null;

  return {
    id,
    repoId: repo.id,
    teamId: "",
    cycleId: "",
    number: Number(pr.number),
    title: String(pr.title ?? "").slice(0, 500),
    url: String(pr.html_url ?? ""),
    author: String(pr.user?.login ?? ""),
    baseBranch: String(pr.base?.ref ?? repo.releaseBranch),
    mergedAt: String(pr.merged_at ?? ""),
    mergedOn: String(pr.merged_at ?? "").slice(0, 10),
    deployedOn: "",
    environment: "",
    ticket: ticketFrom(pr.title, pr.head?.ref),
    signoffs: {},
    syncedAt: at,
  };
}

export type SyncOutcome = {
  ok: boolean;
  /** Rows ready to store. Empty on a failure. */
  rows: PullRecord[];
  /** One sentence, safe to show. Never contains a token. */
  detail: string;
};

/**
 * The merged pull requests on a repo's release branch.
 *
 * Paged until GitHub runs out or the cap is reached. The cap is there because
 * a long-lived repository has thousands of merged PRs and this report is about
 * the recent ones; `sort=updated&direction=desc` means the recent ones come
 * first, so a cap truncates the tail rather than a random slice.
 */
export async function readMergedPulls(
  repo: Repo,
  now = Date.now(),
  maxPages = 5,
  branch?: string,
): Promise<SyncOutcome> {
  const token = tokenFor(repo);
  if (!token) {
    return {
      ok: false,
      rows: [],
      detail: "No GitHub token. Add one to this repository, or set GITHUB_TOKEN, to read pull requests.",
    };
  }

  /*
   * The branch asked for, else the repo's release branch. Teams cut from more
   * than one — a hotfix branch, last quarter's release — and a report that
   * could only ever read one of them left the rest invisible.
   */
  const base = cleanBranch(branch ?? repo.releaseBranch, repo.releaseBranch);
  const rows: PullRecord[] = [];
  const at = new Date(now).toISOString();

  try {
    for (let page = 1; page <= maxPages; page++) {
      const body = await send(planMergedPulls(repo, base, page), token, repo);
      const list = Array.isArray(body) ? (body as GitHubPull[]) : [];
      if (list.length === 0) break;

      for (const pr of list) {
        if (!isMerged(pr)) continue;
        const row = toPullRecord(pr, repo, at);
        if (row) rows.push(row);
      }

      if (list.length < 100) break;
    }

    return { ok: true, rows, detail: `Read ${rows.length} merged pull request${rows.length === 1 ? "" : "s"} on ${base}.` };
  } catch (err) {
    return { ok: false, rows: [], detail: err instanceof Error ? err.message : "Could not read pull requests." };
  }
}

/**
 * A freshly read row, merged with what is already stored.
 *
 * GitHub owns the facts about the pull request; we own the sign-offs and the
 * deploy date. A re-sync that overwrote those would quietly erase the evidence
 * the report exists to keep — which is the one thing a sync must never do.
 */
export function mergePull(fresh: PullRecord, stored: PullRecord | null | undefined): PullRecord {
  if (!stored) return fresh;
  return {
    ...fresh,
    teamId: stored.teamId || fresh.teamId,
    // A re-sync must not let the same change be added to a sheet twice.
    movedToScope: stored.movedToScope === true,
    cycleId: stored.cycleId || fresh.cycleId,
    deployedOn: stored.deployedOn || fresh.deployedOn,
    environment: stored.environment || fresh.environment,
    signoffs: stored.signoffs ?? {},
    // A ticket somebody corrected by hand beats one guessed from a title.
    ticket: stored.ticket || fresh.ticket,
  };
}
