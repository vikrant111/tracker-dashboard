import { IDX, ensureIndices, search } from "../opensearch.ts";
import type { Item } from "../types.ts";
import { PAGE } from "../constants.ts";
import type { Filters, ItemSort, ListedItem } from "./types.ts";
import { buildQuery } from "./query.ts";
import { DAY_MS } from "./dates.ts";
import { SEVERITY_RANK_SCRIPT } from "./aggregations.ts";

/**
 * The drill-down: a page of items, plus the **true** total.
 *
 * The total matters. The drawer pages at 200, so returning only the page would
 * make a 360-item slice claim to be 200 — and the number the reader clicked
 * would disagree with the list they got.
 */
const SORTS: Record<ItemSort, object[]> = {
  oldest: [{ createdDate: "asc" }],
  newest: [{ createdDate: "desc" }],
  // Keyword field, so severity cannot sort by rank on its own — order the
  // buckets explicitly, then oldest first inside each.
  severity: [
    { _script: { type: "number", order: "asc", script: SEVERITY_RANK_SCRIPT } },
    { createdDate: "asc" },
  ],
};

/**
 * Drill-down list behind every expandable tile. Returns the page plus the true
 * total, so a capped list can say so instead of implying the cap is the count.
 */
/**
 * Every matching item, a page at a time.
 *
 * `listItems` asks for `size` in one request, and OpenSearch refuses any
 * `from + size` above `index.max_result_window` — 10,000 by default. That is not
 * a large-board problem: a `size` of 20,000 is rejected outright even when the
 * index holds 360 documents, which is exactly how the export came back as a 500
 * wearing a `.json` filename.
 *
 * `search_after` walks the result set with no window at all. The sort gets
 * `workItemId` appended so the order is **total** — with ties, two documents
 * sharing a sort key can repeat across pages or be skipped between them.
 */
export async function* streamItems(
  f: Filters,
  sort: ItemSort = "oldest",
  cap = 20_000,
  pageSize = 1_000,
): AsyncGenerator<ListedItem[]> {
  await ensureIndices();
  const order = [...(SORTS[sort] ?? SORTS.oldest), { workItemId: "asc" }];
  const now = Date.now();

  let after: unknown[] | undefined;
  let sent = 0;

  while (sent < cap) {
    const size = Math.min(pageSize, cap - sent);
    const body = await search<Item>(IDX.items, {
      size,
      query: buildQuery(f, now),
      sort: order,
      ...(after ? { search_after: after } : {}),
    });

    const hits = body.hits.hits;
    if (!hits.length) return;

    yield hits.map((h) => withAge(h._source, now));
    sent += hits.length;

    after = hits[hits.length - 1]?.sort;
    // No cursor means the sort was not returned, and continuing would re-request
    // the same page forever.
    if (!after || hits.length < size) return;
  }
}

/** Age in whole days, measured to the close date when there is one. */
function withAge(item: Item, now: number): ListedItem {
  const end = item.closedDate ? new Date(item.closedDate).getTime() : now;
  return { ...item, ageDays: Math.max(0, Math.round((end - new Date(item.createdDate).getTime()) / DAY_MS)) };
}

export async function listItems(
  f: Filters,
  size = 100,
  sort: ItemSort = "oldest",
): Promise<{ items: ListedItem[]; total: number }> {
  await ensureIndices();
  const body = await search<Item>(IDX.items, {
    size,
    track_total_hits: true,
    query: buildQuery(f),
    sort: SORTS[sort] ?? SORTS.oldest,
  });
  const now = Date.now();
  const items = body.hits.hits.map((h) => {
    const item = h._source;
    const end = item.closedDate ? new Date(item.closedDate).getTime() : now;
    return { ...item, ageDays: Math.max(0, Math.round((end - new Date(item.createdDate).getTime()) / DAY_MS)) };
  });
  return { items, total: body.hits.total.value ?? items.length };
}
