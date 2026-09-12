/**
 * Who may see the DevOps board.
 *
 * Admins always. Members depend on `DEVOPS_ACCESS`:
 *
 *     DEVOPS_ACCESS=members   everyone signed in            (default)
 *     DEVOPS_ACCESS=admins    admins only
 *
 * Configurable because the two things asked for pull in opposite directions:
 * members have to see whether develop is frozen and fill in the deployment
 * form, and the board is also described as an admin's tool. Rather than pick
 * one and be wrong for somebody, it is a switch — and it defaults to the
 * reading that lets members do the jobs the board exists for.
 *
 * The value itself is set in `.env.devopsdashboard`, like every other setting
 * this board has. The rule below stays pure — it takes the mode rather than
 * reading the environment — so it is checked without a session or a server.
 */
import { DEVOPS_DEFAULTS, DEVOPS_ENV_KEYS } from "./constants.ts";
/* Side effect: folds `.env.devopsdashboard` into `process.env` before the
   default parameter below reads it. */
import { devopsEnv } from "./config.ts";

export const DEVOPS_ACCESS_MODES = ["members", "admins"] as const;
export type DevOpsAccess = (typeof DEVOPS_ACCESS_MODES)[number];

/** The configured mode. Anything unrecognised falls back rather than throwing. */
export function devOpsAccess(env: Record<string, string | undefined> = devopsEnv()): DevOpsAccess {
  const raw = (env[DEVOPS_ENV_KEYS.access] ?? "").trim().toLowerCase();
  return (DEVOPS_ACCESS_MODES as readonly string[]).includes(raw)
    ? (raw as DevOpsAccess)
    : (DEVOPS_DEFAULTS.access as DevOpsAccess);
}

/**
 * May this person open the DevOps board?
 *
 * Takes the mode rather than reading the environment, so a check can exercise
 * both without setting a variable.
 */
export function canSeeDevOps(role: unknown, mode: DevOpsAccess = devOpsAccess()): boolean {
  if (role === "admin") return true;
  return mode === "members" && role === "member";
}

/**
 * May this person change something on it?
 *
 * Onboarding a repo, freezing a branch, freezing the scoresheet and deleting
 * records are all admin-only regardless of the mode above. Reading the board
 * and filling in a deployment record are not.
 */
export const canAdminDevOps = (role: unknown): boolean => role === "admin";
