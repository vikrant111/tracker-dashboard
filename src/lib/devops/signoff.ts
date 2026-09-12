/**
 * Who has signed a pull request off, and what that means.
 *
 * The board's sharpest question lives here: **which changes reached the release
 * branch without the sign-offs they needed?** Everything else on the report is
 * context for that one column.
 *
 * Pure — no store, no network — so the rule is checked directly and the same
 * function answers for the screen, the export and the API.
 */
import { SIGNOFF_FILTERS, type SignoffFilter } from "./constants.ts";

export { SIGNOFF_FILTERS, SIGNOFF_FILTER_LABEL, type SignoffFilter } from "./constants.ts";

/** The sign-offs a change needs before it belongs on a release branch. */
export const SIGNOFF_LEVELS = ["biz", "qa", "pod"] as const;
export type SignoffLevel = (typeof SIGNOFF_LEVELS)[number];

export const SIGNOFF_LABEL: Record<SignoffLevel, string> = {
  biz: "Business",
  qa: "QA",
  pod: "POD verification",
};

/** One tick: who, and when. Absent means not signed off. */
export type Signature = { by: string; at: string };

export type Signoffs = Partial<Record<SignoffLevel, Signature>>;

/**
 * What a PR's sign-off state is.
 *
 * `risk` is the flag the report is sorted and coloured by: it is **merged**,
 * and it is **missing business or QA**. POD verification missing is worth
 * showing but is not the same problem — biz and QA are the two that mean
 * somebody outside the change agreed it should ship.
 */
export type SignoffState = {
  /** Every level signed. */
  complete: boolean;
  /** The levels with no signature, in the order they are asked for. */
  missing: SignoffLevel[];
  /** Merged to the release branch without business or QA. */
  risk: boolean;
  /** For sorting and for the column: "complete", "partial" or "none". */
  label: "complete" | "partial" | "none";
};

const signed = (s: Signoffs | undefined, level: SignoffLevel): boolean => Boolean(s?.[level]?.by);

export function signoffState(signoffs: Signoffs | undefined, merged: boolean): SignoffState {
  const missing = SIGNOFF_LEVELS.filter((l) => !signed(signoffs, l));
  const complete = missing.length === 0;

  return {
    complete,
    missing,
    /*
     * Only a merged PR can be a risk. An open one missing sign-offs is just a
     * PR waiting for review, which is the normal state of things and would
     * drown the real problem in noise.
     */
    risk: merged && (missing.includes("biz") || missing.includes("qa")),
    label: complete ? "complete" : missing.length === SIGNOFF_LEVELS.length ? "none" : "partial",
  };
}

/** The sign-off column, as it reads in the report and the download. */
export function describeSignoff(signoffs: Signoffs | undefined, merged: boolean): string {
  const state = signoffState(signoffs, merged);
  if (state.complete) return "All sign-offs";

  const have = SIGNOFF_LEVELS.filter((l) => signed(signoffs, l)).map((l) => SIGNOFF_LABEL[l]);
  const missing = state.missing.map((l) => SIGNOFF_LABEL[l]);

  // Names what is missing, not just how many. "2 of 3" makes somebody open the
  // row to find out which two, every time.
  return have.length ? `${have.join(" + ")} — missing ${missing.join(", ")}` : `Missing ${missing.join(", ")}`;
}

/**
 * A sign-off filter from a query string or a select, or "all".
 *
 * Anything unrecognised widens to "all" rather than narrowing to nothing: a
 * typo in a URL should show the report, not an empty table that reads as "there
 * is nothing here".
 */
export const cleanSignoffFilter = (value: unknown): SignoffFilter => {
  const raw = String(value ?? "").trim().toLowerCase();
  return (SIGNOFF_FILTERS as readonly string[]).includes(raw) ? (raw as SignoffFilter) : "all";
};

/**
 * Does this row belong in a "complete" or "incomplete" view?
 *
 * Complete means **every** level is signed — business, QA and POD verification.
 * The same definition `signoffState` uses for the column, so the filter and the
 * words in the row can never disagree.
 *
 * Shared by the report on screen and by the download, so a filtered file holds
 * exactly the rows that were filtered on screen.
 */
export function matchesSignoff(
  signoffs: Signoffs | undefined,
  merged: boolean,
  filter: SignoffFilter,
): boolean {
  if (filter === "all") return true;
  const { complete } = signoffState(signoffs, merged);
  return filter === "complete" ? complete : !complete;
}

/**
 * Apply a tick, or take one back.
 *
 * Returns a new map rather than mutating: the caller stores whatever comes
 * back, and a half-applied change cannot leave a signature behind.
 */
export function setSignoff(
  signoffs: Signoffs | undefined,
  level: SignoffLevel,
  on: boolean,
  by: string,
  at: string,
): Signoffs {
  const next: Signoffs = { ...(signoffs ?? {}) };
  if (on) next[level] = { by, at };
  else delete next[level];
  return next;
}
