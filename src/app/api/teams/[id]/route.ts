import { errorResponse, requireAdmin } from "@/lib/session";
import { deleteTeam, getTeam } from "@/lib/teams";

export const dynamic = "force-dynamic";

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdmin();
    const { id } = await params;
    if (!(await getTeam(id))) return Response.json({ error: "POD not found." }, { status: 404 });
    await deleteTeam(id);
    return Response.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
