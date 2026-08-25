/**
 * The dashboard's public surface.
 *
 * A façade: the aggregation itself lives in `controllers/dashboard.controller`,
 * and this file exists so that everything importing `@/lib/metrics` — routes,
 * components, the check suites — kept working across the move from OpenSearch
 * to MongoDB without a single call site changing.
 */
export type {
  Bucket,
  Dashboard,
  Filters,
  AssigneeStat,
  TeamStat,
  TrendPoint,
  ListedItem,
  ItemSort,
} from "./metrics/types.ts";

export { getDashboard as dashboard } from "../controllers/dashboard.controller.ts";
export { listItems, streamItems } from "../controllers/items.controller.ts";

/**
 * The shared filter builder.
 *
 * Still exported under its original name: it is what guarantees a bar and the
 * drawer it opens cannot disagree, and the checks assert on it directly.
 */
export { buildMatch as buildQuery } from "../db/query/match.ts";
