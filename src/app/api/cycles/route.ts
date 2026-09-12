/**
 * Deployment cycles. Anyone signed in reads them; admins create and remove.
 */
import { deleteCycleDoc } from "@/controllers/cycles.controller";
import { listCycles, saveCycle } from "@/lib/devops/cycles";
import type { Cycle } from "@/lib/devops/types";
import { errorResponse, requireAdmin, requireUser } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    await requireUser();
    const repoId = new URL(req.url).searchParams.get("repoId") ?? "";
    return Response.json({ cycles: await listCycles(repoId || undefined) });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function POST(req: Request) {
  try {
    await requireAdmin();

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return Response.json({ error: "Send the cycle as a JSON object." }, { status: 400 });
    }

    return Response.json({ cycle: await saveCycle(body as Partial<Cycle>) });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function DELETE(req: Request) {
  try {
    await requireAdmin();

    const id = new URL(req.url).searchParams.get("id") ?? "";
    if (!id) return Response.json({ error: "Which cycle?" }, { status: 400 });

    await deleteCycleDoc(id);
    return Response.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
