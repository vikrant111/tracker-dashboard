"use client";

/**
 * What "Sync now" and "Upload a spreadsheet" actually do.
 *
 * Lifted out of `dashboard-client.tsx`, which had grown past the length anyone
 * reads in one sitting. Both are the same shape — call an endpoint, turn the
 * answer into one sentence, refresh every panel — and neither is about layout,
 * which is what the rest of that file is about.
 *
 * Both revalidate *every* API key rather than their own. A sync changes the
 * data under all the panels at once, so an open drawer would otherwise keep
 * showing pre-sync rows beside post-sync tiles.
 */

/** Turn a sync response into the sentence to show. Pure, so it is checked directly. */
export function describeSync(body: {
  results?: { imported?: number; error?: string }[];
}): { text: string; tone: "ok" | "bad" } {
  const results = Array.isArray(body?.results) ? body.results : [];

  // One failure is worth more than a total: "3 imported" beside a broken POD
  // reads as success. The first error is what the reader has to act on.
  const failed = results.find((r) => r?.error);
  if (failed?.error) return { text: failed.error, tone: "bad" };

  const imported = results.reduce((n, r) => n + (Number(r?.imported) || 0), 0);
  return {
    text: imported ? `Synced ${imported} work item${imported === 1 ? "" : "s"}.` : "Already up to date.",
    tone: "ok",
  };
}

/** The same for an upload: what landed, and what quietly did not. */
export function describeUpload(body: {
  imported?: number;
  skipped?: number;
  duplicates?: number;
}): string {
  const imported = Number(body?.imported) || 0;

  /*
   * Skipped and merged rows are named. A count of what went in, with no word
   * about the rows that did not, is how somebody discovers three months later
   * that a column was wrong.
   */
  const notes = [
    body?.skipped ? `skipped ${body.skipped} without a title` : "",
    body?.duplicates ? `merged ${body.duplicates} duplicate id${body.duplicates === 1 ? "" : "s"}` : "",
  ].filter(Boolean);

  return `Imported ${imported} row${imported === 1 ? "" : "s"}${notes.length ? `, ${notes.join(", ")}` : ""}.`;
}
