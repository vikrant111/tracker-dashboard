import { testConnection } from "@/lib/azure";
import { errorResponse, requireAdmin } from "@/lib/session";
import { getTeam } from "@/lib/teams";

export const dynamic = "force-dynamic";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdmin();
    const { id } = await params;
    const team = await getTeam(id);
    if (!team) return Response.json({ error: "POD not found." }, { status: 404 });
    return Response.json(await testConnection(team));
  } catch (err) {
    return errorResponse(err);
  }
}
