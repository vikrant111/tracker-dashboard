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

export const fetcher = (url: string) => fetch(url).then((r) => r.json());

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
