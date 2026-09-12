/**
 * What an announcement is, before it is stored.
 *
 * Pinned first, then newest. That ordering is the whole feature: somebody
 * opening the board during a release wants the freeze notice at the top, not
 * whatever happened to be posted last.
 */
import { HttpError } from "../http-error.ts";
import { LIMITS } from "../constants.ts";
import {
  findAllAnnouncements,
  findAnnouncementById,
  saveAnnouncementDoc,
} from "../../controllers/announcements.controller.ts";
import { findRepoById } from "../../controllers/repos.controller.ts";
import { ANNOUNCEMENT_KINDS, announcementId, cleanBranch, type Announcement, type AnnouncementKind } from "./types.ts";

const kindOf = (value: unknown): AnnouncementKind =>
  (ANNOUNCEMENT_KINDS as readonly string[]).includes(String(value)) ? (value as AnnouncementKind) : "note";

/** Pinned first, then newest. */
export const inReadingOrder = (list: Announcement[]): Announcement[] =>
  [...list].sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.createdAt.localeCompare(a.createdAt));

export async function listAnnouncements(repoId?: string): Promise<Announcement[]> {
  const all = await findAllAnnouncements();
  const scoped = repoId ? all.filter((a) => a.repoId === repoId) : all;
  return inReadingOrder(scoped);
}

/**
 * Post or edit an announcement.
 *
 * The repo has to exist. An announcement about a repository nobody onboarded
 * would render under a blank name and could never be found again.
 */
export async function saveAnnouncement(
  input: Partial<Announcement> & { repoId?: string },
  author: string,
  now = Date.now(),
): Promise<Announcement> {
  const repoId = String(input.repoId ?? "").trim();
  const repo = await findRepoById(repoId);
  if (!repo) throw new HttpError(400, "Pick a repository this announcement is about.");

  const title = String(input.title ?? "").trim().slice(0, LIMITS.itemTitle);
  if (!title) throw new HttpError(400, "Give the announcement a title. It is the only part most people read.");

  const existing = input.id ? await findAnnouncementById(String(input.id)) : null;

  return saveAnnouncementDoc({
    id: existing?.id ?? announcementId(repoId, now),
    repoId,
    // Defaults to the repo's release branch, which is what these are almost
    // always about, without making somebody retype it every time.
    branch: cleanBranch(input.branch ?? existing?.branch ?? repo.releaseBranch, repo.releaseBranch),
    kind: kindOf(input.kind ?? existing?.kind),
    title,
    body: String(input.body ?? existing?.body ?? "").trim().slice(0, LIMITS.teamDescription * 4),
    // The original author keeps the byline; an edit does not steal it.
    author: existing?.author || author,
    pinned: input.pinned === undefined ? Boolean(existing?.pinned) : Boolean(input.pinned),
    createdAt: existing?.createdAt ?? new Date(now).toISOString(),
  });
}
