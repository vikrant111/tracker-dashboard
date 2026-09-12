/**
 * Branch names, cleaned.
 *
 * Split out of `types.ts` when that file outgrew a single sitting. Re-exported
 * from there, so every import site is unchanged.
 *
 * Client-safe and pure — the admin form and the save path both ask this, and
 * two copies of the rule is the drift these modules exist to avoid.
 */

/**
 * A branch name that will survive being put in a URL, or the fallback.
 *
 * Not the full refname grammar. The point is to refuse what would break the
 * GitHub API path this value is interpolated into — a space, a `..`, a leading
 * slash — rather than to relitigate what git allows.
 *
 * Lives here rather than beside the save logic because the form checks it too,
 * and two copies of one rule is the drift this file exists to avoid.
 */
export function cleanBranch(value: unknown, fallback: string): string {
  const raw = String(value ?? "").trim().replace(/^refs\/heads\//, "");
  if (!raw || raw.length > 255) return fallback;
  if (/[\s~^:?*[\\]/.test(raw) || raw.includes("..") || /^[./]|[./]$/.test(raw)) return fallback;
  return raw;
}

/** Whether a branch name is unusable. The form's half of the same rule. */
export const badBranch = (name: unknown): boolean => cleanBranch(name, "") === "";

/** What an announcement is about. Drives its icon and tint, nothing else. */
export const ANNOUNCEMENT_KINDS = ["release", "freeze", "hotfix", "note"] as const;
export type AnnouncementKind = (typeof ANNOUNCEMENT_KINDS)[number];

/**
 * Something an admin wants everyone working on a repo to know.
 *
 * Tied to a repo and a branch rather than floating free: "release is cut" means
 * nothing without saying which repo's release branch, and the boards people
 * read are per repo.
 */
export type Announcement = {
  /** `${repoId}-${epochMillis}`, so it sorts and never collides. */
  id: string;
  repoId: string;
  /** The branch this is about — usually the repo's release branch. */
  branch: string;
  kind: AnnouncementKind;
  title: string;
  body: string;
  /** Who posted it. */
  author: string;
  /** Kept at the top of the list until unpinned. */
  pinned: boolean;
  createdAt: string;
};

/** An id that sorts by time within a repo. `at` is passed in so this stays pure. */
export const announcementId = (repoId: string, at: number): string =>
  `${String(repoId ?? "").trim()}-${String(at).padStart(14, "0")}`;

export * from "./records.ts";
