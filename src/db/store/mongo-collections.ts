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
import { AnnouncementModel, CycleModel, DeploymentModel, PullModel, RepoModel, SyncStateModel, TeamModel, UserModel } from "../models/index.ts";
import { mongoKeyed } from "./keyed.ts";
import { connectToDatabase } from "../connect.ts";
import type { SyncState } from "../../lib/sync.ts";
import type { Announcement, Cycle, Deployment, PullRecord, Repo } from "../../lib/devops/types.ts";
import type { Team, User } from "../../lib/types.ts";
import type { Store } from "./types.ts";

type Row = Record<string, unknown>;

export const mongoTeams = (): Store["teams"] => mongoKeyed<Team>(TeamModel, "POD");

export const mongoRepos = (): Store["repos"] => mongoKeyed<Repo>(RepoModel, "repository");

export const mongoAnnouncements = (): Store["announcements"] =>
  mongoKeyed<Announcement>(AnnouncementModel, "announcement");

export const mongoDeployments = (): Store["deployments"] =>
  mongoKeyed<Deployment>(DeploymentModel, "deployment record");

export const mongoCycles = (): Store["cycles"] => mongoKeyed<Cycle>(CycleModel, "cycle");

export const mongoPulls = (): Store["pulls"] => mongoKeyed<PullRecord>(PullModel, "pull request");

export const mongoUsers = (): Store["users"] => ({
  ...mongoKeyed<User>(UserModel, "account"),

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
