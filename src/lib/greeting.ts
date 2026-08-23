/**
 * The greeting's pure logic, kept out of the component so it can be checked
 * without a browser. `scripts/check-ui.mjs` mirrors these rules.
 */

export type Phase = "morning" | "afternoon" | "evening" | "night";

/** Longest name we will render before truncating — the card has one line for it. */
export const MAX_NAME = 22;

/**
 * Local hour → part of day. Boundaries are inclusive of the lower bound, so
 * every hour 0..23 lands in exactly one phase and none is ever unhandled.
 */
export function phaseFor(hour: number): Phase {
  if (!Number.isFinite(hour)) return "morning";
  const h = Math.floor(hour) % 24;
  const safe = h < 0 ? h + 24 : h;
  if (safe >= 5 && safe < 12) return "morning";
  if (safe >= 12 && safe < 17) return "afternoon";
  if (safe >= 17 && safe < 21) return "evening";
  return "night";
}

export const GREETING: Record<Phase, string> = {
  morning: "Good morning",
  afternoon: "Good afternoon",
  evening: "Good evening",
  night: "Working late",
};

/**
 * A session name can be anything an admin typed, or an email when nothing was
 * set. Reduce it to one short, human first name — React escapes the output, so
 * this is about legibility and layout, not safety.
 */
export function displayName(raw: string | null | undefined): string {
  const cleaned = String(raw ?? "")
    .replace(/[\r\n\t]+/g, " ")
    .trim();
  if (!cleaned) return "there";

  // "ananya.rao@example.com" → "Ananya"
  const local = cleaned.includes("@") ? cleaned.slice(0, cleaned.indexOf("@")) : cleaned;
  const first = local.split(/[\s._-]+/).filter(Boolean)[0] ?? "";
  if (!first) return "there";

  const titled = first.length <= 3 && first === first.toUpperCase() ? first : first[0].toUpperCase() + first.slice(1);
  return titled.length > MAX_NAME ? titled.slice(0, MAX_NAME - 1) + "…" : titled;
}
