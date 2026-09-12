/**
 * Freezing and unfreezing a branch. Server-only.
 *
 * **Dry run is the default.** `GITHUB_MODE=live` is what lets any of this reach
 * a real repository; until then a freeze records the intent, reports the exact
 * requests it would have sent, and changes nothing. The first time this code
 * touches a real branch should be a decision somebody made, not a side effect
 * of deploying it.
 *
 * The plan is pure and lives in `github-plan.ts`; the sending is in
 * `github-send.ts`. This file is the decision in between.
 */
import { describePlan, planFreeze, RULESET_NAME, type Call } from "./github-plan.ts";
import { githubMode, tokenFor } from "./github-config.ts";
import { send } from "./github-send.ts";
import { HttpError } from "../http-error.ts";
import { scrub } from "./github-config.ts";
import type { Repo } from "./types.ts";

export { GITHUB_MODES, githubApi, githubMode, scrub, tokenFor, type GitHubMode } from "./github-config.ts";

export type FreezeOutcome = {
  ok: boolean;
  /** True when nothing was sent. */
  dryRun: boolean;
  /** What was sent, or would have been. Shown to the admin either way. */
  calls: Call[];
  /** One sentence, safe to store and to show. Never contains a token. */
  detail: string;
  /** The ruleset this app created, so unfreezing can delete the right one. */
  rulesetId?: string;
};

/**
 * Freeze or unfreeze a repository's develop branch.
 *
 * Returns what happened rather than throwing on a refusal, so the caller can
 * record a failed attempt against the repo. An admin who clicked freeze and saw
 * nothing happen should find out why on the board, not in a server log.
 */
export async function applyFreeze(repo: Repo, freeze: boolean, storedRulesetId?: string): Promise<FreezeOutcome> {
  const calls = planFreeze(repo, freeze, storedRulesetId);

  // `record` sends nothing by design: the board is the whole mechanism.
  if (repo.freezeMethod === "record") {
    return { ok: true, dryRun: false, calls, detail: "Recorded on the board. Nothing was sent to GitHub." };
  }

  if (githubMode() === "dry-run") {
    return {
      ok: true,
      dryRun: true,
      calls,
      detail: `Dry run — nothing was sent. Set GITHUB_MODE=live to apply it.\n${describePlan(calls)}`,
    };
  }

  const token = tokenFor(repo);
  if (!token) {
    return {
      ok: false,
      dryRun: false,
      calls,
      detail: "No GitHub token. Add one to this repository, or set GITHUB_TOKEN.",
    };
  }

  try {
    let rulesetId = storedRulesetId;

    for (const call of calls) {
      const body = await send(call, token, repo);

      // Creating a ruleset returns the id that unfreezing will need.
      if (call.method === "POST" && call.path.endsWith("/rulesets")) {
        rulesetId = String((body as { id?: number | string })?.id ?? "") || undefined;
      }

      /*
       * Listing rulesets is how the id is found when it was never recorded —
       * a row that predates the feature, or a ruleset somebody replaced. The
       * delete is issued here rather than in the plan, which cannot know what
       * the list contained, and it matches by name so it cannot remove
       * somebody else's rules.
       */
      if (call.method === "GET" && call.path.endsWith("/rulesets")) {
        const found = (Array.isArray(body) ? body : []).find(
          (r: { name?: string }) => r?.name === RULESET_NAME,
        ) as { id?: number | string } | undefined;

        if (!found?.id) {
          return {
            ok: true,
            dryRun: false,
            calls,
            detail: "No freeze ruleset was found on GitHub, so there was nothing to remove.",
          };
        }

        await send(
          {
            method: "DELETE",
            path: `${call.path}/${encodeURIComponent(String(found.id))}`,
            why: "Remove the freeze ruleset found by name.",
          },
          token,
          repo,
        );
        rulesetId = undefined;
      }
    }

    return {
      ok: true,
      dryRun: false,
      calls,
      detail: freeze ? "Frozen on GitHub." : "Unfrozen on GitHub.",
      rulesetId: freeze ? rulesetId : undefined,
    };
  } catch (err) {
    return {
      ok: false,
      dryRun: false,
      calls,
      detail: err instanceof HttpError ? err.message : scrub(String(err), token),
    };
  }
}
