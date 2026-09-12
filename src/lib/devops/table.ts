/**
 * Filtering and paging a table, the same way in every section — and in every
 * download.
 *
 * Pure and shared, so the scope sheet, the sign-off report and the two export
 * routes behave identically. Two sections with their own idea of what "page 2"
 * means is the kind of difference nobody notices until they are comparing two
 * screens and one of them is lying; a download with its own idea of what the
 * filter matched is the same bug, mailed to a stakeholder.
 *
 * Client-safe: no store, no `process.env`.
 */
import { DEVOPS_TABLE } from "./constants.ts";
import type { Deployment, PullRecord } from "./types.ts";

/** Rows a section shows at once. Seven, so a section stays a glance. */
export const PAGE_SIZE = DEVOPS_TABLE.pageSize;

/**
 * A filter string, cleaned.
 *
 * Applied to anything arriving from a query string. An unbounded needle is an
 * unbounded scan over every row, triggered by whatever somebody puts in a URL.
 */
export const cleanQuery = (value: unknown): string =>
  String(value ?? "").slice(0, DEVOPS_TABLE.maxQuery).trim();

/**
 * Does this row match what somebody typed?
 *
 * Every word has to appear somewhere in the row, in any field and in any order.
 * People type "813 production" meaning *both*, not either — an any-word match
 * would answer that with every production row on the board.
 */
export function matchesQuery(fields: unknown[], query: string): boolean {
  const words = String(query ?? "").trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;

  const hay = (Array.isArray(fields) ? fields : []).map((f) => String(f ?? "").toLowerCase()).join(" ");
  return words.every((word) => hay.includes(word));
}

/* ------------------------------------------------------------ what is searched */

/*
 * The fields each table filters on, defined once.
 *
 * The board and the download have to search the same things or a filter that
 * found eleven rows on screen quietly writes nine into the file. Names are
 * resolved by the caller, which is the only part that differs: the browser has
 * them from props, the export route from the store.
 */

/** A scope row's searchable fields. `pod` is the resolved POD name. */
export const scopeRowFields = (row: Deployment, pod: string): unknown[] => [
  row.ticket,
  row.title,
  row.branch,
  row.environment,
  row.state,
  row.kind,
  row.author,
  row.deployedOn,
  pod,
];

/** A pull request's searchable fields. `repo` and `pod` are resolved names. */
export const pullRowFields = (pr: PullRecord, repo: string, pod: string): unknown[] => [
  pr.number,
  pr.title,
  pr.author,
  pr.baseBranch,
  pr.mergedOn,
  pr.deployedOn,
  pr.environment,
  pr.ticket,
  repo,
  pod,
];

/* ---------------------------------------------------------------------- paging */

export type Page<T> = {
  rows: T[];
  /** 1-based, and always within range. */
  page: number;
  pages: number;
  total: number;
  from: number;
  to: number;
};

/**
 * One page of rows.
 *
 * The page number is clamped rather than trusted. Filtering a list down while
 * sitting on page 4 would otherwise show an empty table and no way back —
 * which reads as "my data is gone", not "there is no page 4".
 */
export function paginate<T>(rows: T[], page: number, size = PAGE_SIZE): Page<T> {
  const all = Array.isArray(rows) ? rows : [];
  const per = Math.max(1, Math.floor(size) || PAGE_SIZE);

  const total = all.length;
  const pages = Math.max(1, Math.ceil(total / per));
  const at = Math.min(Math.max(1, Math.floor(page) || 1), pages);
  const from = (at - 1) * per;

  return {
    rows: all.slice(from, from + per),
    page: at,
    pages,
    total,
    // 1-based and inclusive, because this is shown to a person: "1–7 of 23".
    from: total === 0 ? 0 : from + 1,
    to: Math.min(from + per, total),
  };
}
