/**
 * Deployment cycles and the rows in their scope sheets.
 *
 * Split from `types.ts`, which had grown to cover repositories, freezing,
 * announcements and this. Re-exported from there so every import site is
 * unchanged and there is still one name to reach for.
 *
 * Client-safe and pure.
 */
import { DEVOPS_MESSAGES } from "./constants.ts";

/** Where a deployment record has got to. */
export const DEPLOY_STATES = ["planned", "deployed", "verified", "rolled-back"] as const;
export type DeployState = (typeof DEPLOY_STATES)[number];

/** What is being pushed. */
export const DEPLOY_KINDS = ["bug", "hotfix", "cr", "task"] as const;
export type DeployKind = (typeof DEPLOY_KINDS)[number];

/**
 * One thing going out: a bug, a hotfix, a CR.
 *
 * The row people fill in before a deploy and read afterwards, and the row the
 * scoresheet is built from. It answers the question the DevOps board exists
 * for — which bug is sitting on which branch, in which environment.
 *
 * `ticket` is deliberately just a string. It is the work item id when there is
 * one, which lets the board show that bug's *current* severity and status from
 * the tracker rather than whatever was true when the form was filled in; and it
 * is free text when the thing being pushed has no ticket, which happens and
 * should not be a reason to leave the row out.
 */
export type Deployment = {
  /** `${repoId}-${epochMillis}`, so rows sort by time within a repo. */
  id: string;
  repoId: string;
  /**
   * The POD this row belongs to.
   *
   * One of the repo's PODs, chosen when the row is filled in. A repository can
   * be worked on by several teams, so inheriting the whole list put "AMC POD,
   * Payments POD" on every row and answered nobody's question about whose work
   * it was. Blank on a repo linked to no POD, and on rows that predate this.
   */
  teamId: string;
  /** Which release this row is in scope for. */
  cycleId: string;
  /** The branch this is sitting on. */
  branch: string;
  /** Where it has reached. Same vocabulary as the POD board's environments. */
  environment: string;
  kind: DeployKind;
  state: DeployState;
  /** The work item id, when there is one. Links the row to the tracker. */
  ticket: string;
  title: string;
  /** The pull request, when there is one. */
  prUrl: string;
  /**
   * The pull request record this row was moved from, when it was.
   *
   * The id rather than the URL: removing the row has to find that pull request
   * again to hand it back, and matching on a URL somebody may have edited is a
   * link that quietly stops working.
   */
  pullId: string;
  /** Who filled the form in. */
  author: string;
  notes: string;
  /** When it went out, as `YYYY-MM-DD`. Blank until it has. */
  deployedOn: string;
  createdAt: string;
  updatedAt: string;
};

/** An id that sorts by time within a repo. `at` is passed in so this stays pure. */
export const deploymentId = (repoId: string, at: number): string =>
  `${String(repoId ?? "").trim()}-${String(at).padStart(14, "0")}`;

/**
 * A `YYYY-MM-DD` date, or "".
 *
 * The form gives an `<input type="date">` value, which is already this shape;
 * this is the guard for everything else that reaches the API. A date is what the
 * month/day/year filtering in stage 4 groups by, so a malformed one would put a
 * row in a bucket nobody can find again.
 */
export function cleanDay(value: unknown): string {
  const raw = String(value ?? "").trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return "";

  // Shape alone is not enough: 2026-02-31 matches the pattern and is not a day.
  const at = new Date(`${raw}T00:00:00Z`);
  return Number.isNaN(at.getTime()) || at.toISOString().slice(0, 10) !== raw ? "" : raw;
}

/**
 * One deployment cycle: a release going out of one repository.
 *
 * The thing a scope sheet belongs to. Scope is decided per cycle, not per
 * repository — "what is in 2026.09" is a different list from "what is in
 * 2026.10", and freezing the scope of one must not close the other.
 */
export type Cycle = {
  /** `${repoId}-${slugged name}`, so re-creating a cycle updates it. */
  id: string;
  repoId: string;
  /** What this cycle is called: `2026.09`, `Sprint 42`, `hotfix-3`. */
  name: string;
  /** The branch this cycle ships from. Defaults to the repo's release branch. */
  releaseBranch: string;
  /** When it is expected to go out, `YYYY-MM-DD`. Blank until decided. */
  plannedFor: string;
  /**
   * Whether the scope sheet is closed.
   *
   * Closing it stops rows being added, edited or removed for this cycle — for
   * everyone, including the admin who closed it. The scope of a release is
   * either agreed or it is not, and an exception for one person would make
   * "agreed" mean nothing.
   */
  scope: {
    frozen: boolean;
    changedAt: string;
    changedBy: string;
    reason: string;
  };
  createdAt: string;
  updatedAt: string;
};

/** The id for a cycle: the repo, then the name, slugged. */
export function cycleId(repoId: unknown, name: unknown): string {
  const repo = String(repoId ?? "").trim();
  const slug = String(name ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  if (!repo || !slug) return "";
  return `${repo}-${slug}`.slice(0, 120);
}

/** A blank cycle, for the admin form. */
export const blankCycle = (repoId = "", releaseBranch = "release"): Cycle => ({
  id: "",
  repoId,
  name: "",
  releaseBranch,
  plannedFor: "",
  scope: { frozen: false, changedAt: "", changedBy: "", reason: "" },
  createdAt: "",
  updatedAt: "",
});

/**
 * The sentence explaining why a cycle's sheet is closed, or null when it is open.
 *
 * Pure and shared, so the API refusal and the disabled form say the same thing.
 * Two wordings for one rule is how a form ends up claiming it is open while the
 * server refuses every row.
 *
 * It lives in this module rather than beside the cycle's save logic because the
 * form asks it too, and that module reaches the store — a client component
 * importing it pulled mongoose into the browser bundle.
 */
export function refuseIfScopeFrozen(cycle: Pick<Cycle, "name" | "scope"> | null | undefined): string | null {
  if (!cycle?.scope?.frozen) return null;
  return DEVOPS_MESSAGES.scopeFrozen(cycle.name, cycle.scope.reason ?? "");
}

/**
 * The same rule, worded for somebody holding a pull request.
 *
 * "The scope sheet for 2026.09 is frozen" is the right sentence under a form
 * and the wrong one under a **To sheet** button, where the reader's question is
 * whether *this pull request* can move. Same condition, same reason quoted —
 * only the subject of the sentence changes.
 */
export function refuseMoveIfScopeFrozen(
  cycle: Pick<Cycle, "name" | "scope"> | null | undefined,
): string | null {
  if (!cycle?.scope?.frozen) return null;
  return DEVOPS_MESSAGES.moveScopeFrozen(cycle.name, cycle.scope.reason ?? "");
}

export * from "./pull-record.ts";
