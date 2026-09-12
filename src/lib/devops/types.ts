/**
 * What the DevOps board is made of.
 *
 * Kept beside the POD dashboard's `lib/types.ts` rather than inside it: the two
 * boards share a shell, a theme and a login, and nothing else. A repo has no
 * opinion about a bug's severity.
 *
 * Client-safe and pure — the admin form and the checks both import this.
 */

/** A branch that is locked, open, or somewhere in between. */
export const FREEZE_STATES = ["open", "frozen", "pending", "failed"] as const;
export type FreezeState = (typeof FREEZE_STATES)[number];

/**
 * How a freeze is enforced.
 *
 * GitHub offers two mechanisms and organisations differ on which they allow:
 *
 *  - `ruleset`  a repository ruleset with `lock_branch`. The modern API, and
 *               the only one that locks a branch outright.
 *  - `protection` classic branch protection with the push allow-list emptied.
 *               Older, still enabled on plenty of enterprise repos.
 *  - `record`   no GitHub call at all. The board records that a branch is
 *               frozen so people can see it; nothing is enforced.
 *
 * Per repo, because one organisation can have both kinds of repo.
 */
export const FREEZE_METHODS = ["ruleset", "protection", "record"] as const;
export type FreezeMethod = (typeof FREEZE_METHODS)[number];

/** A GitHub repository an admin has onboarded. */
export type Repo = {
  /** Slug of `owner/name`, e.g. `acme-3in1cms`. Stable across renames. */
  id: string;
  /** Display name, e.g. `3in1cms`. */
  name: string;
  /** GitHub owner or organisation. */
  owner: string;
  /** The repository name on GitHub, which may differ from the display name. */
  repo: string;
  /** Full https URL. Derived from owner/repo when left blank. */
  url: string;
  /** The branch releases are cut from, e.g. `release`. */
  releaseBranch: string;
  /** The branch people work on and that gets frozen, e.g. `develop`. */
  developBranch: string;
  /**
   * The PODs that own this repo.
   *
   * Plural because one repository is routinely worked on by several teams — a
   * shared web app, a platform service — and a single owner forced somebody to
   * pick one and be wrong about the rest.
   */
  teamIds: string[];
  /**
   * A fine-grained token with admin rights on this repo.
   *
   * Redacted by `/api/repos` before it is serialised, exactly as the Azure PAT
   * is: a value arriving back masked means "keep the stored one", so the secret
   * never round-trips through a browser. Blank falls back to `GITHUB_TOKEN`.
   */
  token: string;
  /** How a freeze is applied on this repo. */
  freezeMethod: FreezeMethod;
  /** Where the develop branch currently stands. */
  freeze: {
    state: FreezeState;
    /** ISO, when the state last changed. */
    changedAt: string;
    /** Who changed it. */
    changedBy: string;
    /** Why, in their words. Shown to everyone the freeze affects. */
    reason: string;
    /** The last thing GitHub said, kept for the failed case. */
    detail: string;
    /**
     * The ruleset this app created, so unfreezing deletes that one and not
     * somebody else's. Absent on the other methods, and on a row that predates
     * the freeze — in which case the unfreeze looks it up by name instead.
     */
    rulesetId: string;
  };
  createdAt: string;
};

/** A blank repo, for the admin form. */
export const blankRepo = (): Repo => ({
  id: "",
  name: "",
  owner: "",
  repo: "",
  url: "",
  releaseBranch: "release",
  developBranch: "develop",
  teamIds: [],
  token: "",
  freezeMethod: "ruleset",
  freeze: { state: "open", changedAt: "", changedBy: "", reason: "", detail: "", rulesetId: "" },
  createdAt: "",
});

/**
 * `owner/repo` from a GitHub URL, or null.
 *
 * Onboarding is a form somebody pastes a URL into, so this accepts what people
 * actually paste: the browser URL, the clone URL, with or without `.git`, with
 * or without a trailing slash or a `/tree/main` suffix.
 */
export function parseRepoUrl(input: unknown): { owner: string; repo: string } | null {
  const raw = String(input ?? "").trim();
  if (!raw) return null;

  // `git@github.com:owner/repo.git` alongside the https forms.
  const ssh = raw.match(/^git@[^:]+:([^/]+)\/([^/]+?)(?:\.git)?\/?$/i);
  if (ssh) return { owner: ssh[1], repo: ssh[2] };

  const https = raw.match(/^(?:https?:\/\/)?[^/]*github[^/]*\/([^/]+)\/([^/?#]+?)(?:\.git)?(?:[/?#].*)?$/i);
  if (https) return { owner: https[1], repo: https[2] };

  // Bare `owner/repo`, which is what people type when they know the shape.
  const bare = raw.match(/^([\w.-]+)\/([\w.-]+?)(?:\.git)?$/);
  if (bare) return { owner: bare[1], repo: bare[2] };

  return null;
}

/**
 * The id for a repo: `owner-repo`, lowercased and punctuation-folded.
 *
 * Deterministic so re-onboarding the same repository updates it rather than
 * creating a second row, the same rule the POD slug follows.
 */
export function repoId(owner: unknown, repo: unknown): string {
  const clean = (v: unknown) =>
    String(v ?? "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");

  const o = clean(owner);
  const r = clean(repo);
  if (!o || !r) return "";
  return `${o}-${r}`.slice(0, 80);
}

/** The https URL for a repo, when the admin did not paste one. */
export const repoUrlFor = (owner: string, repo: string) =>
  owner && repo ? `https://github.com/${owner}/${repo}` : "";

export * from "./branch.ts";
export * from "./records.ts";
