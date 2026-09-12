/**
 * Moving a merged pull request onto a scope sheet.
 *
 * **The sheet is the one the pull request is assigned to.** The cycle comes off
 * the stored record, not off the request body — a browser does not get to pick
 * which release a change is recorded against. A body that names a different
 * cycle is refused rather than obeyed, so an old tab cannot quietly file
 * something under the wrong release.
 *
 * The refusal is one shared function, so the disabled button and the API give
 * the same answer for the same reason. A button that says "you cannot" while
 * the server would have allowed it — or the reverse — is worse than either.
 */
import { savePullDoc } from "@/controllers/pulls.controller";
import { findPullOnSheets } from "@/lib/devops/pulls";
import { findCycleById } from "@/controllers/cycles.controller";
import { findRepoById } from "@/controllers/repos.controller";
import { saveDeployment } from "@/lib/devops/deployments";
import { canEditRecords } from "@/lib/devops/editors";
import { DEVOPS_MESSAGES } from "@/lib/devops/constants";
import { refuseMoveToScope } from "@/lib/devops/to-scope";
import { errorResponse, requireUser } from "@/lib/session";
import { getUser } from "@/lib/users";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const user = await requireUser();

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return Response.json({ error: "Send { id } as JSON." }, { status: 400 });
    }

    const id = String((body as { id?: unknown }).id ?? "").trim();
    /* Optional, and only ever checked against the record. See the header. */
    const asked = String((body as { cycleId?: unknown }).cycleId ?? "").trim();

    /*
     * Permission before the lookup, deliberately.
     *
     * Answering "no such pull request" to somebody who may not act on one
     * either way both tells them something they have no right to know and
     * sends them chasing a missing row instead of asking for access.
     */
    const account = await getUser(user.email);
    const canEdit = canEditRecords({ role: user.role, devopsEditor: account?.devopsEditor });
    if (!canEdit) return Response.json({ error: refuseMoveToScope(null, null, false) }, { status: 403 });

    if (!id) return Response.json({ error: "Which pull request?" }, { status: 400 });

    /*
     * Read with "already on a sheet" worked out from the sheets rather than
     * taken off the stored flag. Reading the record raw is what made the button
     * and the API disagree: the report showed a movable pull request and this
     * refused it as already there.
     */
    const pr = await findPullOnSheets(id);
    if (!pr) return Response.json({ error: "No such pull request on this board." }, { status: 404 });

    /*
     * The cycle the pull request carries — the only one it may move onto.
     * A blank one is not an error here; `refuseMoveToScope` turns it into the
     * sentence that tells somebody to set the field.
     */
    const cycleId = String(pr.cycleId ?? "").trim();
    const cycle = cycleId ? await findCycleById(cycleId) : null;

    /*
     * A body naming a different sheet is refused, not silently overridden.
     * Obeying it would break the rule this route exists for; ignoring it
     * without a word would leave somebody watching a move land somewhere they
     * did not ask for.
     */
    if (asked && cycleId && asked !== cycleId) {
      return Response.json({ error: DEVOPS_MESSAGES.moveCycleMismatch(cycle?.name ?? cycleId) }, { status: 409 });
    }

    const refusal = refuseMoveToScope(pr, cycle, canEdit);
    if (refusal) return Response.json({ error: refusal }, { status: 409 });

    const repo = await findRepoById(pr.repoId);

    /*
     * The row is built from what the pull request already knows, so nobody
     * retypes a title that is one click away and gets it subtly different.
     */
    const deployment = await saveDeployment(
      {
        repoId: pr.repoId,
        cycleId,
        teamId: pr.teamId,
        kind: "bug",
        state: pr.deployedOn ? "deployed" : "planned",
        ticket: pr.ticket,
        title: pr.title,
        prUrl: pr.url,
        pullId: pr.id,
        branch: pr.baseBranch || repo?.releaseBranch,
        environment: pr.environment,
        deployedOn: pr.deployedOn,
        notes: `Moved from pull request #${pr.number}.`,
      },
      user.email,
      { role: user.role, devopsEditor: account?.devopsEditor },
    );

    /*
     * Marked as moved, and any remark from a previous removal cleared — it
     * described a problem that has just been dealt with, and leaving it would
     * have the report complaining about something already fixed.
     */
    await savePullDoc({ ...pr, movedToScope: true, returned: { at: "", by: "", remarks: "" } });

    return Response.json({ deployment, cycle: cycle ? { id: cycle.id, name: cycle.name } : null });
  } catch (err) {
    return errorResponse(err);
  }
}
