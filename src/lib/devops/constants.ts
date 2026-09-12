/**
 * Every tunable the DevOps dashboard has that is **not** a secret.
 *
 * The split, which is the same one `lib/constants.ts` draws for the POD board:
 *
 * - **Here** — product decisions that must be identical in every deployment:
 *   how many rows a page shows, how long a drawer takes to open, the exact
 *   wording of a refusal. Changing one is a change to the product, so it is
 *   reviewed in the repository.
 * - **`.env.devopsdashboard`** — anything that differs between deployments or
 *   must never be committed: tokens, the API host, whether freezes are real.
 *   Read through `lib/devops/config.ts`, which is the only module that touches
 *   `process.env` for this board.
 *
 * This file is **pure and client-safe**. It is imported by browser components
 * and by the check suite, so it must never reach for `node:fs`, a store or
 * `process.env` — that is exactly what `config.ts` is for.
 */

/** The env file this board's settings and tokens live in. */
export const DEVOPS_ENV_FILE = ".env.devopsdashboard";

/**
 * The names of every environment variable this board reads.
 *
 * Listed once, so `config.ts`, the example file and `pnpm check:env` cannot
 * drift apart, and so "what can I configure?" has a single answer.
 */
export const DEVOPS_ENV_KEYS = {
  /** Who may open the board: `members` or `admins`. */
  access: "DEVOPS_ACCESS",
  /** `live` actually locks branches on GitHub. Anything else is a dry run. */
  githubMode: "GITHUB_MODE",
  /** API root. Override for GitHub Enterprise. */
  githubApi: "GITHUB_API_URL",
  /** Fallback token, used by any repo that has none of its own. */
  githubToken: "GITHUB_TOKEN",
  /** How many pages of pull requests one sync reads. */
  syncPages: "DEVOPS_SYNC_PAGES",
  /** Rows a table shows before it pages. */
  pageSize: "DEVOPS_PAGE_SIZE",
  /** Storage driver, shared with the POD board: `json` or `mongodb`. */
  dbDriver: "DB_DRIVER",
} as const;

/* ------------------------------------------------------------------ tables */

export const DEVOPS_TABLE = {
  /** Rows a section shows at once. Seven, so a section stays a glance. */
  pageSize: 7,
  /** Ceiling on `DEVOPS_PAGE_SIZE`, so one setting cannot render a thousand rows. */
  maxPageSize: 100,
  /** Longest filter string accepted from a query string. */
  maxQuery: 200,
} as const;

/* ------------------------------------------------------------------ motion */

/**
 * How a row opens.
 *
 * The drawer animates its **height**, not just its opacity — the first version
 * appeared at full size instantly while fading, so the table jumped under the
 * cursor and the eye lost the row it had just clicked.
 *
 * Closing is deliberately immediate: a drawer that lingers on the way out
 * keeps stale fields on screen and keeps the table from settling.
 *
 * The same curve twice, in the two spellings the two mechanisms need: framer
 * takes the four control points, CSS takes the function. They must stay in
 * step — the chevron turns while the drawer opens, and two curves read as two
 * things happening.
 */
export const DEVOPS_MOTION = {
  /** How long a row takes to open. Long enough to follow, short enough to feel instant. */
  rowOpenMs: 260,
  /** How long the chevron takes to turn. Matched to the drawer so they read as one gesture. */
  chevronMs: 200,
  /** Decelerating, so the drawer arrives rather than stopping. For a CSS `transition`. */
  ease: "cubic-bezier(0.22, 1, 0.36, 1)",
  /** The same curve, as framer-motion wants it. */
  easeCurve: [0.22, 1, 0.36, 1] as [number, number, number, number],
} as const;

/* ---------------------------------------------------------------- download */

/** What a downloaded file is called, and which formats there are. */
export const DEVOPS_DOWNLOAD = {
  formats: ["xlsx", "csv"] as const,
  scopeFile: "scope-sheet",
  reportFile: "signoff-report",
  scopeSheetName: "Scope sheet",
  reportSheetName: "Sign-off report",
  creator: "POD Tracker",
} as const;

export type DownloadFormat = (typeof DEVOPS_DOWNLOAD.formats)[number];

/* ----------------------------------------------------------------- filters */

/**
 * How the sign-off report can be narrowed.
 *
 * `complete` and `incomplete` are the two questions people actually ask of
 * this report — "what is cleared to ship" and "what is still waiting on
 * somebody" — so they are a filter rather than something to work out by
 * reading the column.
 */
export const SIGNOFF_FILTERS = ["all", "complete", "incomplete"] as const;
export type SignoffFilter = (typeof SIGNOFF_FILTERS)[number];

export const SIGNOFF_FILTER_LABEL: Record<SignoffFilter, string> = {
  all: "Every sign-off state",
  complete: "Sign-off complete",
  incomplete: "Sign-off incomplete",
};

/* ---------------------------------------------------------------- defaults */

/**
 * What each setting falls back to when the environment says nothing.
 *
 * Every default is the safe reading: a dry run cannot lock a branch, and the
 * `json` driver needs nothing installed.
 */
export const DEVOPS_DEFAULTS = {
  access: "members",
  githubMode: "dry-run",
  githubApi: "https://api.github.com",
  /** Pages of 100 pull requests read by one sync. */
  syncPages: 5,
} as const;

/* ---------------------------------------------------------------- wording */

/**
 * The sentences this board refuses with.
 *
 * One place, because the button and the API both say them and two wordings for
 * one rule is how a form ends up claiming something the server disagrees with.
 */
export const DEVOPS_MESSAGES = {
  /** A cycle whose scope is closed, when somebody tries to write a row. */
  scopeFrozen: (cycle: string, reason: string) =>
    reason
      ? `The scope sheet for ${cycle} is frozen: ${reason}`
      : `The scope sheet for ${cycle} is frozen. An admin can reopen it.`,

  /**
   * A frozen sheet refusing a **move**, which is a different sentence on
   * purpose: the reader is holding a pull request, not filling a form, and
   * needs to be told that this pull request is the thing that cannot move.
   */
  moveScopeFrozen: (cycle: string, reason: string) =>
    reason
      ? `This pull request can't be moved — the scope sheet for ${cycle} is frozen: ${reason}`
      : `This pull request can't be moved — the scope sheet for ${cycle} is frozen. An admin can reopen it.`,

  /** No cycle on the pull request at all. */
  moveNoCycle:
    "Set this pull request's cycle first — it goes onto that cycle's scope sheet and no other. Open the row and pick one.",

  /** A cycle that is not this repository's. */
  moveWrongRepo: (cycle: string) => `${cycle} is not a cycle of this pull request's repository.`,

  /** The client asked for a different sheet than the pull request is taped to. */
  moveCycleMismatch: (cycle: string) =>
    `This pull request is assigned to ${cycle}. Change its cycle first — a pull request only ever goes onto the sheet it is assigned to.`,
} as const;
