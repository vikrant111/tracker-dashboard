/**
 * Data colours only — chrome lives in globals.css.
 *
 * These resolve to CSS custom properties, not literal hex, so light and dark
 * swap without React re-rendering a single chart. The actual values live in
 * `globals.css`, where each theme's set was run through the dataviz validator
 * against that theme's own surface (`--surface`): lightness band, chroma floor,
 * CVD separation, normal-vision floor and contrast. Dark and light are each
 * *selected*; neither is a tint of the other.
 *
 * Slots are assigned in fixed order and never cycled. If a dimension grows past
 * its slot count, fold the tail into "Other" rather than inventing a hue.
 */

/** Categorical slots. Fixed order — the order is the CVD safety mechanism. */
export const SERIES = [
  "var(--series-1)",
  "var(--series-2)",
  "var(--series-3)",
  "var(--series-4)",
  "var(--series-5)",
] as const;

export const INK_MUTED = "var(--ink-muted)";

/**
 * Severity is a state, not an identity, so it uses the reserved status palette,
 * which is identical in both themes. On the light surface two of these fall
 * under 3:1 by design — they always ship with a text label, never colour alone.
 */
export const SEVERITY_COLOR: Record<string, string> = {
  Critical: "var(--sev-critical)",
  Major: "var(--sev-major)",
  Minor: "var(--sev-minor)",
  Unknown: "var(--sev-unknown)",
};

/** Environments are identities. Slot order follows the release pipeline. */
export const ENV_COLOR: Record<string, string> = {
  "IT-UAT": SERIES[0],
  "BIZ-UAT": SERIES[1],
  CUG: SERIES[2],
  Production: SERIES[3],
  Unknown: INK_MUTED,
};

export const STATUS_COLOR: Record<string, string> = {
  Open: SERIES[0],
  Commented: SERIES[1],
  "For QA Validation": SERIES[2],
  "Not a Bug": SERIES[3],
  Closed: SERIES[4],
  Unknown: INK_MUTED,
};

/**
 * The same four states, for **type**.
 *
 * A status colour used as a word needs 4.5:1; used as a dot or a bar it needs
 * 3:1 and must stay recognisably itself. On a light surface those are different
 * colours — the warning yellow is 1.74:1 as text, which is how the band label
 * under the POD name disappeared on a projector.
 *
 * Use `STATUS` for marks and `STATUS_INK` for anything a reader reads.
 */
export const STATUS_INK = {
  good: "var(--st-good-ink)",
  warning: "var(--st-warning-ink)",
  serious: "var(--st-serious-ink)",
  critical: "var(--st-critical-ink)",
} as const;

/**
 * Ageing is ordinal magnitude: one hue, monotone lightness. Dark mode brightens
 * with age, light mode darkens — in both, the oldest bucket carries the most
 * presence against its own surface.
 */
export const AGEING_COLOR: Record<string, string> = {
  "0-3 days": "var(--age-1)",
  "4-7 days": "var(--age-2)",
  "8-14 days": "var(--age-3)",
  "15-30 days": "var(--age-4)",
  "30+ days": "var(--age-5)",
};

export const TREND_COLOR = { raised: SERIES[0], closed: SERIES[2] };

/** Health bands and any other state readout. Reserved — never reused as a series. */
export const STATUS = {
  good: "var(--st-good)",
  warning: "var(--st-warning)",
  serious: "var(--st-serious)",
  critical: "var(--st-critical)",
};

export function colorFor(dimension: "severity" | "environment" | "status" | "ageing", key: string): string {
  const table = {
    severity: SEVERITY_COLOR,
    environment: ENV_COLOR,
    status: STATUS_COLOR,
    ageing: AGEING_COLOR,
  }[dimension];
  return table[key] ?? INK_MUTED;
}

/** Ageing heat for a single number of days — used on leaderboard rows and item lists. */
export function ageTint(days: number): string {
  if (days >= 30) return STATUS.critical;
  if (days >= 14) return STATUS.serious;
  if (days >= 7) return STATUS.warning;
  return STATUS.good;
}
