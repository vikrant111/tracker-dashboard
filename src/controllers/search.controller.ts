/**
 * Which PODs does this search actually find anything in?
 *
 * The dashboard scopes every query to one POD, so a search for somebody who
 * belongs to a different one returns nothing and says so — truthfully, and
 * uselessly. This answers the question the reader actually had: *where is
 * this?*
 *
 * **Two kinds of match, and the second one is the reason this exists.** A
 * person can be on a POD's roster with no work items at all — newly onboarded,
 * or simply not assigned anything yet. Searching for them matches no *items*
 * anywhere, so an items-only search would report "nowhere" about somebody who
 * plainly exists. The roster is checked too.
 */
import { getStore } from "../db/store/index.ts";
import { escapeRegex, stripControl } from "../db/query/match.ts";
import type { Team } from "../lib/types.ts";

export type PodMatch = {
  teamId: string;
  name: string;
  /** Work items in this POD matching the term. Zero when only the roster matched. */
  items: number;
  /** Roster members whose name matched, so the note can say *why* this POD. */
  people: string[];
};

/**
 * Every POD the caller can see that matches `term`, best first.
 *
 * `teams` is passed in rather than loaded here, because the caller has already
 * scoped it to what this user is allowed to see. Re-loading it would be a
 * second place that decides visibility, and the whole point of one security
 * boundary is that there is only ever one.
 */
export async function findPodsMatching(term: string, teams: Team[]): Promise<PodMatch[]> {
  const clean = stripControl(term).trim();
  if (!clean || !teams.length) return [];

  const store = getStore();
  await store.init();

  const pattern = new RegExp(escapeRegex(clean), "i");
  const visible = new Set(teams.map((t) => t.id));

  /*
   * Item counts per POD, from one pass over what matched. The search itself is
   * the shared predicate, so "found in this POD" means exactly what it means
   * everywhere else on the board.
   */
  const itemCounts = new Map<string, number>();
  for (const item of await store.items.find({ search: clean }, Date.now())) {
    const teamId = String(item.teamId ?? "");
    if (!visible.has(teamId)) continue;
    itemCounts.set(teamId, (itemCounts.get(teamId) ?? 0) + 1);
  }

  const matches: PodMatch[] = [];
  for (const team of teams) {
    const people = (team.members ?? [])
      .map((m) => String(m?.name ?? ""))
      .filter((name) => name && pattern.test(name));
    const items = itemCounts.get(team.id) ?? 0;
    if (!items && !people.length) continue;
    matches.push({ teamId: team.id, name: team.name, items, people });
  }

  /*
   * Most items first, so "the first POD" is the one with the most to show. A
   * roster-only match sorts last — it is a real answer, but a POD holding
   * thirty of this person's bugs is a better one than a POD where they are
   * merely listed.
   */
  return matches.sort((a, b) => b.items - a.items || a.name.localeCompare(b.name));
}
