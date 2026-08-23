/**
 * Every tunable literal in the product that is **not** an environment variable.
 *
 * The rule for what lives here versus `.env.local`:
 *
 * - **Environment** — anything that differs between one deployment and the next,
 *   or that must never be committed: URLs, credentials, secrets, the poll
 *   interval an operator wants to tune per environment.
 * - **Here** — anything that is a *product decision* and should be identical
 *   everywhere: field length caps, page sizes, how many people the leaderboard
 *   shows, how long a toast stays up. Changing one of these is a change to the
 *   product, so it belongs in the repository where it can be reviewed.
 *
 * Scene geometry (`lib/sky.ts`) and the takeover maths (`lib/takeover.ts`) keep
 * their own constants: they are only meaningful next to the equations that use
 * them, and pulling them here would make both files harder to read, not easier.
 */

// ------------------------------------------------------------------- storage
//
// Caps on what a document may hold. These are not validation niceties — an
// unbounded string is an unbounded index, and a 300-character POD name once
// became a 300-character document id.

export const LIMITS = {
  /** POD name. Also the id it slugs to, before truncation. */
  teamName: 80,
  /** POD description, shown under the name in admin. */
  teamDescription: 500,
  /** People in one POD. Generous; the point is that it is bounded. */
  teamMembers: 200,
  /** A person's name, in a roster or on a work item. */
  personName: 120,
  /** An email address. Longer than any real one, short enough to index. */
  email: 200,
  /** A member's job title. */
  designation: 120,
  /** A free-text search string from the query string. */
  search: 200,
  /** Work item title. */
  itemTitle: 500,
} as const;

// --------------------------------------------------------------------- lists
//
// How much of a result set each surface shows before it needs a filter.

export const PAGE = {
  /** Rows per page in the drill-down drawer. */
  drillDefault: 100,
  /** Ceiling on `?limit=`, so one request cannot ask for the whole index. */
  drillMax: 500,
  /** People on the leaderboard. Beyond this, use the search box. */
  leaderboard: 12,
  /** PODs in the leadership roll-up. */
  teams: 50,
  /** Rows accepted from one spreadsheet upload. */
  uploadRows: 20_000,
} as const;

// --------------------------------------------------------------------- timing
//
// Milliseconds. The poller's interval is deliberately *not* here — it is
// `SYNC_POLL_SECONDS`, because it is the one an operator tunes per environment.

export const TIMING = {
  /** How long a toast stays on screen. */
  toastMs: 6_000,
  /** How long a two-step confirmation stays armed before it lapses. */
  confirmMs: 5_000,
  /**
   * How long after the last keystroke the search reaches the server.
   *
   * The input stays instant; this only delays the query. Committing on every
   * keystroke re-keys SWR and re-renders every panel on the board, which is
   * most of what made typing in it feel heavy.
   */
  searchDebounceMs: 250,
  /** How often the greeting re-reads the clock, so a board left open follows along. */
  clockTickMs: 60_000,
  /** Weather is cached this long, hit or miss. */
  weatherTtlMs: 15 * 60_000,
  /** How long an outbound weather request may take before it is abandoned. */
  weatherTimeoutMs: 4_000,
  /** Overlap subtracted from a sync watermark, so nothing falls through the gap. */
  syncOverlapMs: 60_000,
} as const;

// ---------------------------------------------------------------------- azure

export const AZURE = {
  /** Azure's hard cap on `workitemsbatch`. Not ours to raise. */
  batchSize: 200,
  /** REST API version pinned across every call. */
  apiVersion: "7.1",
  /** Work item types a new POD imports until told otherwise. */
  defaultWorkItemTypes: ["Bug", "Issue", "Task", "User Story"] as string[],
  /**
   * The POD created automatically when Azure is configured in the environment
   * but no POD exists yet, so a fresh install connects without a visit to admin.
   */
  defaultPodName: "Default POD",
} as const;

// --------------------------------------------------------------------- ageing

export const AGEING = {
  /** Days open before an item counts as aged, unless a POD overrides it. */
  defaultThresholdDays: 7,
  min: 1,
  max: 365,
} as const;

// --------------------------------------------------------------------- health

/*
 * Board health has no tunables.
 *
 * It used to: points docked per aged critical, a cap on each of three
 * penalties, an age multiple. All of it is gone — the score is now
 * `closed / total`, which has nothing to configure and nothing to explain. See
 * `lib/health.ts`.
 */

// --------------------------------------------------------------------- export

export const EXPORT = {
  /**
   * Ceiling on one download.
   *
   * Well above any real POD, and bounded on purpose: the whole sheet is built
   * in memory before a byte is sent, so an unbounded export is an unbounded
   * allocation triggered by a query string.
   */
  maxRows: 20_000,
  /**
   * Rows per underlying query.
   *
   * Comfortably under OpenSearch's default `index.max_result_window` of 10,000
   * — the export pages with `search_after`, so the window never applies, but a
   * page that approached it would be one config change from failing again.
   */
  pageSize: 1_000,
  sheetName: "Work items",
  /** Written into the cells so Excel treats them as dates, not text. */
  dateFormat: "yyyy-mm-dd",
  headerFill: "FFEEF4FB",
} as const;

// --------------------------------------------------------------------- upload

export const UPLOAD = {
  /** Largest spreadsheet accepted, in bytes. */
  maxBytes: 20 * 1024 * 1024,
  /** Same figure in the copy shown to the reader, so the two cannot drift. */
  maxLabel: "20 MB",
  /**
   * What the file picker offers.
   *
   * MIME types **and** extensions. An extension-only filter greys out files the
   * operating system happens to type differently — which is how somebody with
   * no Excel installed finds their own CSV unselectable.
   *
   * `.xls` is deliberately absent: exceljs reads the OOXML container and CSV,
   * not the old binary format. The server still sniffs the bytes, so this list
   * only decides what is easy to pick, never what is accepted.
   *
   * `.numbers` is here because on a Mac it is often the only spreadsheet format
   * the reader has — `lib/numbers.ts` reads it directly.
   */
  accept: [
    ".csv",
    ".xlsx",
    ".xlsm",
    ".numbers",
    ".txt",
    ".tsv",
    "text/csv",
    "text/plain",
    "text/tab-separated-values",
    "application/csv",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/x-iwork-numbers-sffnumbers",
  ].join(","),
} as const;
