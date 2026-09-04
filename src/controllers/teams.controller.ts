/**
 * Persistence for PODs, through whichever store is configured.
 *
 * The domain rules — defaults, slugging, the "similar name" refusal — stay in
 * `lib/teams.ts`. This is the only place that knows they end up in a store.
 */
import { getStore } from "../db/store/index.ts";
import type { Team } from "../lib/types.ts";
import { deleteItemsForTeam } from "./items.controller.ts";

export async function findAllTeams(): Promise<Team[]> {
  const store = getStore();
  await store.init();
  return store.teams.all();
}

export async function findTeamById(id: string): Promise<Team | null> {
  const store = getStore();
  await store.init();
  /*
   * Guard the lookup key. A JSON body can carry `{"$ne": null}` where a string
   * was expected, and on the Mongo driver that matches the first document in
   * the collection — a POD the caller may not be able to see.
   */
  if (typeof id !== "string" || !id) return null;
  return store.teams.byId(id);
}

export async function saveTeamDoc(team: Team): Promise<Team> {
  const store = getStore();
  await store.init();
  return store.teams.save(team);
}

/**
 * Deleting a POD takes its items with it.
 *
 * Items first: if the team row went first and the item delete then failed, the
 * items would be orphaned under a POD that no longer exists — invisible in
 * every per-POD view while still counted in every global one.
 */
export async function deleteTeamDoc(id: string): Promise<void> {
  if (typeof id !== "string" || !id) return;
  const store = getStore();
  await store.init();
  await deleteItemsForTeam(id);
  await store.teams.remove(id);
}

export async function countTeams(): Promise<number> {
  const store = getStore();
  await store.init();
  return store.teams.count();
}
