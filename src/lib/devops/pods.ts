/**
 * Which PODs a repository has, and which one a row is for.
 *
 * Pure, so the naming is checked without a browser — and shared, so the form's
 * picker and the table's column can never offer and show different things.
 */
import type { Deployment, Repo } from "./types.ts";

export function podsOfRepo(
  repo: Pick<Repo, "teamIds"> | undefined,
  teamNames: Record<string, string>,
): {
  /** The PODs a row on this repo may belong to. */
  pods: { id: string; name: string }[];
  /** The POD a row says it is for, as a name. */
  podOf: (row: Pick<Deployment, "teamId">) => string;
  /** All of the repo's PODs, for a row filled in before rows had their own. */
  repoPods: string;
} {
  const pods = (repo?.teamIds ?? []).map((id) => ({ id, name: teamNames[id] ?? id }));

  return {
    pods,
    // `teamNames[id] ?? id` rather than a blank: a POD that was deleted still
    // tells the reader more as a slug than as an empty cell.
    podOf: (row) => (row?.teamId ? (teamNames[row.teamId] ?? row.teamId) : ""),
    repoPods: pods.map((p) => p.name).join(", "),
  };
}

/**
 * The POD a row is for: the one chosen, if the repo really has it.
 *
 * Falls back to the repo's only POD when there is exactly one — there is
 * nothing to choose then, and making somebody pick it is friction for no
 * decision. Falls back to blank when the repo has several and none was chosen,
 * because guessing which team owns a change is exactly the wrong thing to do.
 */
export function pickTeam(chosen: unknown, repoTeams: string[] | undefined): string {
  const teams = Array.isArray(repoTeams) ? repoTeams : [];
  const want = String(chosen ?? "").trim();

  if (want && teams.includes(want)) return want;
  return teams.length === 1 ? teams[0] : "";
}
