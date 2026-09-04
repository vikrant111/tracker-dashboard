/**
 * How loudly the Azure client reports what it fetched.
 *
 * Its own file so `azure-debug.ts` stays about the logging and this stays the
 * one place the levels are named — the env var, the docs and the checks all
 * read from here.
 */

export const AZDO_DEBUG_MODES = ["off", "summary", "full"] as const;

export type AzdoDebugMode = (typeof AZDO_DEBUG_MODES)[number];

/**
 * Off unless asked.
 *
 * A sync runs on a timer, so logging on by default would write a block of
 * output every poll interval, forever — and at `full` it would be writing real
 * work item titles into whatever collects the logs.
 */
export const AZDO_DEBUG_DEFAULT: AzdoDebugMode = "off";
