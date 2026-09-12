/**
 * Freezing and unfreezing a repository's develop branch.
 *
 * Admin-only, and the only thing that may write `repo.freeze`. The board must
 * never be able to claim a branch is locked when GitHub disagrees, so the state
 * written here is whatever actually happened — including `failed`.
 */
import { findRepoById, saveRepoDoc } from "@/controllers/repos.controller";
import { applyFreeze, githubMode } from "@/lib/devops/github";
import { LIMITS } from "@/lib/constants";
import { errorResponse, requireAdmin } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAdmin();
    const { id } = await params;

    const repo = await findRepoById(id);
    if (!repo) return Response.json({ error: "No such repository." }, { status: 404 });

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return Response.json({ error: "Send { frozen, reason } as JSON." }, { status: 400 });
    }

    const frozen = (body as { frozen?: unknown }).frozen === true;
    const reason = String((body as { reason?: unknown }).reason ?? "").trim().slice(0, LIMITS.teamDescription);

    /*
     * A reason is required to freeze, not to unfreeze. Everyone blocked by a
     * freeze needs to know why and roughly for how long; nobody needs an
     * explanation for being unblocked.
     */
    if (frozen && !reason) {
      return Response.json({ error: "Say why you are freezing it. Everyone blocked by this will read it." }, { status: 400 });
    }

    const outcome = await applyFreeze(repo, frozen, repo.freeze.rulesetId || undefined);

    const saved = await saveRepoDoc({
      ...repo,
      freeze: {
        // A refusal leaves the branch where it was, so the board says so rather
        // than claiming the change it failed to make.
        state: outcome.ok ? (frozen ? "frozen" : "open") : "failed",
        changedAt: new Date().toISOString(),
        changedBy: user.email,
        reason: frozen ? reason : "",
        detail: outcome.detail,
        rulesetId: outcome.rulesetId ?? (frozen ? repo.freeze.rulesetId : ""),
      },
    });

    return Response.json({
      repo: { ...saved, token: saved.token ? "••••••••" : "" },
      dryRun: outcome.dryRun,
      mode: githubMode(),
      calls: outcome.calls,
      ok: outcome.ok,
    });
  } catch (err) {
    return errorResponse(err);
  }
}
