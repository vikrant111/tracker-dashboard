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
  /**
   * The turnaround each severity is held to, in **working days** — Monday to
   * Friday, weekends not counted. A Critical raised on Friday afternoon is one
   * working day old on Monday, and a one-day turnaround means nothing if the
   * weekend counts against it.
   *
   * These are the policy. A POD may still set its own per severity in Admin,
   * and that wins; this is what applies when it has not.
   */
  bySeverity: { Critical: 1, Major: 6, Minor: 12 } as Record<string, number>,
  /** For a severity with no turnaround of its own — `Unknown`, in practice. */
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
