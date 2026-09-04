/**
 * One fetch policy for the whole dashboard.
 *
 * Every panel that reads from the API must refresh on the same cadence and be
 * revalidated by the same events. When they differ, two parts of the screen
 * disagree — a tile saying 45 above a drawer still listing 42 — and the reader
 * has no way to know which is right.
 */

/** How often live data is re-read. Shared, so nothing drifts out of step. */
export const REFRESH_MS = 30_000;

/**
 * Every dashboard read.
 *
 * The API answers with JSON on both paths — `{ error }` and a status on a
 * refusal, the payload otherwise — so a body that parses is handed straight
 * back and panels keep reading `data.error`.
 *
 * Anything else throws with a sentence worth showing. That covers the cases
 * `.json()` used to swallow into a bare `SyntaxError`: a dev server mid-restart,
 * a corporate proxy returning a login page, a crash that produced HTML.
 */
export const fetcher = async (url: string) => {
  const res = await fetch(url);
  const body = await res.json().catch(() => null);
  if (body && typeof body === "object") return body;

  throw new Error(
    res.status === 200
      ? "The server did not answer with data. It may be restarting."
      : `The server answered ${res.status} ${res.statusText || ""}`.trim() + ".",
  );
};

/** Applied to every dashboard query. */
export const SWR_OPTIONS = {
  refreshInterval: REFRESH_MS,
  keepPreviousData: true,
  revalidateOnFocus: true,
  // Panels mount and unmount as rows expand; without this each one would fire
  // its own request for data a sibling already has in flight.
  dedupingInterval: 2_000,
} as const;

/**
 * Matches every API key, for revalidating the whole screen at once after
 * something changes the data underneath it — a sync, or an upload.
 */
export const isApiKey = (key: unknown): boolean => typeof key === "string" && key.startsWith("/api/");

/**
 * Why a panel has no data, as a sentence, or null when nothing went wrong.
 *
 * Two different failures reach a panel and only one of them used to be read.
 * `data.error` is the server refusing and saying why; `error` is the request
 * never getting an answer at all — a restart, a dropped connection, a proxy.
 * Ignoring the second rendered "could not load" with nothing to act on.
 */
export function failureReason(error: unknown, data: { error?: string } | undefined): string | null {
  if (error) return error instanceof Error ? error.message : String(error);
  return data?.error ?? null;
}
