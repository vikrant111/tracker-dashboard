/** Milliseconds and seconds: how long things wait, and how long they last. */
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
