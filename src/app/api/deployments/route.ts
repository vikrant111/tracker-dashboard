/**
 * The scope sheet: one row per bug or hotfix going out.
 *
 * **Members fill this in.** It is the one thing on the DevOps board they write,
 * because they are the people who know what their change is and which branch it
 * is on. Deleting is admin-only, and a frozen cycle refuses everything.
 */
import { deleteDeploymentDoc, findDeploymentById } from "@/controllers/deployments.controller";
import { findCycleById } from "@/controllers/cycles.controller";
import { refuseIfScopeFrozen } from "@/lib/devops/cycles";
import { refuseRemoval, returnedPull } from "@/lib/devops/return-to-report";
import { findPullForRow, savePullDoc } from "@/controllers/pulls.controller";
import { listDeployments, saveDeployment } from "@/lib/devops/deployments";
import type { Deployment } from "@/lib/devops/types";
import { errorResponse, requireAdmin, requireUser } from "@/lib/session";
import { getUser } from "@/lib/users";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    await requireUser();
    const p = new URL(req.url).searchParams;

    return Response.json({
      deployments: await listDeployments({
        repoId: p.get("repoId") || undefined,
        cycleId: p.get("cycleId") || undefined,
        environment: p.get("environment") || undefined,
        branch: p.get("branch") || undefined,
        on: p.get("on") || undefined,
      }),
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
      return Response.json({ error: "Send the row as a JSON object." }, { status: 400 });
    }

    /*
     * Read from the stored account, not the session: granting somebody editor
     * rights takes effect on their next request rather than their next sign-in.
     */
    const account = await getUser(user.email);
    return Response.json({
      deployment: await saveDeployment(body as Partial<Deployment>, user.email, {
        role: user.role,
        devopsEditor: account?.devopsEditor,
      }),
    });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function DELETE(req: Request) {
  try {
    const user = await requireAdmin();

    const url = new URL(req.url);
    const id = url.searchParams.get("id") ?? "";
    if (!id) return Response.json({ error: "Which row?" }, { status: 400 });

    /*
     * The remark comes in the body when there is one. DELETE may carry a body,
     * and a paragraph explaining a decision does not belong in a URL.
     */
    const body = await req.json().catch(() => null);
    const remarks = String((body as { remarks?: unknown })?.remarks ?? url.searchParams.get("remarks") ?? "");

    /*
     * A frozen sheet refuses deletes too. Freezing scope that could still be
     * emptied one row at a time would not be a freeze.
     */
    let handedBack = false;
    const row = await findDeploymentById(id);
    if (row) {
      const shut = refuseIfScopeFrozen(await findCycleById(row.cycleId));
      if (shut) return Response.json({ error: shut }, { status: 409 });

      /*
       * A row that came from a pull request is not simply deleted: the pull
       * request goes back to the sign-off report carrying the reason, so
       * whoever moved it knows whether to fix something or pull the code out
       * of the release branch.
       *
       * Found before the remark is judged, because whether one is owed depends
       * on whether there is anybody to read it. A row written before rows
       * carried the id is matched on its URL instead — deleting one of those
       * silently is the failure this path exists to prevent.
       */
      const pr = await findPullForRow(row);

      const needsWhy = refuseRemoval({ pullId: pr?.id }, remarks);
      if (needsWhy) return Response.json({ error: needsWhy }, { status: 400 });

      if (pr) {
        await savePullDoc(returnedPull(pr, user.email, remarks, new Date().toISOString()));
        handedBack = true;
      }
    }

    await deleteDeploymentDoc(id);
    return Response.json({ ok: true, returned: handedBack });
  } catch (err) {
    return errorResponse(err);
  }
}
