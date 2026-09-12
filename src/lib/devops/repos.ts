/**
 * What a repository is, before it is stored.
 *
 * Onboarding is a form somebody pastes a URL into, so this is forgiving about
 * the input and strict about the result: whatever they paste is resolved to an
 * `owner` and a `repo`, and everything else is defaulted or clamped.
 */
import { HttpError } from "../http-error.ts";
import { LIMITS } from "../constants.ts";
import { findAllRepos, findRepoById, saveRepoDoc } from "../../controllers/repos.controller.ts";
import { FREEZE_METHODS, cleanBranch, parseRepoUrl, repoId, repoUrlFor, type FreezeMethod, type Repo } from "./types.ts";

/** What a masked token looks like coming back from the browser. */
export const TOKEN_MASK = "••••••••";

const text = (value: unknown, max: number) => String(value ?? "").trim().slice(0, max);

/** A clean list of POD ids: strings, trimmed, deduplicated, no blanks. */
export function cleanTeamIds(value: unknown): string[] {
  const list = Array.isArray(value) ? value : typeof value === "string" ? [value] : [];
  const seen = new Set<string>();

  for (const raw of list) {
    const id = String(raw ?? "").trim().slice(0, 80);
    if (id) seen.add(id);
  }
  return [...seen].slice(0, 50);
}

/**
 * A stored repo with the single `teamId` it used to carry folded into the list
 * it carries now.
 *
 * Applied on **read**, not only on save. `saveRepo` migrates too, but a repo
 * nobody has edited since the change would read as unlinked everywhere until
 * somebody happened to open and save it — and "the PODs vanished" is worse than
 * the problem the change was for.
 *
 * Pure, so the migration is checked by running it rather than by matching the
 * shape of the code that does it.
 */
export function withTeamIds<T extends { teamIds?: string[] }>(repo: T | null): T | null {
  if (!repo) return null;
  if (repo.teamIds?.length) return repo;

  const legacy = String((repo as { teamId?: unknown }).teamId ?? "").trim();
  return legacy ? { ...repo, teamIds: [legacy] } : repo;
}

/** The single `teamId` a repo carried before this was a list. */
const legacyTeamId = (input: unknown, existing: unknown): string[] => {
  const from = (o: unknown) => String((o as { teamId?: unknown })?.teamId ?? "").trim();
  const id = from(input) || from(existing);
  return id ? [id] : [];
};

const method = (value: unknown): FreezeMethod =>
  (FREEZE_METHODS as readonly string[]).includes(String(value)) ? (value as FreezeMethod) : "ruleset";

export async function listRepos(): Promise<Repo[]> {
  const repos = await findAllRepos();
  return repos.sort((a, b) => a.name.localeCompare(b.name));
}

export const getRepo = (id: string) => findRepoById(id);

/**
 * Create or update a repository.
 *
 * The id comes from `owner/repo`, so onboarding the same repository twice is an
 * update. That is deliberate: the alternative is two rows for one repo, each
 * with its own freeze state, and no way to tell which one is telling the truth.
 */
export async function saveRepo(input: Partial<Repo> & { id?: string }): Promise<Repo> {
  /*
   * The URL wins when it parses, because it is the field people actually fill
   * in. Owner and repo are the fallback for a caller that knows the shape.
   */
  const parsed = parseRepoUrl(input.url) ?? parseRepoUrl(`${input.owner ?? ""}/${input.repo ?? ""}`);
  if (!parsed) {
    throw new HttpError(400, "That is not a GitHub repository URL. Paste the address of the repo, e.g. https://github.com/acme/3in1cms.");
  }

  const owner = text(parsed.owner, 100);
  const repo = text(parsed.repo, 100);
  const id = input.id || repoId(owner, repo);
  if (!id) throw new HttpError(400, "Could not work out an id for that repository.");

  const existing = await findRepoById(id);

  /*
   * A masked token means "keep the one you have". The form never receives the
   * real value, so sending the mask back must not overwrite the secret with
   * eight bullet characters — which is what a plain assignment would do.
   */
  const incoming = String(input.token ?? "");
  const token = !incoming || incoming.startsWith("••") ? (existing?.token ?? "") : incoming.trim().slice(0, LIMITS.githubToken);

  const next: Repo = {
    id,
    name: text(input.name, LIMITS.teamName) || repo,
    owner,
    repo,
    url: text(input.url, LIMITS.repoUrl) || repoUrlFor(owner, repo),
    releaseBranch: cleanBranch(input.releaseBranch ?? existing?.releaseBranch, "release"),
    developBranch: cleanBranch(input.developBranch ?? existing?.developBranch, "develop"),
    /*
     * Migrated on read as well as written: a repo onboarded before this was a
     * list still has a single `teamId`, and dropping it would silently unlink
     * every repository somebody had already assigned.
     */
    teamIds: cleanTeamIds(input.teamIds ?? existing?.teamIds ?? legacyTeamId(input, existing)),
    token,
    freezeMethod: method(input.freezeMethod ?? existing?.freezeMethod),
    /*
     * Freeze state is never taken from the form. It is written only by the
     * freeze route, which knows whether GitHub actually agreed — a form that
     * could set it would let the board claim a branch was locked when it was not.
     */
    freeze: existing?.freeze ?? { state: "open", changedAt: "", changedBy: "", reason: "", detail: "", rulesetId: "" },
    createdAt: existing?.createdAt ?? new Date().toISOString(),
  };

  return saveRepoDoc(next);
}
