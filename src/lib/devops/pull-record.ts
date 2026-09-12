/**
 * Pull requests that reached a release branch.
 *
 * Split from `records.ts`, which covers cycles and scope rows. Re-exported from
 * there so every import site is unchanged.
 *
 * Client-safe and pure.
 */
import type { Signoffs } from "./signoff.ts";

/**
 * A pull request that reached a release branch.
 *
 * Read from GitHub, then annotated here: the sign-offs are ours, GitHub knows
 * nothing about who in the business agreed a change should ship.
 *
 * `mergedOn` duplicates the day part of `mergedAt` on purpose. Every filter and
 * every deletion on this board works on a `YYYY-MM-DD` prefix, so storing the
 * day as its own string makes a year, a month and a day the same query.
 */
export type PullRecord = {
  /** `${repoId}-${number}`, so a re-sync updates rather than duplicates. */
  id: string;
  repoId: string;
  /**
   * The POD this change belongs to.
   *
   * One of the repo's, chosen on the row. A repository worked on by several
   * teams otherwise put "AMC POD, Payments POD" against every pull request,
   * which tells nobody whose change it was — the same problem the scope sheet
   * had, on the other table.
   */
  teamId: string;
  /** The cycle this landed in, when one matches. Blank when it does not. */
  cycleId: string;
  number: number;
  title: string;
  url: string;
  /** The GitHub login that opened it. */
  author: string;
  /** The branch it merged into — the release branch, for the rows that matter. */
  baseBranch: string;
  /** ISO, from GitHub. Blank when the PR is still open. */
  mergedAt: string;
  /** `YYYY-MM-DD` of `mergedAt`, for prefix filtering. */
  mergedOn: string;
  /** Filled from the scope sheet, or by hand. `YYYY-MM-DD`. */
  deployedOn: string;
  /**
   * Where this change has actually reached.
   *
   * Merged is not deployed, and deployed to UAT is not deployed to production.
   * The report was showing a date with no environment beside it, which answers
   * "when" while leaving "where" — the question somebody chasing a release
   * actually has — unanswered.
   */
  environment: string;
  /** The work item this claims to fix, when the title or branch names one. */
  ticket: string;
  /** Ours, not GitHub's: who agreed this should ship. */
  signoffs: Signoffs;
  /**
   * Whether this has already been put on a scope sheet.
   *
   * Stops the same change being added twice — a sheet with one row per PR is a
   * record; a sheet with three of the same is an argument.
   */
  movedToScope?: boolean;
  /**
   * Why it was taken back off the sheet, when it was.
   *
   * Written when somebody removes the scope row this became. It is the whole
   * point of requiring a remark: the person who moved it needs to know what to
   * fix before they move it again, or whether to pull the code out of the
   * release branch instead.
   */
  returned?: { at: string; by: string; remarks: string };
  /** When this row was last read from GitHub. */
  syncedAt: string;
};

/** The id for a PR row. Deterministic, so re-syncing updates one row. */
export const pullId = (repoId: unknown, number: unknown): string => {
  const repo = String(repoId ?? "").trim();
  const n = Number(number);
  if (!repo || !Number.isInteger(n) || n <= 0) return "";
  return `${repo}-${n}`;
};

/**
 * A work item id mentioned in a PR title or branch name.
 *
 * Teams write it as `[1234]`, `#1234`, `AB-1234` or just `1234 fix the thing`.
 * Guessing is better than nothing here: the id is only used to join the row to
 * a bug, and a wrong guess shows a blank rather than a wrong bug, because the
 * join looks the id up rather than trusting it.
 */
export function ticketFrom(...sources: unknown[]): string {
  for (const source of sources) {
    const text = String(source ?? "");
    const m =
      text.match(/[[(#]\s*([A-Z]{1,6}-\d{1,8}|\d{2,8})\s*[\])]?/i) ??
      text.match(/\b([A-Z]{1,6}-\d{1,8})\b/) ??
      text.match(/^\s*(\d{2,8})\b/);
    if (m?.[1]) return m[1].toUpperCase();
  }
  return "";
}
