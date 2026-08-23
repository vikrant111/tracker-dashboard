import { filtersFromRequest, accessibleTeams } from "@/lib/api";
import { dashboard } from "@/lib/metrics";
import { startPoller } from "@/lib/poller";
import { errorResponse, requireUser } from "@/lib/session";
import { getSyncState } from "@/lib/sync";

export const dynamic = "force-dynamic";

// The dashboard is the thing that wants live data, so its first request is what
// arms the poller. Idempotent — repeated calls are a no-op.
startPoller();

export async function GET(req: Request) {
  try {
    const user = await requireUser();
    const filters = await filtersFromRequest(req, user);
    const [data, teams] = await Promise.all([dashboard(filters), accessibleTeams(user)]);
    const sync = filters.teamId ? await getSyncState(filters.teamId) : null;

    return Response.json({
      ...data,
      // Team ids are opaque; the dashboard needs names to label the POD roll-up.
      teamNames: Object.fromEntries(teams.map((t) => [t.id, t.name])),
      lastSyncedAt: sync?.lastRunAt ?? null,
      lastSyncResult: sync?.lastResult ?? null,
    });
  } catch (err) {
    return errorResponse(err);
  }
}
