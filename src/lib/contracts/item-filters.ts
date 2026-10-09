/**
 * The words the dashboard knows, and which of them a live fetch lets through.
 *
 * **This is the file to edit.** Changing what the board recognises or filters on
 * is a change to the tables below and nothing else — no filter logic anywhere
 * reads a hardcoded list, so none of it has to be touched again.
 *
 * Two separate questions, deliberately two tables:
 *
 * - `VOCABULARY` — every value the dashboard can *display*. `src/lib/types.ts`
 *   derives `SEVERITIES` / `ENVIRONMENTS` / `STATUSES` from it, the Mongo schema
 *   derives its enums from those, and `src/lib/palette.ts` hands each one a
 *   colour slot in this order. Order is therefore load-bearing twice over:
 *   severity is ranked worst-first by it, and the colour slots follow it.
 * - `ALLOWED` — which of those values a **live** Azure fetch keeps. A subset.
 *   An item mapping to anything outside it is dropped before it reaches a
 *   number, which is what stops a board's unrelated work landing on this
 *   tracker.
 *
 * A value in `ALLOWED` that is not in `VOCABULARY` is a typo that would filter
 * everything out, so `pnpm check:ui` fails on it rather than quietly emptying
 * the board.
 *
 * Spellings — what a board's own words map **onto** these — live in
 * `src/lib/value-map.ts`, which is a translation table rather than a filter.
 */

/** Everything the board can show. Appending a value gives it the next colour slot. */
export const VOCABULARY = {
  /** Worst first. `severityRank` and the stacked load bar both read this order. */
  severity: ["Critical", "Major", "Minor"],
  /** Release-pipeline order, which is the order the colour slots follow. */
  environment: ["IT-UAT", "BIZ-UAT", "CUG", "Production", "DR", "N2P", "PTPaaS", "Regression"],
  status: ["Open", "Commented", "For QA Validation", "Not a Bug", "Closed", "CR"],
} as const;

/**
 * Statuses that mean the item no longer needs work.
 *
 * `CR` is deliberately absent: a change request is open work. Getting this
 * wrong leaves items counted as open forever, or closes them early — the health
 * score, the ageing chart and every "still open" number move together.
 */
export const TERMINAL = ["Closed", "Not a Bug"] as const;

/**
 * The values each dimension is expected to hold, and whether anything else is
 * dropped.
 *
 * **`dropOutside` is off.** Every value that maps lands in its own section —
 * the lists below document what a board is expected to say, they do not gate
 * it. That is the default because a dropped item is invisible: it is not in a
 * total, not in a drill-down, and nothing on screen says it existed. A value
 * nobody expected showing up in its own section is a question somebody can
 * answer; a missing one is not.
 *
 * Turn `dropOutside` on and the lists are enforced: anything mapping outside
 * them never reaches a number. Then `keepUnknown` decides what happens to a
 * value that mapped to nothing — a task has no severity and most boards have no
 * environment field, so dropping those would hide real work.
 *
 * **The lists are written in the words above, not the board's words.** A value
 * is tested after it has been mapped, so the board's `1-Critical` is `Critical`
 * by the time it gets here — the board's spelling belongs in
 * `src/lib/value-map.ts`. Spelling, case and punctuation do not matter
 * (`BIZ UAT` and `BIZ-UAT` are one key), but a word that is not in
 * `VOCABULARY` could never match, so `pnpm check:ui` refuses it.
 */
export const ALLOWED = {
  /** The board writes these `1-Critical`, `2-Major`, `3-Minor`. */
  severity: ["Critical", "Major", "Minor"].map(canonical),
  environment: ["BIZ UAT", "DR", "IT UAT", "CUG", "N2P", "Production", "PTPaaS", "Regression"].map(canonical),
  /** The board's Bug Status field: Closed, Open, Commented, CR. */
  status: ["Closed", "Open", "Commented", "CR"].map(canonical),
  dropOutside: false,
  keepUnknown: true,
} as const;

/**
 * What "the last 365 days" means.
 *
 * | Mode | Asks Azure for | Misses |
 * |---|---|---|
 * | `created` | raised inside the window | a bug raised two years ago that is **still open** |
 * | `touched` | raised **or** changed inside the window | an open bug nobody has touched in a year |
 * | `open-or-touched` | the above, plus anything with no close date at all | nothing |
 *
 * `touched` is the default. An ageing board exists to show work that has waited,
 * so the item it must never hide is the oldest open one — and `created` hides
 * exactly that. `open-or-touched` closes the last gap but adds a blank
 * `ClosedDate` clause, which a heavily customised process can reject; it fails
 * loudly if so, and this drops back to `touched` by changing one word.
 */
export const WINDOW_MODES = ["created", "touched", "open-or-touched"] as const;
export type WindowMode = (typeof WINDOW_MODES)[number];

/**
 * How far back a live fetch reaches, and how long its answer is reused.
 *
 * `windowDays` is the whole reason a live board is affordable: one POD's last
 * year, not a project's entire history.
 *
 * It is applied twice — once as a WIQL bound, and again after mapping, where
 * the rule is **finished long ago and raised long ago**. Work that is still
 * open is kept whatever its age, because that is the work an ageing board is
 * for; what gets dropped is history that closed before the window and would
 * otherwise inflate the closed totals with a year nobody asked about.
 *
 * `cacheSeconds` keeps one board's dashboard, its drill-downs and its export
 * reading the same answer instead of re-fetching per request. **In memory only
 * — nothing a live fetch returns is ever written to disk.**
 */
export const LIVE = {
  windowDays: 365,
  windowMode: "touched" as WindowMode,
  /**
   * Check every fetched item against the filters that asked for it, instead of
   * trusting the query to have been exact.
   *
   * On, because Azure matches an identity field generously: a clause naming an
   * email can come back matched on a display name, so an item can arrive
   * without carrying the value the contract asked for. One that fails is
   * dropped and counted in the server log. Turn it off only to find out whether
   * it is what is emptying a board.
   */
  verifyFilters: true,
  cacheSeconds: 60,
  /** WIQL will not return more ids than this in one query; Azure's own ceiling. */
  maxIds: 20_000,
} as const;

/**
 * The spelling a board value is compared as: lower-cased, with every character
 * that is not a letter or a digit removed.
 *
 * So `BIZ UAT`, `biz-uat`, `BIZ_UAT` and `BizUAT` are one key. That is what
 * lets the lists above be written the way the board writes them — and it is
 * what keeps `IT UAT` and `BIZ-UAT` apart, which punctuation alone did not:
 * `IT_UAT` reached the substring pass, where the longest matching key was
 * `uat`, and came back **BIZ-UAT**. Two real environments, silently merged.
 *
 * Separators are removed rather than normalised to one, because a board writes
 * `PTPaaS` and `PT PaaS` and `pt-paas` for the same thing. Nothing in the
 * vocabulary collides once they are gone — `pnpm check:ui` asserts that, so a
 * future category that would collide fails rather than swallowing another.
 */
export function canonical(value: string): string {
  return String(value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "");
}

type Dimension = "severity" | "environment" | "status";

/** The shape `allowedBy` judges against — `ALLOWED`, or a set of rules a check supplies. */
export type AllowRules = {
  severity: readonly string[];
  environment: readonly string[];
  status: readonly string[];
  dropOutside: boolean;
  keepUnknown: boolean;
};

/**
 * Does a **mapped** value reach the board?
 *
 * Takes its rules as an argument so both settings are exercised by the suite
 * without reaching into the live table — a check that mutates the contract to
 * test it is a check that can leave the contract mutated.
 *
 * Compared canonically, so the rules can say `IT UAT` while the vocabulary says
 * `IT-UAT` and neither has to know about the other.
 */
export function allowedBy(rules: AllowRules, dimension: Dimension, value: string): boolean {
  if (!rules.dropOutside) return true;
  if (value === "Unknown") return rules.keepUnknown;
  return rules[dimension].includes(canonical(value));
}

/** The same, against the contract above. */
export function allows(dimension: Dimension, value: string): boolean {
  return allowedBy(ALLOWED, dimension, value);
}
