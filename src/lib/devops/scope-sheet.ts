/**
 * The scope sheet, as columns.
 *
 * One definition, used by the download and by the table on screen, so the file
 * somebody mails to a stakeholder has the same columns in the same order as the
 * board they were looking at.
 *
 * The last two columns are the join back to the tracker: the severity and
 * status a bug has **now**, not what somebody typed into the form three weeks
 * ago. That is the point of storing the work item id rather than a copy of its
 * details — as people update bugs on the POD board, this sheet follows.
 */
import type { Deployment } from "./types.ts";

export const SCOPE_COLUMNS = [
  { header: "Repository", field: "repo", width: 20 },
  { header: "Cycle", field: "cycle", width: 14 },
  { header: "POD", field: "pod", width: 20 },
  { header: "Kind", field: "kind", width: 10 },
  { header: "Ticket", field: "ticket", width: 14 },
  { header: "Title", field: "title", width: 52 },
  { header: "Branch", field: "branch", width: 20 },
  { header: "Environment", field: "environment", width: 14 },
  { header: "State", field: "state", width: 12 },
  { header: "PR", field: "prUrl", width: 40 },
  { header: "Deployed on", field: "deployedOn", width: 14 },
  { header: "Filled by", field: "author", width: 24 },
  { header: "Notes", field: "notes", width: 40 },
  { header: "Added on", field: "createdOn", width: 14 },
  { header: "Bug severity now", field: "liveSeverity", width: 16 },
  { header: "Bug status now", field: "liveStatus", width: 18 },
] as const;

/** What the tracker currently says about a ticket, keyed by work item id. */
export type LiveBug = { severity: string; status: string };

/**
 * One row of the sheet.
 *
 * Names are resolved by the caller, which has the repos and cycles to hand.
 * A row whose repo was renamed still shows the name it has now, and a row whose
 * ticket is not in the tracker leaves the live columns blank rather than
 * inventing a status for something that may not be a work item at all.
 */
export function toScopeRow(
  row: Deployment,
  names: { repo?: string; cycle?: string; pod?: string },
  live?: LiveBug,
): Record<string, string> {
  return {
    repo: names.repo ?? row.repoId,
    cycle: names.cycle ?? row.cycleId,
    // The POD the row is for. The board shows it, so the file has to: a sheet
    // mailed to somebody who cannot see the board is the whole point of the
    // download, and "whose work is this" is the first thing they ask.
    pod: names.pod ?? row.teamId,
    kind: row.kind,
    ticket: row.ticket,
    title: row.title,
    branch: row.branch,
    environment: row.environment,
    state: row.state,
    prUrl: row.prUrl,
    deployedOn: row.deployedOn,
    author: row.author,
    notes: row.notes,
    // When the row was filed, so a sheet read months later can be ordered by
    // when people actually recorded things rather than when they shipped.
    createdOn: String(row.createdAt ?? "").slice(0, 10),
    liveSeverity: live?.severity ?? "",
    liveStatus: live?.status ?? "",
  };
}

/**
 * Rows as CSV, for anyone without Excel.
 *
 * The columns are a parameter because two sheets use this — the scope sheet and
 * the sign-off report — and a second copy of the quoting rules is a second
 * chance to get them wrong.
 */
export function toCsv(
  rows: Record<string, string>[],
  columns: readonly { header: string; field: string }[] = SCOPE_COLUMNS,
): string {
  const quote = (v: unknown) => {
    const s = String(v ?? "");
    // Quote when it would otherwise break the row, and double any quote inside.
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };

  const head = columns.map((c) => quote(c.header)).join(",");
  const body = rows.map((r) => columns.map((c) => quote(r[c.field])).join(","));
  return [head, ...body].join("\r\n");
}
