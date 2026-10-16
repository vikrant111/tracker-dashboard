/**
 * What a board puts before the first separator in a title.
 *
 * Neither BFL board has an environment field. One carries it in the tags; the
 * other only here — `Biz UAT - Investment. CLP - Next js`, `Production | PDP |
 * Web & Mweb | …`. So the leading segment is read as a candidate, and
 * `resolveEnvironment` matches it **strictly**: it has to *be* an environment,
 * not merely contain one.
 *
 * Capped at 24 characters, because a title with no separator is a sentence and
 * a sentence is not an environment — "Fix regression in login" must not become
 * Regression.
 *
 * A dash only separates when it has **space around it**. Without that rule
 * "CUG-like behaviour in staging" split at the hyphen and the board called it
 * CUG; the same would happen to "Prod-like setup" and "UAT-only issue". A pipe
 * or a colon needs no space, because neither occurs inside a word.
 */
export function leadingSegment(title: string): string {
  const head = String(title ?? "").split(/\s[-\u2013\u2014]\s|[|:]/)[0].trim();
  return head.length > 0 && head.length <= 24 ? head : "";
}
