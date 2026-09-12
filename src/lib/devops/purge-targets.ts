/**
 * What a purge can clear, on either board.
 *
 * Grouped by board rather than listed flat, because the two screens must not
 * offer each other's data: a POD admin clearing a quarter of work items has no
 * business deleting release announcements from the same dialog, and the reverse
 * is worse.
 *
 * Its own module because the panels need the list and `purge.ts` reaches the
 * store — a client component importing that would pull mongoose into the
 * browser bundle, which is a build break this project has already had once.
 */

/** The POD board: work items, by the day they were created. */
export const POD_PURGE_TARGETS = ["items"] as const;

/** The DevOps board: everything it records. */
export const DEVOPS_PURGE_TARGETS = ["deployments", "pulls", "announcements"] as const;

/**
 * Every target there is.
 *
 * The API validates against this one, so a request can only ever name something
 * real — but each screen passes its own group, so neither can offer the other's.
 */
export const PURGE_TARGETS = [...POD_PURGE_TARGETS, ...DEVOPS_PURGE_TARGETS] as const;
export type PurgeTarget = (typeof PURGE_TARGETS)[number];

/** How each target reads to a person, and which date it is filtered on. */
export const PURGE_LABEL: Record<PurgeTarget, string> = {
  items: "Work items",
  deployments: "Scope rows",
  pulls: "Pull requests",
  announcements: "Announcements",
};

/**
 * Which date each target is cleared by.
 *
 * Shown on the screen, because "clear September" is ambiguous until somebody
 * says September of *what* — a bug raised in September and one deployed in
 * September are different rows.
 */
export const PURGE_DATE_FIELD: Record<PurgeTarget, string> = {
  items: "raised on",
  deployments: "deployed on",
  pulls: "merged on",
  announcements: "posted on",
};
