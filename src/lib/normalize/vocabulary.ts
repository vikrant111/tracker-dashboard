import {
  DEFAULT_VALUE_MAP,
  ENVIRONMENTS,
  type Environment,
  type Kind,
  type ValueMap,
} from "../types.ts";
import { canonical } from "../contracts/item-filters.ts";

/**
 * Turning a board's own words into ours.
 *
 * Every board spells severity differently — `1 - Critical`, `Blocker`, `P1` —
 * so nothing here guesses. Three passes: the POD's own overrides, the shipped
 * table, then a longest-match substring. Anything still unrecognised becomes
 * `Unknown` rather than being invented into a category.
 */
export const norm = (v: unknown) => String(v ?? "").trim().toLowerCase();

/** Anything that is not a letter or a digit separates one word from the next. */
const BOUNDARY = /[^a-z0-9]/;

/**
 * Does `key` appear in `value` as a whole word rather than as any old run of
 * letters?
 *
 * Written by hand rather than with `\b` because the keys contain punctuation —
 * `biz-uat`, `cug(stage)`, `not a bug` — and `\b` around those behaves in ways
 * that are hard to predict and harder to read.
 */
export function wordMatch(value: string, key: string): boolean {
  if (!key) return false;
  let from = 0;
  for (;;) {
    const at = value.indexOf(key, from);
    if (at < 0) return false;
    const before = at === 0 ? "" : value[at - 1];
    const after = at + key.length >= value.length ? "" : value[at + key.length];
    // A boundary on both sides, or the end of the string on that side.
    if ((!before || BOUNDARY.test(before)) && (!after || BOUNDARY.test(after))) return true;
    from = at + 1;
  }
}

/**
 * Resolve a raw board value into our vocabulary: the team's own overrides win,
 * then the shipped defaults, then a substring pass so "3 - Medium (UI)" and
 * "Deployed to Prod" still land somewhere useful.
 */
export function resolve<T extends string>(
  raw: unknown,
  overrides: Record<string, string> | undefined,
  defaults: Record<string, string>,
  allowed: readonly T[],
  fallback: T,
): T {
  const key = norm(raw);
  if (!key) return fallback;

  const table = { ...defaults, ...lowerKeys(overrides) };
  const exact = table[key];
  if (exact && allowed.includes(exact as T)) return exact as T;

  const direct = allowed.find((a) => norm(a) === key);
  if (direct) return direct;

  /*
   * The same comparison with the punctuation gone, so how a board separates two
   * words is not a category decision.
   *
   * This pass is why `IT_UAT`, `IT.UAT`, `IT - UAT` and `IT  UAT` are IT-UAT.
   * Without it they fell through to the substring pass below, where the longest
   * matching key was `uat` — and every one of them came back **BIZ-UAT**. Two
   * real environments merged into one on nothing but a separator, which is the
   * kind of wrong a reader cannot see and cannot question.
   *
   * It runs **before** the substring pass and never after it: an exact answer,
   * however it was spelled, always beats a word found inside something longer.
   */
  const squashed = canonical(key);
  if (squashed) {
    const sameValue = allowed.find((a) => canonical(a) === squashed);
    if (sameValue) return sameValue;
    const sameKey = Object.keys(table).find((k) => canonical(k) === squashed);
    if (sameKey && allowed.includes(table[sameKey] as T)) return table[sameKey] as T;
  }

  /*
   * Longest matching key first, so "not a bug" beats "bug" and "biz-uat" beats
   * "uat" — and **bounded**, so a key only matches a whole word.
   *
   * An unbounded `includes` looked fine until a real board arrived: `it`
   * matched inside "microsites", so every item under an area path named
   * "…Investment Mall and microsites" came back IT-UAT. "monitoring", "credit",
   * "editor" and "digital" all did the same. A two-letter key is a substring of
   * an enormous number of ordinary words.
   *
   * The vocabulary's own words join the keys here, so "REGRESSION TESTING"
   * reaches Regression without a table entry — but only those of three
   * characters or more. `DR` and `CR` are left out deliberately: a two-letter
   * word inside a sentence is the accident above, and both still match exactly
   * through the passes before this one.
   */
  const keys = [...Object.keys(table), ...allowed.filter((a) => a.length >= 3).map(norm)];
  const partial = [...new Set(keys)]
    .sort((a, b) => b.length - a.length)
    .find((k) => wordMatch(key, k));
  if (partial) {
    const hit = table[partial] ?? allowed.find((a) => norm(a) === partial);
    if (hit && allowed.includes(hit as T)) return hit as T;
  }

  return fallback;
}

function lowerKeys(obj: Record<string, string> | undefined): Record<string, string> {
  if (!obj) return {};
  return Object.fromEntries(Object.entries(obj).map(([k, v]) => [norm(k), v]));
}

/**
 * Bug, ticket or change request — derived, so the filter works without anybody
 * maintaining another field.
 *
 * The CR tag is matched **exactly**, not as a substring. `includes("cr")` made a
 * task tagged "critical" a change request, which is the same two-letter-key
 * accident that `wordMatch` fixes above.
 */
export function kindOf(workItemType: string, tags: string[]): Kind {
  const t = norm(workItemType);
  if (t.includes("bug") || t.includes("defect")) return "bug";

  const isChangeTag = (tag: string) => {
    const n = norm(tag);
    return n === "cr" || n === "crs" || wordMatch(n, "change request") || wordMatch(n, "change-request");
  };
  if (tags.some(isChangeTag) || t.includes("change request")) return "cr";

  return "ticket";
}

export function parseTags(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.map(String).map((s) => s.trim()).filter(Boolean);
  return String(raw ?? "")
    .split(/[;,]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Environment is the field most boards do not have. Fall back to tags, then to
 * the area path, before giving up — those are where teams actually put it.
 */
export function resolveEnvironment(
  fieldValue: unknown,
  tags: string[],
  areaPath: string,
  valueMap: ValueMap,
): Environment {
  const fromField = resolve(fieldValue, valueMap?.environment, DEFAULT_VALUE_MAP.environment, ENVIRONMENTS, "Unknown");
  if (fromField !== "Unknown") return fromField;

  for (const tag of tags) {
    const fromTag = resolve(tag, valueMap?.environment, DEFAULT_VALUE_MAP.environment, ENVIRONMENTS, "Unknown");
    if (fromTag !== "Unknown") return fromTag;
  }

  return resolve(areaPath, valueMap?.environment, DEFAULT_VALUE_MAP.environment, ENVIRONMENTS, "Unknown");
}
