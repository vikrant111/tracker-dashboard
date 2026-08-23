/**
 * Ranking the names offered under the search box.
 *
 * This replaced a native `<datalist>`, which matched differently in every
 * browser — Chrome matches anywhere in the string, Safari only from the start,
 * and neither says which part matched. A list you cannot predict is worse than
 * no list, because you stop trusting it and type the whole name anyway.
 *
 * Pure and client-safe, so `scripts/check-ui.mjs` exercises the real ranking.
 */

export type Suggestion = {
  value: string;
  /** Where the query matched, so the UI can show it. `-1` when nothing matched. */
  at: number;
  length: number;
};

const norm = (s: unknown) => String(s ?? "").trim().toLowerCase();

/**
 * How good a match is. Lower sorts first.
 *
 * Three tiers, in the order a person expects:
 *
 * 0. The **whole name** starts with it — they are typing this name.
 * 1. A **word** starts with it — a surname, a second given name.
 * 2. It appears **somewhere** — the weakest reason to be in the list.
 *
 * So "rao" offers "Raosaheb Kulkarni" first, because that is the name being
 * typed, and "Ananya Rao" next, because that is a surname being typed. Both
 * beat anything that merely contains the letters. Ties break alphabetically, so
 * the list never reorders itself between two equally good matches.
 */
function rank(name: string, query: string): { score: number; at: number } {
  const haystack = norm(name);
  const needle = norm(query);
  if (!needle) return { score: 3, at: -1 };

  const at = haystack.indexOf(needle);
  if (at < 0) return { score: Number.POSITIVE_INFINITY, at: -1 };

  if (at === 0) return { score: 0, at };
  // Start of any word — a surname, a second given name.
  if (/[\s._-]/.test(haystack[at - 1] ?? "")) return { score: 1, at };
  return { score: 2, at };
}

/**
 * The names worth offering for what has been typed so far.
 *
 * An empty query returns the first `limit` names rather than nothing: focusing
 * an empty search box and being shown who is on the board is useful, and it is
 * how a reader discovers that the box takes names at all.
 */
export function suggest(query: string, names: readonly string[], limit = 8): Suggestion[] {
  const pool = Array.isArray(names) ? names : [];
  const needle = norm(query);

  // Case-insensitive dedupe. Two PODs listing the same person, or Azure and a
  // spreadsheet spelling them differently, should not fill the list with them.
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const raw of pool) {
    const name = String(raw ?? "").trim();
    if (!name) continue;
    const key = norm(name);
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(name);
  }

  // Exactly what was typed is not a suggestion, it is what is already there.
  const scored = unique
    .map((value) => ({ value, ...rank(value, query) }))
    .filter((s) => Number.isFinite(s.score) && norm(s.value) !== needle);

  scored.sort((a, b) => a.score - b.score || a.value.localeCompare(b.value));

  return scored.slice(0, Math.max(0, limit)).map((s) => ({
    value: s.value,
    at: s.at,
    length: needle.length,
  }));
}

/**
 * Split a name into the part before the match, the match, and the part after —
 * so the UI can show *why* a row is in the list without doing its own string
 * maths and getting the offsets wrong.
 */
export function highlight(value: string, at: number, length: number): [string, string, string] {
  const text = String(value ?? "");
  if (at < 0 || length <= 0 || at >= text.length) return [text, "", ""];
  return [text.slice(0, at), text.slice(at, at + length), text.slice(at + length)];
}
