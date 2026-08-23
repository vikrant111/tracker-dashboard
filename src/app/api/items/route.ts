import { filtersFromRequest, intParam } from "@/lib/api";
import { listItems, type ItemSort } from "@/lib/metrics";
import { errorResponse, requireUser } from "@/lib/session";
import { PAGE } from "@/lib/constants";

export const dynamic = "force-dynamic";

const SORTS: ItemSort[] = ["oldest", "newest", "severity"];

export async function GET(req: Request) {
  try {
    const user = await requireUser();
    const filters = await filtersFromRequest(req, user);
    const p = new URL(req.url).searchParams;

    const limit = intParam(p, "limit", { min: 1, max: PAGE.drillMax }) ?? PAGE.drillDefault;
    const requested = p.get("sort") as ItemSort;
    const sort = SORTS.includes(requested) ? requested : "oldest";

    return Response.json(await listItems(filters, limit, sort));
  } catch (err) {
    return errorResponse(err);
  }
}
