/**
 * The sign-off report: one row per pull request that reached a release branch.
 *
 * The columns the board was asked for, in the order they were asked for:
 * project, repo, PR link, sign-off status, merged date, release branch,
 * deployed on. Defined once so the table and the download cannot drift.
 *
 * Pure. The caller resolves names and joins the deploy date; this decides what
 * a row says.
 */
import { describeSignoff, signoffState } from "./signoff.ts";
import type { PullRecord } from "./records.ts";

export const REPORT_COLUMNS = [
  { header: "Project", field: "project", width: 20 },
  { header: "Repo", field: "repo", width: 22 },
  { header: "PR", field: "number", width: 8 },
  /*
   * The title, which the file did not carry at all. Every row was a bare URL,
   * so a report mailed to somebody could not be read without opening each
   * link — which defeats the point of sending a file.
   */
  { header: "Title", field: "title", width: 52 },
  { header: "Opened by", field: "author", width: 18 },
  { header: "Ticket", field: "ticket", width: 14 },
  { header: "Cycle", field: "cycle", width: 14 },
  { header: "PR link", field: "pr", width: 46 },
  { header: "Sign-off status", field: "signoff", width: 42 },
  /*
   * Who signed and when, per level. The prose status says *what* is missing;
   * these say who to go back to, which is what a record is for.
   */
  { header: "Business sign-off", field: "biz", width: 30 },
  { header: "QA sign-off", field: "qa", width: 30 },
  { header: "POD verification", field: "pod", width: 30 },
  { header: "Merged date", field: "mergedOn", width: 14 },
  { header: "Release branch", field: "branch", width: 20 },
  { header: "Deployed on", field: "deployedOn", width: 14 },
  { header: "Deployed to", field: "environment", width: 14 },
  { header: "Risk", field: "risk", width: 34 },
] as const;

/** One signature as "who · when", or blank. */
const signature = (sig: { by?: string; at?: string } | undefined): string =>
  sig?.by ? `${sig.by}${sig.at ? ` · ${String(sig.at).slice(0, 10)}` : ""}` : "";

export type ReportRow = Record<string, string>;

/**
 * One row of the report.
 *
 * `project` is the POD that owns the repo, when the repo is linked to one — the
 * report is read by people who think in teams, not in repository slugs.
 */
export function toReportRow(
  pr: PullRecord,
  names: { project?: string; repo?: string; cycle?: string },
): ReportRow {
  const merged = Boolean(pr.mergedAt);
  const state = signoffState(pr.signoffs, merged);

  return {
    project: names.project ?? "",
    repo: names.repo ?? pr.repoId,
    number: String(pr.number ?? ""),
    title: pr.title,
    author: pr.author,
    ticket: pr.ticket,
    cycle: names.cycle ?? pr.cycleId,
    pr: pr.url || `#${pr.number}`,
    biz: signature(pr.signoffs?.biz),
    qa: signature(pr.signoffs?.qa),
    pod: signature(pr.signoffs?.pod),
    signoff: describeSignoff(pr.signoffs, merged),
    mergedOn: pr.mergedOn,
    branch: pr.baseBranch,
    deployedOn: pr.deployedOn,
    environment: pr.environment,
    /*
     * Spelled out rather than left as a flag. This column is the reason the
     * report exists, and a reader scanning a spreadsheet should not have to
     * know that an empty cell is the good case.
     */
    risk: state.risk ? `Merged without ${state.missing.filter((l) => l !== "pod").join(" and ")} sign-off` : "",
  };
}

/**
 * Risky rows first, then newest merged.
 *
 * The whole point of the report is the changes that reached a release branch
 * without agreement. Sorting them to the top means nobody has to go looking.
 */
export function inReportOrder(rows: PullRecord[]): PullRecord[] {
  return [...rows].sort((a, b) => {
    const ra = signoffState(a.signoffs, Boolean(a.mergedAt)).risk ? 0 : 1;
    const rb = signoffState(b.signoffs, Boolean(b.mergedAt)).risk ? 0 : 1;
    return ra - rb || (b.mergedOn || "").localeCompare(a.mergedOn || "");
  });
}

/** How many rows are risky, for the headline the board opens with. */
export const countRisky = (rows: PullRecord[]): number =>
  rows.filter((pr) => signoffState(pr.signoffs, Boolean(pr.mergedAt)).risk).length;
