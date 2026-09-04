/**
 * Each POD's sync watermark, through whichever store is configured.
 *
 * One record per POD, keyed by team id, so writing it twice is an update.
 */
import { getStore } from "../db/store/index.ts";
import type { SyncState } from "../lib/sync.ts";

export async function findSyncState(teamId: string): Promise<SyncState | null> {
  if (typeof teamId !== "string" || !teamId) return null;
  const store = getStore();
  await store.init();
  return store.sync.byId(teamId);
}

export async function saveSyncState(teamId: string, state: SyncState): Promise<void> {
  /*
   * A write, so the key is guarded too. A store will accept almost anything as
   * a key, and an object here creates a watermark nothing can find again —
   * quietly re-syncing that POD from the beginning forever.
   */
  if (typeof teamId !== "string" || !teamId) return;
  const store = getStore();
  await store.init();
  await store.sync.save(teamId, state);
}
