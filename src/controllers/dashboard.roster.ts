/**
 * The rosters behind the leaderboard.
 *
 * Split out of the controller so that file stays about the aggregation — and
 * because this half has its own rule worth stating plainly.
 */
import { filterRoster, type RosterPerson } from "../lib/roster.ts";
import type { Filters } from "../lib/metrics/types.ts";
import { listTeams } from "../lib/teams.ts";

/**
 * Everyone on the PODs in scope, narrowed by the same search the items were.
 *
 * **Both halves of that matter.** Without the roster, a freshly onboarded POD
 * shows an empty leaderboard and reads as "adding members didn't work". Without
 * the *filter*, searching for one person listed the whole roster at zero beside
 * them — the board claimed six people when the reader had asked about one.
 *
 * A failure here must not take the dashboard with it. The roster is a nicety;
 * the counts are the product, so this degrades to nobody rather than throwing.
 */
export async function loadRoster(f: Filters): Promise<RosterPerson[]> {
  try {
    const teams = await listTeams();
    const inScope = teams.filter((t) => !f.teamId || t.id === f.teamId);
    return filterRoster(inScope.flatMap((t) => t.members ?? []), f.search);
  } catch {
    return [];
  }
}
