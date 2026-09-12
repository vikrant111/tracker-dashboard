/**
 * The repositories the DevOps board tracks.
 *
 * Reading is open to anyone signed in: a member needs to see whether develop is
 * frozen before they try to push to it, and that is the point of the board.
 * Writing is admin-only — onboarding a repo stores a token and decides what a
 * freeze does to a real branch.
 */
import { deleteRepoDoc } from "@/controllers/repos.controller";
import { listRepos, saveRepo, TOKEN_MASK } from "@/lib/devops/repos";
import type { Repo } from "@/lib/devops/types";
import { errorResponse, requireAdmin, requireUser } from "@/lib/session";

export const dynamic = "force-dynamic";

/**
 * The token never leaves the server.
 *
 * Same rule as the Azure PAT on a POD: the browser is shown whether a token is
 * set, never what it is, and sending the mask back means "keep the stored one".
 */
const redact = (r: Repo) => ({ ...r, token: r.token ? TOKEN_MASK : "" });

export async function GET() {
  try {
    await requireUser();
    return Response.json({ repos: (await listRepos()).map(redact) });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function POST(req: Request) {
  try {
    await requireAdmin();

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return Response.json({ error: "Send the repository as a JSON object." }, { status: 400 });
    }

    return Response.json({ repo: redact(await saveRepo(body as Partial<Repo>)) });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function DELETE(req: Request) {
  try {
    await requireAdmin();

    const id = new URL(req.url).searchParams.get("id") ?? "";
    if (!id) return Response.json({ error: "Which repository?" }, { status: 400 });

    await deleteRepoDoc(id);
    return Response.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
