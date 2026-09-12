/**
 * What a purge can clear.
 *
 * Its own module because the panel needs the list and `purge.ts` reaches the
 * store — a client component importing that would pull mongoose into the
 * browser bundle, which is a build break this project has already had once.
 */
export const PURGE_TARGETS = ["deployments", "pulls", "announcements"] as const;
export type PurgeTarget = (typeof PURGE_TARGETS)[number];
