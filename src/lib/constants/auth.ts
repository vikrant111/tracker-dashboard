// ---------------------------------------------------------------------- auth
//
// How long a session lives, and how hard it is to guess a password.
//
// Seconds, because that is the unit NextAuth takes and converting at the call
// site is how the two drift apart.

export const SESSION = {
  /**
   * **Idle timeout.** A session this long without a request is over.
   *
   * Rolling: every authenticated request re-issues the cookie, so the clock
   * restarts. Twelve hours is a working day with margin — long enough that
   * lunch does not sign you out, short enough that a machine left on the train
   * overnight is not still signed in tomorrow.
   */
  idleSeconds: 12 * 60 * 60,

  /**
   * **Absolute timeout.** A session cannot outlive this, however busy it is.
   *
   * The idle clock alone is renewed by activity, so a compromised token that is
   * used steadily never expires. This is the ceiling that cannot be pushed —
   * after a week, everybody signs in again.
   */
  absoluteSeconds: 7 * 24 * 60 * 60,

  /**
   * How often an unchanged session is re-issued.
   *
   * Also how stale a role change can be: the token is re-read from OpenSearch
   * whenever it is refreshed, so this is the worst-case delay between an admin
   * revoking access and the session noticing. Fifteen minutes is a compromise
   * between that and writing a cookie on every single request.
   */
  refreshSeconds: 15 * 60,
} as const;

export const LOGIN = {
  /**
   * Failed attempts before an account stops accepting passwords for a while.
   *
   * bcrypt at cost 10 is already ~100ms a guess, which is a poor rate for an
   * attacker — but "poor" is not "none", and an unattended dictionary run has
   * all night. This turns that into minutes of progress.
   */
  maxAttempts: 8,

  /** How long the lockout lasts once it trips. */
  lockoutSeconds: 15 * 60,

  /** A quiet spell this long clears the count, so a typo today is forgotten. */
  windowSeconds: 15 * 60,
} as const;
