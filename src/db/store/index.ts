/**
 * Which storage driver this instance uses.
 *
 *     DB_DRIVER=json      files under DB_store/ — nothing installed  (default)
 *     DB_DRIVER=mongodb   a real cluster, via MONGODB_URI
 *
 * **`json` is the default deliberately.** A clone of this repository has to run
 * on a machine that cannot install a database or open port 27017, and defaulting
 * to the thing that needs neither is what makes that true. Production sets
 * `DB_DRIVER=mongodb` and gets the same board from the same code.
 */
import { createJsonStore } from "./json-store.ts";
import { createMemoryStore } from "./memory-store.ts";
import { createMongoStore } from "./mongo-store.ts";
import type { Store } from "./types.ts";

export const DB_DRIVERS = ["json", "mongodb", "memory"] as const;
export type DbDriver = (typeof DB_DRIVERS)[number];

/** The configured driver, or a sentence saying why the value is not one. */
export function resolveDriver(env: NodeJS.ProcessEnv = process.env): { ok: true; driver: DbDriver } | { ok: false; reason: string } {
  const raw = (env.DB_DRIVER ?? "").trim().toLowerCase();
  if (!raw) return { ok: true, driver: "json" };
  if ((DB_DRIVERS as readonly string[]).includes(raw)) return { ok: true, driver: raw as DbDriver };
  return {
    ok: false,
    reason: `DB_DRIVER is "${raw}". Use one of: ${DB_DRIVERS.join(", ")}. "json" needs nothing installed.`,
  };
}

/*
 * One instance per process, cached on `globalThis` for the same reason the
 * Mongo connection is: Next re-evaluates modules on hot reload, and a fresh
 * store each time would mean a fresh file cache — and, on the Mongo driver, a
 * fresh connection every edit.
 */
const globalForStore = globalThis as unknown as { __podTrackerStore?: Store };

export function getStore(): Store {
  if (globalForStore.__podTrackerStore) return globalForStore.__podTrackerStore;
  const verdict = resolveDriver();
  if (!verdict.ok) throw new Error(verdict.reason);
  const store =
    verdict.driver === "mongodb" ? createMongoStore() : verdict.driver === "memory" ? createMemoryStore() : createJsonStore();
  globalForStore.__podTrackerStore = store;
  return store;
}

/** For the checks, which need to build a store per driver without a global. */
export function createStore(driver: DbDriver): Store {
  if (driver === "mongodb") return createMongoStore();
  if (driver === "memory") return createMemoryStore();
  return createJsonStore();
}

export type { Store } from "./types.ts";
