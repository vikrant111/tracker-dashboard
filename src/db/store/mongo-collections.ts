/**
 * PODs, accounts and sync watermarks for the MongoDB driver.
 *
 * The same three collections `json-collections.ts` handles, and deliberately
 * the same shape: read by id, write by id, count. Every write goes through
 * `toDocument` first, exactly as the JSON driver does, so the two accept and
 * reject the same documents.
 *
 * `connectToDatabase()` at the top of each call is not a per-call connection.
 * It resolves to the one already open; the call is there so a request that
 * arrives before startup finished still waits for it.
 */
import { fromStored, toDocument } from "../document.ts";
import { SyncStateModel, TeamModel, UserModel } from "../models/index.ts";
import { connectToDatabase } from "../connect.ts";
import type { SyncState } from "../../lib/sync.ts";
import type { Team, User } from "../../lib/types.ts";
import type { Store } from "./types.ts";

type Row = Record<string, unknown>;

export const mongoTeams = (): Store["teams"] => ({
  async all() {
    await connectToDatabase();
    const docs = (await TeamModel.find({}).lean()) as Row[];
    return docs.map((d) => fromStored<Team>(TeamModel, d)).filter((t): t is Team => t !== null);
  },

  async byId(id: string) {
    if (typeof id !== "string" || !id) return null;
    await connectToDatabase();
    return fromStored<Team>(TeamModel, (await TeamModel.findById(id).lean()) as Row | null ?? undefined);
  },

  async save(team: Team) {
    await connectToDatabase();
    const checked = toDocument<Team>(TeamModel, team, team?.id);
    if (!checked.doc) throw new Error(`Cannot save that POD: ${checked.error}.`);

    await TeamModel.replaceOne({ _id: team.id }, checked.doc, { upsert: true });
    return checked.doc;
  },

  async remove(id: string) {
    if (typeof id !== "string" || !id) return;
    await connectToDatabase();
    await TeamModel.deleteOne({ _id: id });
  },

  async count() {
    await connectToDatabase();
    return TeamModel.countDocuments({});
  },
});

export const mongoUsers = (): Store["users"] => ({
  async all() {
    await connectToDatabase();
    const docs = (await UserModel.find({}).lean()) as Row[];
    return docs.map((d) => fromStored<User>(UserModel, d)).filter((u): u is User => u !== null);
  },

  async byId(id: string) {
    if (typeof id !== "string" || !id) return null;
    await connectToDatabase();
    return fromStored<User>(UserModel, (await UserModel.findById(id).lean()) as Row | null ?? undefined);
  },

  async save(user: User) {
    await connectToDatabase();
    const checked = toDocument<User>(UserModel, user, user?.id);
    if (!checked.doc) throw new Error(`Cannot save that account: ${checked.error}.`);

    await UserModel.replaceOne({ _id: user.id }, checked.doc, { upsert: true });
    return checked.doc;
  },

  async remove(id: string) {
    if (typeof id !== "string" || !id) return;
    await connectToDatabase();
    await UserModel.deleteOne({ _id: id });
  },

  async count() {
    await connectToDatabase();
    return UserModel.countDocuments({});
  },

  async insertFirst(user: User) {
    await connectToDatabase();
    if ((await UserModel.countDocuments({})) > 0) return false;

    const checked = toDocument<User>(UserModel, user, user?.id);
    if (!checked.doc) throw new Error(`Cannot create the first account: ${checked.error}.`);

    try {
      await UserModel.create(checked.doc);
      return true;
    } catch (err) {
      // 11000 is a duplicate key: another worker got there first, which is the
      // answer this method exists to give.
      if ((err as { code?: number }).code === 11000) return false;
      throw err;
    }
  },
});

export const mongoSync = (): Store["sync"] => ({
  async byId(teamId: string) {
    if (typeof teamId !== "string" || !teamId) return null;
    await connectToDatabase();
    return fromStored<SyncState>(
      SyncStateModel,
      (await SyncStateModel.findById(teamId).lean()) as Row | null ?? undefined,
    );
  },

  async save(teamId: string, state: SyncState) {
    if (typeof teamId !== "string" || !teamId) return;
    await connectToDatabase();

    const checked = toDocument<SyncState>(SyncStateModel, { ...state, teamId }, teamId);
    // Same as the JSON driver: a watermark that will not store is not worth
    // failing a sync over. The next run starts from the last one that did.
    if (!checked.doc) return;

    await SyncStateModel.replaceOne({ _id: teamId }, checked.doc, { upsert: true });
  },
});
