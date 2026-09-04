import { accessibleTeams } from "@/lib/api";
import { findPodsMatching } from "@/controllers/search.controller";
import { LIMITS } from "@/lib/constants";
import { errorResponse, requireUser } from "@/lib/session";

export const dynamic = "force-dynamic";

/**
 * Where does this search find anything?
 *
 * The dashboard asks this when a search is typed, so it can move the reader to
 * the POD that actually holds the answer instead of showing them an empty board
 * and leaving them to guess which POD to try next.
 *
 * **Scoped like everything else.** `accessibleTeams` is the only source of what
 * this user may see, and the matcher is handed that list rather than loading
 * its own — otherwise this becomes a second place that decides visibility, and
 * a neat way to discover the names of PODs you have no access to.
 */
export async function GET(req: Request) {
  try {
    const user = await requireUser();
    const teams = await accessibleTeams(user);

    const raw = new URL(req.url).searchParams.get("q") ?? "";
    const term = raw.slice(0, LIMITS.search).trim();

    // Nothing typed is not an error; it simply matches nothing.
    if (!term) return Response.json({ term: "", matches: [] });

    return Response.json({ term, matches: await findPodsMatching(term, teams) });
  } catch (err) {
    return errorResponse(err);
  }
}
