/**
 * Persistence for PODs.
 *
 * The domain rules — defaults, slugging, the "similar name" refusal — stay in
 * `lib/teams.ts`, which is what the rest of the app imports. This file is the
 * only place that knows those rules end up in a collection.
 */
import { connectToDatabase } from "../db/connect.ts";
import { TeamModel } from "../db/models/index.ts";
import type { Team } from "../lib/types.ts";
import { deleteItemsForTeam } from "./items.controller.ts";

/** Strip Mongo's bookkeeping so callers get the domain shape and nothing else. */
const clean = (doc: Record<string, unknown> | null): Team | null => {
  if (!doc) return null;
  const { _id, __v, ...rest } = doc as Record<string, unknown>;
  void _id;
  void __v;
  return rest as unknown as Team;
};

export async function findAllTeams(): Promise<Team[]> {
  await connectToDatabase();
  const docs = await TeamModel.find({}).lean();
  return docs.map((d) => clean(d as Record<string, unknown>)!).filter(Boolean);
}

export async function findTeamById(id: string): Promise<Team | null> {
  await connectToDatabase();
  /*
   * Guard the lookup key. Mongo happily accepts an object here, and a crafted
   * `id` of `{"$ne":null}` arriving from a query string would otherwise match
   * the first POD in the collection — a POD the caller may not be able to see.
   */
  if (typeof id !== "string" || !id) return null;
  return clean((await TeamModel.findById(id).lean()) as Record<string, unknown> | null);
}

export async function saveTeamDoc(team: Team): Promise<Team> {
  await connectToDatabase();
  await TeamModel.replaceOne({ _id: team.id }, { ...team, _id: team.id }, { upsert: true });
  return team;
}

/**
 * Deleting a POD takes its items with it.
 *
 * Items first: if the team row went first and the item delete then failed, the
 * items would be orphaned under a POD that no longer exists — invisible in
 * every per-POD view while still counted in every global one.
 */
export async function deleteTeamDoc(id: string): Promise<void> {
  await connectToDatabase();
  if (typeof id !== "string" || !id) return;
  await deleteItemsForTeam(id);
  await TeamModel.deleteOne({ _id: id });
}

export async function countTeams(): Promise<number> {
  await connectToDatabase();
  return TeamModel.countDocuments({});
}
