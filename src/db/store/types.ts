/**
 * What a storage driver has to provide.
 *
 * `json` writes files under `DB_store/` and needs nothing installed; `mongodb`
 * talks to a real cluster. `DB_DRIVER` picks. A machine that cannot run a
 * database still runs the whole app, and moving to a real one is one
 * environment variable.
 *
 * Both write through the same schemas either way — see `db/document.ts`.
 *
 * **The driver fetches; it does not aggregate.** Every number is computed in
 * `controllers/dashboard.aggregate.ts` over the items a driver hands back. Two
 * aggregations would be two chances for a bar and its drill-down to disagree,
 * which is the one thing this dashboard exists not to do.
 *
 * The cost: reading a POD's items into memory is fine for the thousands this
 * tracks and would not be for hundreds of thousands. At that point the Mongo
 * driver grows a `$facet` and this interface grows an `aggregate`.
 */
import type { ItemDoc } from "../models/index.ts";
import type { Filters } from "../../lib/metrics/types.ts";
import type { Team, User } from "../../lib/types.ts";
import type { SyncState } from "../../lib/sync.ts";

export type ItemStore = {
  /** Every item matching the filters, already narrowed by the driver. */
  find(filters: Filters, now: number): Promise<ItemDoc[]>;
  /** Upsert by deterministic id. Returns how many **failed**. */
  bulkUpsert(docs: ItemDoc[]): Promise<number>;
  deleteById(id: string): Promise<void>;
  deleteByTeam(teamId: string): Promise<number>;
  count(): Promise<number>;
};

export type TeamStore = {
  all(): Promise<Team[]>;
  byId(id: string): Promise<Team | null>;
  save(team: Team): Promise<Team>;
  remove(id: string): Promise<void>;
  count(): Promise<number>;
};

export type UserStore = {
  all(): Promise<User[]>;
  byId(id: string): Promise<User | null>;
  save(user: User): Promise<User>;
  remove(id: string): Promise<void>;
  count(): Promise<number>;
  /** Insert only when there is nobody at all. Returns false if somebody exists. */
  insertFirst(user: User): Promise<boolean>;
};

export type SyncStore = {
  byId(teamId: string): Promise<SyncState | null>;
  save(teamId: string, state: SyncState): Promise<void>;
};

export type Store = {
  /** Which driver this is, for the health endpoint and `pnpm check:env`. */
  readonly driver: "json" | "mongodb";
  /** Where the data lives, with any password removed. Safe to log. */
  describe(): string;
  /** Open the connection or create the files. Idempotent. */
  init(): Promise<void>;
  /** Prove it is actually reachable right now. Throws if not. */
  ping(): Promise<void>;
  /** Create indexes, or nothing for a driver that has none. */
  ensureIndexes(force?: boolean): Promise<void>;
  /** Close. For scripts and tests; a server never needs it. */
  close(): Promise<void>;
  /** Delete everything this app owns. `pnpm seed --reset` only. */
  dropAll(): Promise<void>;

  items: ItemStore;
  teams: TeamStore;
  users: UserStore;
  sync: SyncStore;
};
