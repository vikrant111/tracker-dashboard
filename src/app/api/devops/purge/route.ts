/**
 * Clearing a period's data, for **both** boards.
 *
 * `GET` counts, `POST` deletes. Admins, plus any account an admin has granted
 * it — and irreversible either way, so the screen counts first and shows what
 * would go before anyone agrees to it.
 *
 * **Counting is gated exactly as deleting is.** A count is a row census of
 * somebody else's data, and leaving it open would let a member ask how many
 * work items a POD has by walking the calendar. The two handlers ask the same
 * question because they are the same secret.
 *
 * The path still says `devops` because that is where it started. It now serves
 * the POD board's work items too: the caller names its own targets, and a
 * screen only ever offers the group it owns.
 *
 * Whether it clears JSON files or a real database is `DB_DRIVER` and nothing
 * here knows which — it goes through the same `Store` the app does.
 */
import { PURGE_TARGETS, countInPeriod, purgePeriod, type PurgeTarget } from "@/lib/devops/purge";
import { describePeriod } from "@/lib/devops/period";
import { canClearData, refuseClear } from "@/lib/devops/editors";
import { errorResponse, requireUser } from "@/lib/session";
import { getUser } from "@/lib/users";
import { HttpError } from "@/lib/http-error";

export const dynamic = "force-dynamic";

/**
 * Whoever is asking, if they may clear data at all.
 *
 * Read from the **stored account**, not the session, so granting somebody the
 * right takes effect on their next request rather than their next sign-in —
 * and revoking it takes effect just as fast, which matters more.
 */
async function requireClearer() {
  const user = await requireUser();
  const account = await getUser(user.email);
  if (!canClearData({ role: user.role, canClearData: account?.canClearData })) {
    throw new HttpError(403, refuseClear());
  }
  return user;
}

/** The scope, from wherever it arrived. Absent means every row in the period. */
const scopeOf = (repoId: unknown, teamId: unknown) => ({
  repoId: String(repoId ?? "").trim() || undefined,
  teamId: String(teamId ?? "").trim() || undefined,
});

export async function GET(req: Request) {
  try {
    await requireClearer();
    const p = new URL(req.url).searchParams;
    const period = p.get("period") ?? "";

    return Response.json({
      period,
      describes: describePeriod(period),
      counts: await countInPeriod(period, scopeOf(p.get("repoId"), p.get("teamId"))),
    });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function POST(req: Request) {
  try {
    await requireClearer();

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
      scopeOf((body as { repoId?: unknown }).repoId, (body as { teamId?: unknown }).teamId),
    );

    return Response.json({ ok: true, ...result });
  } catch (err) {
    return errorResponse(err);
  }
}
