/**
 * How the two boards are stacked.
 *
 * One rhythm, in one place, because they drifted: the POD dashboard put `mb-6`
 * under its bar, `mt-10` above an empty state and `mt-6` above its footer,
 * while the DevOps board used `mb-4` and then nothing at all — every panel flat
 * against the next. Six different gaps for one idea, and each new section
 * picked whichever its neighbour happened to use.
 *
 * So the **container owns the gap** and a section owns none. Adding a panel is
 * then a panel, not a panel plus a guess about the margin above it.
 */

export const LAYOUT = {
  /**
   * The vertical rhythm between top-level sections of a board.
   *
   * `gap-4` because that is what the dashboard's own inner grids already use —
   * the gap between two breakdown cards and the gap between two sections read
   * as the same interval, which is the whole point of a rhythm.
   */
  boardStack: "flex flex-col gap-4",

  /** The width and padding both boards share, so they cannot drift apart either. */
  boardWidth: "mx-auto max-w-[1400px] px-3 pb-24 sm:px-6",
} as const;
