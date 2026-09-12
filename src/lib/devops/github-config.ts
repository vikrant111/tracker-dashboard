/**
 * How this app is allowed to talk to GitHub, and what must never come back out.
 *
 * Separate from the code that sends anything so the rules can be checked
 * without a network: which mode we are in, which host, which token, and the
 * scrubbing that keeps a secret out of anything stored or rendered.
 *
 * Every value comes from `.env.devopsdashboard` — see `constants.ts` for the
 * names and `config.ts` for the loading. Nothing here hardcodes a host or a
 * default; those live beside the other product decisions.
 */
import { DEVOPS_DEFAULTS, DEVOPS_ENV_KEYS } from "./constants.ts";
/* Side effect: folds `.env.devopsdashboard` into `process.env` before the
   default parameters below read it. */
import { devopsEnv } from "./config.ts";

export const GITHUB_MODES = ["dry-run", "live"] as const;
export type GitHubMode = (typeof GITHUB_MODES)[number];

/**
 * Live only when asked for explicitly.
 *
 * Anything else — unset, blank, a typo, `true`, `yes` — is a dry run. The
 * failure mode of guessing wrong in this direction is a branch nobody meant to
 * lock, so the default is the one that cannot do that.
 */
export function githubMode(env: Record<string, string | undefined> = devopsEnv()): GitHubMode {
  return (env[DEVOPS_ENV_KEYS.githubMode] ?? "").trim().toLowerCase() === "live"
    ? "live"
    : (DEVOPS_DEFAULTS.githubMode as GitHubMode);
}

/** The API root. Overridable for GitHub Enterprise. */
export const githubApi = (env: Record<string, string | undefined> = devopsEnv()): string =>
  (env[DEVOPS_ENV_KEYS.githubApi] ?? "").trim().replace(/\/+$/, "") || DEVOPS_DEFAULTS.githubApi;

/**
 * The token for this repo: its own, else the environment's.
 *
 * Per repo because one organisation can need different rights on different
 * repositories, and one token with admin everywhere is a bigger blast radius
 * than the job needs.
 */
export const tokenFor = (
  repo: { token?: string } | null | undefined,
  env: Record<string, string | undefined> = devopsEnv(),
): string => (repo?.token || env[DEVOPS_ENV_KEYS.githubToken] || "").trim();

/**
 * Text with anything token-shaped taken out.
 *
 * Applied to every message before it is stored or shown. `freeze.detail` ends
 * up in a tooltip on a board members can read, and a 401 from GitHub can echo
 * back what was sent — a secret has no business travelling that path.
 *
 * Both halves matter: the exact token, because that is the one we know about,
 * and the shape, because a message can carry a token that came from somewhere
 * else entirely.
 */
export function scrub(text: unknown, token = ""): string {
  let out = String(text ?? "");
  if (token && token.length >= 8) out = out.split(token).join("«token»");
  return out.replace(/\b(gh[pousr]_[A-Za-z0-9]{16,}|github_pat_[A-Za-z0-9_]{20,})\b/g, "«token»");
}
