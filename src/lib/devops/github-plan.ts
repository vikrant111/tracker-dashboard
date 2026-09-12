/**
 * What freezing a branch actually asks GitHub to do.
 *
 * Kept separate from the code that sends it, and pure, because this is the part
 * that has to be right: a wrong path or a wrong body either fails loudly or —
 * far worse — succeeds at something nobody asked for. A plan can be checked,
 * printed, and shown to an admin before anything is sent.
 *
 * GitHub offers two mechanisms and organisations differ on which they allow, so
 * the repo says which to use:
 *
 *  - `ruleset`    a branch ruleset whose rules refuse `update`, `deletion` and
 *                 `creation`, with nobody allowed to bypass. Unfreezing deletes
 *                 the ruleset again.
 *  - `protection` classic branch protection with `lock_branch: true`, which
 *                 marks the branch read-only. Unfreezing removes protection.
 *  - `record`     nothing is sent. The board notes the freeze so people can see
 *                 it; the branch itself is untouched.
 *
 * Nothing here performs I/O or reads a token, so the checks exercise the real
 * request shapes without a network or a repository.
 */
import type { Repo } from "./types.ts";

/** One HTTP request, as it would be sent. */
export type Call = {
  method: "GET" | "POST" | "PUT" | "DELETE";
  /** Path relative to the API root, already escaped. */
  path: string;
  body?: unknown;
  /** What this call is for, in a sentence an admin can read. */
  why: string;
};

/** The name of the ruleset this app owns. */
export const RULESET_NAME = "pod-tracker-freeze";

const seg = (value: string) => encodeURIComponent(value);

/**
 * The ruleset that refuses every write to a branch.
 *
 * `bypass_actors` is deliberately empty: a freeze that repository admins can
 * push through is not a freeze, and the people most likely to push to a frozen
 * develop are exactly the people with admin.
 */
export function freezeRuleset(branch: string) {
  return {
    name: RULESET_NAME,
    target: "branch",
    enforcement: "active",
    bypass_actors: [],
    conditions: { ref_name: { include: [`refs/heads/${branch}`], exclude: [] } },
    // `update` refuses pushes, `deletion` refuses removing the branch, and
    // `creation` stops it being deleted and recreated to dodge the other two.
    rules: [{ type: "update" }, { type: "deletion" }, { type: "creation" }],
  };
}

/**
 * Classic branch protection, locked.
 *
 * Every field is required by the endpoint even when it is null — omitting one
 * is a 422, not a default. `lock_branch` is the part that makes the branch
 * read-only; the nulls say "change nothing else about how this branch is
 * protected", which matters on a repo that already has rules.
 */
export function freezeProtection() {
  return {
    required_status_checks: null,
    enforce_admins: true,
    required_pull_request_reviews: null,
    restrictions: null,
    lock_branch: true,
  };
}

/**
 * The calls that freeze, or unfreeze, this repo's develop branch.
 *
 * `rulesetId` is the id of a ruleset this app created earlier, which unfreezing
 * needs in order to delete the right one. Absent on a freeze, and absent on an
 * unfreeze that has nothing recorded — in which case the plan looks the ruleset
 * up first rather than guessing.
 */
export function planFreeze(
  repo: Pick<Repo, "owner" | "repo" | "developBranch" | "freezeMethod">,
  freeze: boolean,
  rulesetId?: string,
): Call[] {
  const base = `/repos/${seg(repo.owner)}/${seg(repo.repo)}`;
  const branch = repo.developBranch;

  if (repo.freezeMethod === "record") return [];

  if (repo.freezeMethod === "protection") {
    return freeze
      ? [
          {
            method: "PUT",
            path: `${base}/branches/${seg(branch)}/protection`,
            body: freezeProtection(),
            why: `Lock ${branch} so pushes and merges are refused.`,
          },
        ]
      : [
          {
            method: "DELETE",
            path: `${base}/branches/${seg(branch)}/protection`,
            why: `Remove the protection that was locking ${branch}.`,
          },
        ];
  }

  /* ruleset */
  if (freeze) {
    return [
      {
        method: "POST",
        path: `${base}/rulesets`,
        body: freezeRuleset(branch),
        why: `Add a ruleset refusing every write to ${branch}.`,
      },
    ];
  }

  /*
   * Unfreezing needs the id of the ruleset to delete. When the board has one
   * recorded it goes straight there; when it does not — the row predates the
   * feature, or somebody removed it by hand — the ruleset is looked up by name
   * first. Deleting by guess would remove somebody else's rules.
   */
  if (rulesetId) {
    return [
      {
        method: "DELETE",
        path: `${base}/rulesets/${seg(rulesetId)}`,
        why: `Remove the freeze ruleset, letting ${branch} accept writes again.`,
      },
    ];
  }

  return [
    {
      method: "GET",
      path: `${base}/rulesets`,
      why: `Find the freeze ruleset on ${branch}, because its id was not recorded.`,
    },
  ];
}

/**
 * The merged pull requests on a branch, newest first.
 *
 * `state=closed` and then a merge check, because GitHub has no "merged" filter:
 * a closed PR may have been merged or simply abandoned, and only `merged_at`
 * tells them apart. Reading them all and filtering here is the only way.
 */
export function planMergedPulls(
  repo: Pick<Repo, "owner" | "repo">,
  base: string,
  page = 1,
  perPage = 100,
): Call {
  const query = new URLSearchParams({
    state: "closed",
    base,
    sort: "updated",
    direction: "desc",
    per_page: String(Math.min(100, Math.max(1, perPage))),
    page: String(Math.max(1, page)),
  });

  return {
    method: "GET",
    path: `/repos/${seg(repo.owner)}/${seg(repo.repo)}/pulls?${query}`,
    why: `List pull requests closed against ${base}, to find the merged ones.`,
  };
}

/**
 * A plan as a person would read it.
 *
 * What the dry run prints and what the confirmation shows, so an admin can see
 * the exact request before anyone agrees to send it.
 */
export const describePlan = (calls: Call[]): string =>
  calls.length === 0
    ? "Nothing is sent to GitHub. The board records the change only."
    : calls.map((c) => `${c.method} ${c.path} — ${c.why}`).join("\n");
