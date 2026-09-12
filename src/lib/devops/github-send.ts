/**
 * One request to GitHub, and what to say when it fails.
 *
 * Split from `github.ts` so that file decides *what* to do and this one sends
 * it. The mapping below is most of the value here: GitHub's statuses are terse
 * in ways that send people looking in the wrong place, and a 404 that really
 * means "your token cannot see this repository" is the worst of them.
 */
import { HttpError } from "../http-error.ts";
import type { Call } from "./github-plan.ts";
import { githubApi, scrub } from "./github-config.ts";

type Where = { owner: string; repo: string };

/**
 * What GitHub said, as something worth reading.
 *
 * Pure, so every branch is checked without a network.
 */
export function explain(status: number, body: string, where: Where): string {
  const what = `${where.owner}/${where.repo}`;

  if (status === 401) return "GitHub refused the token. It is wrong, expired, or revoked.";

  if (status === 403) {
    return /rate limit/i.test(body)
      ? "GitHub's rate limit is reached. Try again shortly."
      : `The token cannot administer ${what}. Branch rules need admin rights on the repository.`;
  }

  if (status === 404) {
    // GitHub answers 404, not 403, when a token cannot see a private repo at
    // all. "Not found" on its own sends people hunting for a typo in the name.
    return `${what} was not found, or the token cannot see it. A private repository needs a token with access to it.`;
  }

  if (status === 422) {
    // The one status where GitHub's own message is the useful part: it names
    // the field it did not like.
    return `GitHub rejected the request as invalid: ${body.slice(0, 200)}`;
  }

  if (status >= 500) return `GitHub is having trouble (${status}). This is their side, not yours.`;

  return `GitHub answered ${status}: ${body.slice(0, 200)}`;
}

/** Send one call. Returns the parsed body, or throws with a readable message. */
export async function send(call: Call, token: string, where: Where): Promise<unknown> {
  let res: Response;

  try {
    res = await fetch(`${githubApi()}${call.path}`, {
      method: call.method,
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "X-GitHub-Api-Version": "2022-11-28",
        "Content-Type": "application/json",
      },
      body: call.body === undefined ? undefined : JSON.stringify(call.body),
    });
  } catch (err) {
    // Never reached GitHub at all: no network, DNS, a proxy in the way. Worth
    // distinguishing from a refusal — the fixes have nothing in common.
    throw new HttpError(502, scrub(`Could not reach GitHub: ${err instanceof Error ? err.message : err}`, token));
  }

  const text = await res.text().catch(() => "");
  if (!res.ok) throw new HttpError(502, scrub(explain(res.status, text, where), token));

  try {
    return text ? JSON.parse(text) : null;
  } catch {
    // A 200 with a body we cannot read is still a success; the callers that
    // care about the body check for what they need and fall back.
    return null;
  }
}
