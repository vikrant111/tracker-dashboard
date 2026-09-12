/**
 * Read a repository's merged pull requests from GitHub.
 *
 * Admin-only: it spends the repository's rate limit and writes rows everyone
 * else reads.
 *
 * Not gated by `GITHUB_MODE`. That switch stops this app *changing* anything on
 * GitHub; listing pull requests changes nothing, and a report that refused to
 * read until live mode was on would be a report nobody could use. What gates it
 * is the token.
 */
import { findRepoById } from "@/controllers/repos.controller";
import { syncPulls } from "@/lib/devops/pulls";
import { errorResponse, requireAdmin } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    await requireAdmin();

    const body = await req.json().catch(() => null);
    const repoId = String((body as { repoId?: unknown })?.repoId ?? "");
    if (!repoId) return Response.json({ error: "Which repository?" }, { status: 400 });

    const repo = await findRepoById(repoId);
    if (!repo) return Response.json({ error: "No such repository." }, { status: 404 });

    // The branch is optional: without one this reads the repo's release branch,
    // which is what it always did.
    const branch = String((body as { branch?: unknown })?.branch ?? "");
    const outcome = await syncPulls(repo, Date.now(), branch || undefined);
    return Response.json({ ok: outcome.ok, detail: outcome.detail, stored: outcome.stored });
  } catch (err) {
    return errorResponse(err);
  }
}
