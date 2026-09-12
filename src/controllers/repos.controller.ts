/**
 * Persistence for onboarded repositories.
 *
 * The domain rules — the slug, the defaults, keeping a stored token when the
 * form sends back a mask — live in `lib/devops/repos.ts`. This is the only
 * place that knows they end up in a store.
 */
import { getStore } from "../db/store/index.ts";
import type { Repo } from "../lib/devops/types.ts";
import { withTeamIds } from "../lib/devops/repos.ts";

export async function findAllRepos(): Promise<Repo[]> {
  const store = getStore();
  await store.init();
  return (await store.repos.all()).map((r) => withTeamIds(r)!).filter(Boolean);
}

export async function findRepoById(id: string): Promise<Repo | null> {
  const store = getStore();
  await store.init();
  /*
   * Guard the lookup key, as the POD lookup does. A JSON body can carry
   * `{"$ne": null}` where a string was expected, and on the Mongo driver that
   * matches the first document in the collection.
   */
  if (typeof id !== "string" || !id) return null;
  return withTeamIds(await store.repos.byId(id));
}

export async function saveRepoDoc(repo: Repo): Promise<Repo> {
  const store = getStore();
  await store.init();
  return store.repos.save(repo);
}

export async function deleteRepoDoc(id: string): Promise<void> {
  if (typeof id !== "string" || !id) return;
  const store = getStore();
  await store.init();
  await store.repos.remove(id);
}

export async function countRepos(): Promise<number> {
  const store = getStore();
  await store.init();
  return store.repos.count();
}
