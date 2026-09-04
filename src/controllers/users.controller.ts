/**
 * Persistence for accounts, through whichever store is configured.
 *
 * The domain rules — hashing, role validation, the first-admin bootstrap — stay
 * in `lib/users.ts`. This only knows where the records live.
 */
import { getStore } from "../db/store/index.ts";
import type { User } from "../lib/types.ts";

export async function findUserById(id: string): Promise<User | null> {
  const store = getStore();
  await store.init();
  /*
   * The id is an email arriving from a request body or a session claim. A JSON
   * body can carry an object, and on the Mongo driver `{"$ne": null}` matches
   * the first account in the collection — very possibly an admin.
   */
  if (typeof id !== "string" || !id) return null;
  return store.users.byId(id);
}

export async function findAllUsers(): Promise<User[]> {
  const store = getStore();
  await store.init();
  return store.users.all();
}

export async function countUserDocs(): Promise<number> {
  const store = getStore();
  await store.init();
  return store.users.count();
}

export async function saveUserDoc(user: User): Promise<User> {
  const store = getStore();
  await store.init();
  return store.users.save(user);
}

export async function deleteUserDoc(id: string): Promise<void> {
  if (typeof id !== "string" || !id) return;
  const store = getStore();
  await store.init();
  await store.users.remove(id);
}

/**
 * Create an account only if there is nobody at all.
 *
 * Atomic in both drivers — a unique key in Mongo, a serialised file write in
 * JSON — because two workers booting together would otherwise both see an
 * empty store and the second would overwrite the first, password and all.
 */
export async function insertFirstUser(user: User): Promise<boolean> {
  const store = getStore();
  await store.init();
  return store.users.insertFirst(user);
}
