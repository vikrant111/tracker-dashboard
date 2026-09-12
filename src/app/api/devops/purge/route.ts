/**
 * Clearing a period's data.
 *
 * `GET` counts, `POST` deletes. Admin-only, and irreversible — there is no undo
 * anywhere in this app, so the screen counts first and shows what would go
 * before anyone agrees to it.
 */
import { PURGE_TARGETS, countInPeriod, purgePeriod, type PurgeTarget } from "@/lib/devops/purge";
import { describePeriod } from "@/lib/devops/period";
import { errorResponse, requireAdmin } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    await requireAdmin();
    const p = new URL(req.url).searchParams;
    const period = p.get("period") ?? "";

    return Response.json({
      period,
      describes: describePeriod(period),
      counts: await countInPeriod(period, p.get("repoId") || undefined),
    });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function POST(req: Request) {
  try {
    await requireAdmin();

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return Response.json({ error: "Send { period, targets } as JSON." }, { status: 400 });
    }

    const asked = (body as { targets?: unknown }).targets;
    /*
     * The caller has to name what it is clearing. Defaulting to everything
     * would turn a malformed request into the most destructive one available.
     */
    const targets = (Array.isArray(asked) ? asked : []).filter((t): t is PurgeTarget =>
      (PURGE_TARGETS as readonly string[]).includes(String(t)),
    );

    const result = await purgePeriod(
      (body as { period?: unknown }).period,
      targets,
      String((body as { repoId?: unknown }).repoId ?? "") || undefined,
    );

    return Response.json({ ok: true, ...result });
  } catch (err) {
    return errorResponse(err);
  }
}
