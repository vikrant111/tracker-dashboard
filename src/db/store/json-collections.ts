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
import { SyncStateModel, TeamModel, UserModel } from "../models/index.ts";
import { mutate, readCollection } from "./json-files.ts";
import { removeRow, upsertRow } from "./json-rowops.ts";
import type { SyncState } from "../../lib/sync.ts";
import type { Team, User } from "../../lib/types.ts";
import type { Store } from "./types.ts";

/** Rows of a collection, with anything unreadable left out. */
function readAll<T>(name: "teams" | "users", model: typeof TeamModel | typeof UserModel): T[] {
  const out: T[] = [];
  for (const row of readCollection<Record<string, unknown>>(name)) {
    const doc = fromStored<T>(model, row);
    // A row we cannot read is skipped, not fatal. It predates a schema change
    // or was edited by hand, and one bad row must not empty the admin screen.
    if (doc) out.push(doc);
  }
  return out;
}

/** Find a row by `_id` or by its own `id` field. Older files used only `id`. */
const findRow = (name: "teams" | "users" | "sync", id: string, alt: string) =>
  readCollection<Record<string, unknown>>(name).find((r) => r._id === id || r[alt] === id);

export const jsonTeams = (): Store["teams"] => ({
  async all() {
    return readAll<Team>("teams", TeamModel);
  },

  async byId(id: string) {
    if (typeof id !== "string" || !id) return null;
    return fromStored<Team>(TeamModel, findRow("teams", id, "id"));
  },

  async save(team: Team) {
    // One save, so a rejection throws rather than being counted. Quietly
    // dropping a POD somebody just filled in would be worse than the error.
    const checked = toDocument<Team>(TeamModel, team, team?.id);
    if (!checked.doc) throw new Error(`Cannot save that POD: ${checked.error}.`);

    await upsertRow("teams", team.id, toStoredRow(TeamModel, checked.doc, team.id));
    return checked.doc;
  },

  async remove(id: string) {
    if (typeof id !== "string" || !id) return;
    await removeRow("teams", id);
  },

  async count() {
    return readCollection<unknown>("teams").length;
  },
});

export const jsonUsers = (): Store["users"] => ({
  async all() {
    return readAll<User>("users", UserModel);
  },

  async byId(id: string) {
    if (typeof id !== "string" || !id) return null;
    return fromStored<User>(UserModel, findRow("users", id, "id"));
  },

  async save(user: User) {
    const checked = toDocument<User>(UserModel, user, user?.id);
    if (!checked.doc) throw new Error(`Cannot save that account: ${checked.error}.`);

    await upsertRow("users", user.id, toStoredRow(UserModel, checked.doc, user.id));
    return checked.doc;
  },

  async remove(id: string) {
    if (typeof id !== "string" || !id) return;
    await removeRow("users", id);
  },

  async count() {
    return readCollection<unknown>("users").length;
  },

  async insertFirst(user: User) {
    const checked = toDocument<User>(UserModel, user, user?.id);
    if (!checked.doc) throw new Error(`Cannot create the first account: ${checked.error}.`);
    const row = toStoredRow(UserModel, checked.doc, user.id);

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
    return fromStored<SyncState>(SyncStateModel, findRow("sync", teamId, "teamId"));
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
