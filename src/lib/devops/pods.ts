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
  /*
   * Guarded on the way in, because this feeds a list React keys by id.
   *
   * `teamIds` should be a clean array — `cleanTeamIds` makes one on every save
   * — but a hand-edited store, or a document written before that existed, can
   * carry a blank, a duplicate or something that is not a string at all. A
   * duplicate is the one that actually breaks: two children with the same key
   * is a React warning today and a wrong row rendered tomorrow.
   */
  const seen = new Set<string>();
  const ids: string[] = [];
  for (const raw of Array.isArray(repo?.teamIds) ? repo.teamIds : []) {
    const id = String(raw ?? "").trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
  }

  const names = teamNames && typeof teamNames === "object" ? teamNames : {};
  const pods = ids.map((id) => ({ id, name: names[id] ?? id }));

  return {
    pods,
    // `teamNames[id] ?? id` rather than a blank: a POD that was deleted still
    // tells the reader more as a slug than as an empty cell.
    podOf: (row) => (row?.teamId ? (names[row.teamId] ?? row.teamId) : ""),
    repoPods: pods.map((p) => p.name).join(", "),
  };
}

/**
 * What a row's POD column should actually show.
 *
 * Three answers, because there are three situations and they are not the same:
 *
 *  - **`own`** — the row says which POD it is for. A name. This is the normal
 *    case and the whole point of the field; a count of one would be worse in
 *    every way.
 *  - **`repo`** — the row predates the field, so the best that can be said is
 *    "one of the repository's". That used to render as every name joined with
 *    commas, which on a repo with five teams is a paragraph in a column
 *    somebody is scanning. A count, with the names one press away.
 *  - **`none`** — the repository is linked to no POD at all.
 *
 * A repo with exactly **one** POD is `own` even when the row does not say so:
 * there was never a choice, so naming it is both correct and shorter than
 * offering to open a dialog containing a single chip.
 *
 * Pure, so both tables ask the same question and get the same answer.
 */
export type PodCell =
  | { kind: "own"; name: string }
  | { kind: "repo"; pods: { id: string; name: string }[] }
  | { kind: "none" };

export function podCell(
  teamId: unknown,
  pods: { id: string; name: string }[] | undefined,
): PodCell {
  const list = (Array.isArray(pods) ? pods : []).filter(
    (p): p is { id: string; name: string } => Boolean(p) && typeof p.id === "string" && p.id.trim() !== "",
  );

  const own = String(teamId ?? "").trim();
  if (own) {
    /*
     * The stored name when the repo still has that POD, the id when it does
     * not. A POD that was deleted tells a reader more as a slug than as a blank
     * cell — the same rule `podOf` follows.
     */
    return { kind: "own", name: list.find((p) => p.id === own)?.name ?? own };
  }

  if (list.length === 0) return { kind: "none" };
  if (list.length === 1) return { kind: "own", name: list[0].name };
  return { kind: "repo", pods: list };
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
