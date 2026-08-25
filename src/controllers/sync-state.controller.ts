/**
 * Persistence for each POD's sync watermark.
 *
 * One document per POD, keyed by team id, so writing it twice is an update.
 */
import { connectToDatabase } from "../db/connect.ts";
import { SyncStateModel } from "../db/models/index.ts";
import type { SyncState } from "../lib/sync.ts";

export async function findSyncState(teamId: string): Promise<SyncState | null> {
  await connectToDatabase();
  if (typeof teamId !== "string" || !teamId) return null;
  const doc = (await SyncStateModel.findById(teamId).lean()) as Record<string, unknown> | null;
  if (!doc) return null;
  const { _id, __v, ...rest } = doc;
  void _id;
  void __v;
  return rest as unknown as SyncState;
}

export async function saveSyncState(teamId: string, state: SyncState): Promise<void> {
  await connectToDatabase();
  await SyncStateModel.replaceOne({ _id: teamId }, { ...state, _id: teamId }, { upsert: true });
}
