/**
 * Where the JSON store lives, and what each file is called.
 *
 * `DB_store/` at the repository root by default, so a clone has the data with
 * it and a machine that cannot run a database still has a working board. Point
 * `DB_STORE_DIR` somewhere else to keep real data outside the repository.
 */
import { join, resolve } from "node:path";

/** One file per collection, named after what is in it. */
export const COLLECTION_FILES = {
  items: "items.json",
  teams: "teams.json",
  users: "users.json",
  sync: "sync-state.json",
} as const;

export type CollectionName = keyof typeof COLLECTION_FILES;

export const COLLECTION_NAMES = Object.keys(COLLECTION_FILES) as CollectionName[];

/**
 * Resolved from the working directory, so it is the same folder whether the
 * app, a script or the check suite is asking.
 */
export const STORE_DIR = resolve(process.env.DB_STORE_DIR?.trim() || join(process.cwd(), "DB_store"));

export const storeFile = (name: CollectionName): string => join(STORE_DIR, COLLECTION_FILES[name]);
