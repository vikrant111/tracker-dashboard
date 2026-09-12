/**
 * What a repository form must satisfy before it is worth sending.
 *
 * Returns the first problem as a sentence, or null. Same contract as
 * `lib/validation.ts`, and the same standing: a courtesy, not a boundary.
 * `saveRepo` parses and clamps everything again, because a client-side check is
 * a suggestion to anyone holding curl.
 *
 * Pure and client-safe, so the checks exercise the shipped rules.
 */
import { LIMITS } from "../constants.ts";
import { FREEZE_METHODS, badBranch, parseRepoUrl } from "./types.ts";

export type RepoDraft = {
  url?: string;
  name?: string;
  releaseBranch?: string;
  developBranch?: string;
  freezeMethod?: string;
  token?: string;
};

export function validateRepo(draft: RepoDraft | null | undefined): string | null {
  if (!draft) return "Nothing to save.";

  const parsed = parseRepoUrl(draft.url);
  if (!parsed) {
    return "Paste the GitHub address of the repository, e.g. https://github.com/acme/3in1cms.";
  }

  const name = String(draft.name ?? "").trim();
  if (name.length > LIMITS.teamName) return `That name is longer than ${LIMITS.teamName} characters.`;

  const release = String(draft.releaseBranch ?? "").trim();
  const develop = String(draft.developBranch ?? "").trim();
  if (badBranch(release)) return "The release branch is not a usable branch name.";
  if (badBranch(develop)) return "The develop branch is not a usable branch name.";

  /*
   * The same branch for both is almost always a mistake, and an expensive one:
   * freezing develop would freeze the branch releases are cut from.
   */
  if (release === develop) return "The release and develop branches are the same. One of them is wrong.";

  const method = String(draft.freezeMethod ?? "");
  if (method && !(FREEZE_METHODS as readonly string[]).includes(method)) return "Pick how a freeze is applied.";

  const token = String(draft.token ?? "");
  if (token.length > LIMITS.githubToken) return "That token is too long.";

  return null;
}
