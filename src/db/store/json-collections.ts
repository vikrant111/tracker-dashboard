/**
 * PODs, accounts and sync watermarks for the JSON driver.
 *
 * Split from `json-store.ts` so that file is about items: the one collection
 * read on every request, and the one with query logic. These three are plain
 * reads and writes by id.
 *
 * Every write goes through `toDocument` first, so anything this driver stores
 * is something MongoDB would store, and anything it refuses MongoDB would
 * refuse too. See `db/document.ts`.
 */
import { fromStored, toDocument, toStoredRow } from "../document.ts";
import { AnnouncementModel, CycleModel, DeploymentModel, PullModel, RepoModel, SyncStateModel, TeamModel, UserModel } from "../models/index.ts";
import { jsonKeyed } from "./keyed.ts";
import { mutate, readCollection } from "./json-files.ts";
import { upsertRow } from "./json-rowops.ts";
import type { SyncState } from "../../lib/sync.ts";
import type { Announcement, Cycle, Deployment, PullRecord, Repo } from "../../lib/devops/types.ts";
import type { Team, User } from "../../lib/types.ts";
import type { Store } from "./types.ts";

export const jsonTeams = (): Store["teams"] => jsonKeyed<Team>("teams", TeamModel, "POD");

export const jsonRepos = (): Store["repos"] => jsonKeyed<Repo>("repos", RepoModel, "repository");

export const jsonAnnouncements = (): Store["announcements"] =>
  jsonKeyed<Announcement>("announcements", AnnouncementModel, "announcement");

export const jsonDeployments = (): Store["deployments"] =>
  jsonKeyed<Deployment>("deployments", DeploymentModel, "deployment record");

export const jsonCycles = (): Store["cycles"] => jsonKeyed<Cycle>("cycles", CycleModel, "cycle");

export const jsonPulls = (): Store["pulls"] => jsonKeyed<PullRecord>("pulls", PullModel, "pull request");

export const jsonUsers = (): Store["users"] => ({
  ...jsonKeyed<User>("users", UserModel, "account"),

  async insertFirst(user: User) {
    const checked = toDocument<User>(UserModel, user, user?.id);
    if (!checked.doc) throw new Error(`Cannot create the first account: ${checked.error}.`);
    const row = toStoredRow(UserModel, checked.doc as unknown as Record<string, unknown>, user.id);

    /*
     * The emptiness test and the write happen inside one `mutate`, so two
     * workers booting together cannot both see an empty file and both write an
     * admin — the second would overwrite the first, password and all. `mutate`
     * serialises per file, which is this driver's version of the unique-key
     * race the Mongo driver relies on.
     */
    return mutate<Record<string, unknown>, boolean>("users", (rows) => {
      if (rows.length) return { rows, result: false };
      return { rows: [row], result: true };
    });
  },
});

export const jsonSync = (): Store["sync"] => ({
  async byId(teamId: string) {
    if (typeof teamId !== "string" || !teamId) return null;
    const row = readCollection<Record<string, unknown>>("sync").find(
      (r) => r._id === teamId || r.teamId === teamId,
    );
    return fromStored<SyncState>(SyncStateModel, row);
  },

  async save(teamId: string, state: SyncState) {
    if (typeof teamId !== "string" || !teamId) return;

    const checked = toDocument<SyncState>(SyncStateModel, { ...state, teamId }, teamId);
    // A watermark that will not store is not worth failing a sync over. The
    // next run starts from the last one that did, and re-reads a little.
    if (!checked.doc) return;

    await upsertRow("sync", teamId, toStoredRow(SyncStateModel, checked.doc, teamId));
  },
});
