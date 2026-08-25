/**
 * Caps on what a document may hold.
 *
 * Not validation niceties — an unbounded string is an unbounded index, and a
 * 300-character POD name once became a 300-character document id.
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
  /**
   * A password, at its longest.
   *
   * Not a strength rule — a ceiling. bcrypt costs real CPU per hash, so an
   * unbounded password is an unbounded amount of work triggered by a form
   * field. Long enough that no real passphrase is ever refused.
   *
   * (bcrypt itself only reads the first 72 bytes. This is well past that, so
   * the cap is about the work done before hashing, not about the hash.)
   */
  password: 200,
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
