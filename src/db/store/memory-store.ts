/**
 * The same store, entirely in memory.
 *
 * Not for running the app — it forgets everything on restart. It exists so a
 * failure can be split in half: this shares every line of the JSON driver's
 * *logic* (the predicate, the aggregation, the controllers) and none of its
 * file I/O. If a problem reproduces here it is in the logic; if it does not, it
 * is in the files.
 */
import type { ItemDoc } from "../models/index.ts";
import type { Filters } from "../../lib/metrics/types.ts";
import type { SyncState } from "../../lib/sync.ts";
import type { Team, User } from "../../lib/types.ts";
import { matchesFilters } from "../query/predicate.ts";
import { ItemModel, SyncStateModel, TeamModel, UserModel } from "../models/index.ts";
import { fromStored, fromStoredDoc, toDocument, toStoredRow } from "../document.ts";
import type { Store } from "./types.ts";

type Row = Record<string, unknown>;
type Tables = Record<"items" | "teams" | "users" | "sync", Map<string, Row>>;

const g = globalThis as unknown as { __podTrackerMemory?: Tables };
const tables: Tables = (g.__podTrackerMemory ??= {
  items: new Map<string, Row>(),
  teams: new Map<string, Row>(),
  users: new Map<string, Row>(),
  sync: new Map<string, Row>(),
});

const rows = (name: keyof Tables) => [...tables[name].values()];

export function createMemoryStore(): Store {
  return {
    driver: "json",
    describe: () => "in memory (test driver — nothing is persisted)",
    async init() {},
    async ping() {},
    async ensureIndexes() {},
    async close() {},
    async dropAll() {
      for (const t of Object.values(tables)) t.clear();
    },
    items: {
      async find(f: Filters, now: number) {
        return rows("items")
          .map((r) => fromStoredDoc<ItemDoc>(ItemModel, r))
          .filter((d): d is ItemDoc => d !== null && matchesFilters(d, f, now));
      },
      async bulkUpsert(docs: ItemDoc[]) {
        let failed = 0;
        for (const doc of docs) {
          const id = String(doc?.id ?? "");
          // Same schema check as the other two drivers, so a test that passes
          // here is a test that would pass against MongoDB.
          const checked = toDocument<Record<string, unknown>>(ItemModel, doc, id);
          if (!checked.doc) { failed++; continue; }
          tables.items.set(id, toStoredRow(ItemModel, checked.doc, id));
        }
        return failed;
      },
      async deleteById(id: string) { if (typeof id === "string") tables.items.delete(id); },
      async deleteByTeam(teamId: string) {
        let n = 0;
        for (const [k, v] of tables.items) if (v.teamId === teamId) { tables.items.delete(k); n++; }
        return n;
      },
      async count() { return tables.items.size; },
    },
    teams: {
      async all() { return rows("teams").map((r) => fromStored<Team>(TeamModel, r)).filter((t): t is Team => t !== null); },
      async byId(id: string) { return typeof id === "string" ? fromStored<Team>(TeamModel, tables.teams.get(id)) : null; },
      async save(team: Team) {
        const checked = toDocument<Team>(TeamModel, team, team?.id);
        if (!checked.doc) throw new Error(`Cannot save that POD: ${checked.error}.`);
        tables.teams.set(team.id, toStoredRow(TeamModel, checked.doc, team.id));
        return checked.doc;
      },
      async remove(id: string) { if (typeof id === "string") tables.teams.delete(id); },
      async count() { return tables.teams.size; },
    },
    users: {
      async all() { return rows("users").map((r) => fromStored<User>(UserModel, r)).filter((u): u is User => u !== null); },
      async byId(id: string) { return typeof id === "string" ? fromStored<User>(UserModel, tables.users.get(id)) : null; },
      async save(user: User) {
        const checked = toDocument<User>(UserModel, user, user?.id);
        if (!checked.doc) throw new Error(`Cannot save that account: ${checked.error}.`);
        tables.users.set(user.id, toStoredRow(UserModel, checked.doc, user.id));
        return checked.doc;
      },
      async remove(id: string) { if (typeof id === "string") tables.users.delete(id); },
      async count() { return tables.users.size; },
      async insertFirst(user: User) {
        if (tables.users.size) return false;
        const checked = toDocument<User>(UserModel, user, user?.id);
        if (!checked.doc) throw new Error(`Cannot create the first account: ${checked.error}.`);
        tables.users.set(user.id, toStoredRow(UserModel, checked.doc, user.id));
        return true;
      },
    },
    sync: {
      async byId(teamId: string) { return typeof teamId === "string" ? fromStored<SyncState>(SyncStateModel, tables.sync.get(teamId)) : null; },
      async save(teamId: string, state: SyncState) {
        if (typeof teamId !== "string" || !teamId) return;
        const checked = toDocument<SyncState>(SyncStateModel, { ...state, teamId }, teamId);
        if (!checked.doc) return;
        tables.sync.set(teamId, toStoredRow(SyncStateModel, checked.doc, teamId));
      },
    },
  };
}

