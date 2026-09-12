/**
 * The sign-off report.
 *
 * Anyone signed in reads it — knowing what reached the release branch without
 * agreement is not privileged information, it is the point.
 *
 * Recording a sign-off is open to any signed-in user and stores **who**: the
 * value of the record is the name against the tick, and an approval process
 * that only admins can operate is one nobody uses. Withdrawing somebody else's
 * sign-off is admin-only.
 */
import { annotate, listPulls, signOff } from "@/lib/devops/pulls";
import { canEditRecords, refuseEdit } from "@/lib/devops/editors";
import { getUser } from "@/lib/users";
import { errorResponse, requireAdmin, requireUser } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    await requireUser();
    const p = new URL(req.url).searchParams;

    return Response.json({
      pulls: await listPulls({ repoId: p.get("repoId") || undefined, on: p.get("on") || undefined }),
    });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireUser();

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return Response.json({ error: "Send the change as a JSON object." }, { status: 400 });
    }

    const id = String((body as { id?: unknown }).id ?? "");
    if (!id) return Response.json({ error: "Which pull request?" }, { status: 400 });

    /*
     * A change to the row itself rather than to a sign-off. Anyone signed in
     * may make it: the person who shipped the change is the one who knows
     * which environment it reached, and making them ask an admin is how the
     * report goes stale.
     */
    const fields = ["deployedOn", "environment", "ticket", "cycleId", "teamId"] as const;
    if (fields.some((f) => f in (body as object))) {
      /*
       * Correcting a record is for people an admin has chosen. Recording a
       * sign-off below is not — that is somebody putting their own name to
       * something, which is a different act with its own accountability.
       */
      const account = await getUser(user.email);
      if (!canEditRecords({ role: user.role, devopsEditor: account?.devopsEditor })) {
        return Response.json({ error: refuseEdit() }, { status: 403 });
      }

      const patch = Object.fromEntries(
        fields.filter((f) => f in (body as object)).map((f) => [f, (body as Record<string, unknown>)[f]]),
      );
      return Response.json({ pull: await annotate(id, patch) });
    }

    const level = String((body as { level?: unknown }).level ?? "");
    const on = (body as { on?: unknown }).on === true;

    /*
     * Taking back somebody else's sign-off is an admin's job. Anyone may add
     * their own, and anyone may withdraw the one they gave — but a record that
     * a colleague could quietly remove would not be evidence of anything.
     */
    if (!on) {
      const existing = (await listPulls()).find((p) => p.id === id);
      const signer = existing?.signoffs?.[level as "biz" | "qa" | "pod"]?.by;
      if (signer && signer !== user.email) await requireAdmin();
    }

    return Response.json({ pull: await signOff(id, level, on, user.email) });
  } catch (err) {
    return errorResponse(err);
  }
}
