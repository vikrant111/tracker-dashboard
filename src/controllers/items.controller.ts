/**
 * Reading and writing work items, through whichever store is configured.
 *
 * Sorting and paging happen here rather than in a driver, for the same reason
 * the aggregation does: one implementation, so the drawer's order and its count
 * cannot depend on which storage is behind it.
 */
import { getStore } from "../db/store/index.ts";
import type { ItemDoc } from "../db/models/index.ts";
import { severityRank } from "../db/query/predicate.ts";
import type { Filters, ItemSort, ListedItem } from "../lib/metrics/types.ts";
import { SEVERITIES, type Item } from "../lib/types.ts";
import { toDoc, toItem, withAge } from "./items.shape.ts";

const time = (d: Date | string | null | undefined): number => {
  if (!d) return 0;
  const at = d instanceof Date ? d : new Date(d);
  const t = at.getTime();
  return Number.isNaN(t) ? 0 : t;
};

/**
 * The drawer's order.
 *
 * Every sort ends with `workItemId`, making it **total**. Without a tiebreak,
 * two items sharing a key can repeat across pages or vanish between them —
 * which shows up as an export with a duplicate row and a missing one.
 */
function compare(sort: ItemSort): (a: ItemDoc, b: ItemDoc) => number {
  const tie = (a: ItemDoc, b: ItemDoc) => String(a.workItemId).localeCompare(String(b.workItemId));
  if (sort === "newest") return (a, b) => time(b.createdDate) - time(a.createdDate) || tie(a, b);
  if (sort === "severity") {
    return (a, b) =>
      severityRank(a, SEVERITIES) - severityRank(b, SEVERITIES) ||
      time(a.createdDate) - time(b.createdDate) ||
      tie(a, b);
  }
  return (a, b) => time(a.createdDate) - time(b.createdDate) || tie(a, b);
}

/**
 * One page of the drill-down, plus the **true** total.
 *
 * The total matters: the drawer pages at 200, so returning only the page would
 * make a 360-item slice claim to be 200 — and the number the reader clicked
 * would disagree with the list they got.
 */
export async function listItems(
  f: Filters,
  size = 100,
  sort: ItemSort = "oldest",
): Promise<{ items: ListedItem[]; total: number }> {
  const store = getStore();
  await store.init();
  const now = Date.now();

  const matched = await store.items.find(f, now);
  matched.sort(compare(sort));
  const page = matched.slice(0, Math.max(1, size));
  return { items: page.map((d) => withAge(toItem(d), now)), total: matched.length };
}

/**
 * Every matching item, a page at a time.
 *
 * Paged rather than returned whole so the export route can stream, and capped
 * so one request cannot decide to serialise an entire instance.
 */
export async function* streamItems(
  f: Filters,
  sort: ItemSort = "oldest",
  cap = 20_000,
  pageSize = 1_000,
): AsyncGenerator<ListedItem[]> {
  const store = getStore();
  await store.init();
  const now = Date.now();

  const matched = await store.items.find(f, now);
  matched.sort(compare(sort));

  for (let i = 0; i < Math.min(matched.length, cap); i += pageSize) {
    yield matched.slice(i, Math.min(i + pageSize, cap)).map((d) => withAge(toItem(d), now));
  }
}

/** Upsert by deterministic id. Returns the number that **failed**. */
export async function bulkUpsertItems(items: Item[]): Promise<number> {
  if (!items.length) return 0;
  const store = getStore();
  await store.init();
  return store.items.bulkUpsert(items.map((item) => ({ ...toDoc(item), _id: item.id }) as ItemDoc));
}

/** One item, by its deterministic id. Used by the webhook's delete path. */
export async function deleteItem(id: string): Promise<void> {
  const store = getStore();
  await store.init();
  await store.items.deleteById(id);
}

/** Everything belonging to a POD, when that POD is deleted. */
export async function deleteItemsForTeam(teamId: string): Promise<number> {
  const store = getStore();
  await store.init();
  return store.items.deleteByTeam(teamId);
}

/** How many items exist. The seed uses it to decide whether to fill. */
export async function countItems(): Promise<number> {
  const store = getStore();
  await store.init();
  return store.items.count();
}

export { toItem, withAge } from "./items.shape.ts";
