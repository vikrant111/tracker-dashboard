import { accessibleTeams } from "@/lib/api";
import { errorResponse, requireAdmin, requireUser } from "@/lib/session";
import { saveTeam } from "@/lib/teams";
import type { Team } from "@/lib/types";

export const dynamic = "force-dynamic";

/** PATs never leave the server. */
const redact = (t: Team) => ({ ...t, azure: { ...t.azure, pat: t.azure.pat ? "••••••••" : "" } });

export async function GET() {
  try {
    const user = await requireUser();
    const teams = await accessibleTeams(user);
    return Response.json({ teams: teams.map(redact) });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function POST(req: Request) {
  try {
    await requireAdmin();
    const body = await req.json();
    if (!body.name?.trim()) return Response.json({ error: "POD name is required." }, { status: 400 });
    // A masked PAT coming back from the UI means "leave it alone".
    if (body.azure?.pat?.startsWith("••")) delete body.azure.pat;
    return Response.json({ team: redact(await saveTeam(body)) });
  } catch (err) {
    return errorResponse(err);
  }
}
