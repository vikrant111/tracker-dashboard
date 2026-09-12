/**
 * Freezing and unfreezing a cycle's scope sheet.
 *
 * Admin-only, and the only thing that may write `cycle.scope`. Once frozen, the
 * deployment form refuses rows for that cycle — for everyone, the admin who
 * froze it included.
 */
import { findCycleById, saveCycleDoc } from "@/controllers/cycles.controller";
import { LIMITS } from "@/lib/constants";
import { errorResponse, requireAdmin } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAdmin();
    const { id } = await params;

    const cycle = await findCycleById(id);
    if (!cycle) return Response.json({ error: "No such cycle." }, { status: 404 });

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return Response.json({ error: "Send { frozen, reason } as JSON." }, { status: 400 });
    }

    const frozen = (body as { frozen?: unknown }).frozen === true;
    const reason = String((body as { reason?: unknown }).reason ?? "").trim().slice(0, LIMITS.teamDescription);

    const saved = await saveCycleDoc({
      ...cycle,
      scope: {
        frozen,
        changedAt: new Date().toISOString(),
        changedBy: user.email,
        // Kept only while frozen. A stale reason on an open sheet reads as if
        // it were still in force.
        reason: frozen ? reason : "",
      },
      updatedAt: new Date().toISOString(),
    });

    return Response.json({ cycle: saved });
  } catch (err) {
    return errorResponse(err);
  }
}
