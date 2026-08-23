import { canSeeTeam, errorResponse, requireUser } from "@/lib/session";
import { syncAllTeams, syncTeam } from "@/lib/sync";
import { getTeam } from "@/lib/teams";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const { teamId, full } = await req.json().catch(() => ({}) as { teamId?: string; full?: boolean });

    if (!teamId) {
      if (user.role !== "admin") return Response.json({ error: "Admins only." }, { status: 403 });
      return Response.json({ results: await syncAllTeams() });
    }

    if (!canSeeTeam(user, teamId)) return Response.json({ error: "No access to that POD." }, { status: 403 });
    const team = await getTeam(teamId);
    if (!team) return Response.json({ error: "POD not found." }, { status: 404 });

    return Response.json({ results: [await syncTeam(team, { full: !!full })] });
  } catch (err) {
    return errorResponse(err);
  }
}
