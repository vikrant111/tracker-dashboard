/** How a board is read: Azure's limits, ageing, and the health score. */
// ---------------------------------------------------------------------- azure

export const AZURE = {
  /** Azure's hard cap on `workitemsbatch`. Not ours to raise. */
  batchSize: 200,
  /** REST API version pinned across every call. */
  apiVersion: "7.1",
  /** Work item types a new POD imports until told otherwise. */
  defaultWorkItemTypes: ["Bug", "Issue", "Task", "User Story"] as string[],
  /**
   * The POD created automatically when Azure is configured in the environment
   * but no POD exists yet, so a fresh install connects without a visit to admin.
   */
  defaultPodName: "Default POD",
} as const;

// --------------------------------------------------------------------- ageing

export const AGEING = {
  /** Days open before an item counts as aged, unless a POD overrides it. */
  defaultThresholdDays: 7,
  min: 1,
  max: 365,
} as const;

// --------------------------------------------------------------------- health

/*
 * Board health has no tunables.
 *
 * It used to: points docked per aged critical, a cap on each of three
 * penalties, an age multiple. All of it is gone — the score is now
 * `closed / total`, which has nothing to configure and nothing to explain. See
 * `lib/health.ts`.
 */
