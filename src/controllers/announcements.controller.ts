/**
 * Persistence for release-branch announcements.
 *
 * The domain rules — the id, the defaults, what an admin may change — live in
 * `lib/devops/announcements.ts`.
 */
import { getStore } from "../db/store/index.ts";
import type { Announcement } from "../lib/devops/types.ts";

export async function findAllAnnouncements(): Promise<Announcement[]> {
  const store = getStore();
  await store.init();
  return store.announcements.all();
}

export async function findAnnouncementById(id: string): Promise<Announcement | null> {
  const store = getStore();
  await store.init();
  // Guard the key: a JSON body can carry an operator where a string belongs.
  if (typeof id !== "string" || !id) return null;
  return store.announcements.byId(id);
}

export async function saveAnnouncementDoc(a: Announcement): Promise<Announcement> {
  const store = getStore();
  await store.init();
  return store.announcements.save(a);
}

export async function deleteAnnouncementDoc(id: string): Promise<void> {
  if (typeof id !== "string" || !id) return;
  const store = getStore();
  await store.init();
  await store.announcements.remove(id);
}
