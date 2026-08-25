/**
 * Reading and writing work items.
 *
 * The drill-down behind every clickable number lives here, along with the bulk
 * upsert every import path funnels into. Conversion between the stored document
 * and the domain shape is in `items.shape.ts`.
 */
import type { PipelineStage } from "mongoose";
import { connectToDatabase } from "../db/connect.ts";
import { ItemModel, type ItemDoc } from "../db/models/index.ts";
import { buildMatch } from "../db/query/match.ts";
import { SEVERITY_RANK } from "../db/query/stages.ts";
import type { Filters, ItemSort, ListedItem } from "../lib/metrics/types.ts";
import type { Item } from "../lib/types.ts";
import { toDoc, toItem, withAge } from "./items.shape.ts";

/** How the drawer can be ordered. `severity` needs a computed rank, not a string sort. */
const SORTS: Record<ItemSort, Record<string, 1 | -1>> = {
  oldest: { createdDate: 1 },
  newest: { createdDate: -1 },
  severity: { severityRank: 1, createdDate: 1 },
};

/**
 * The sort stage, and the rank field it may need.
 *
 * The rank is only added for the severity sort, because an `$addFields` on
 * every query costs a pass over the result set for the two sorts that ignore it.
 */
function sortPipeline(sort: ItemSort): PipelineStage.FacetPipelineStage[] {
  const order = SORTS[sort] ?? SORTS.oldest;
  const stages: PipelineStage.FacetPipelineStage[] = [];
  if (sort === "severity") stages.push({ $addFields: { severityRank: SEVERITY_RANK } });
  /*
   * `workItemId` breaks ties, making the order **total**. Without it, two
   * documents sharing a sort key can repeat across pages or be skipped between
   * them — which surfaces as an export with a duplicate row and a missing one.
   */
  stages.push({ $sort: { ...order, workItemId: 1 as const } });
  return stages;
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
  await connectToDatabase();
  const now = Date.now();

  /*
   * Page and count in one round trip, over the same match. Two separate calls
   * could straddle a write and report a total the page contradicts.
   */
  const [result] = await ItemModel.aggregate([
    { $match: buildMatch(f, now) },
    {
      $facet: {
        rows: [...sortPipeline(sort), { $limit: Math.max(1, size) }],
        total: [{ $count: "n" }],
      },
    },
  ]);

  const rows = (result?.rows ?? []) as ItemDoc[];
  const items = rows.map((d) => withAge(toItem(d), now));
  return { items, total: result?.total?.[0]?.n ?? items.length };
}

/**
 * Every matching item, a page at a time.
 *
 * A cursor, not `skip`/`limit`: `skip` re-walks the collection from the start
 * on every page, so exporting a large board degrades quadratically. A cursor is
 * flat, and there is no result-window ceiling of the kind that once made the
 * export return a 500 wearing a `.json` filename.
 */
export async function* streamItems(
  f: Filters,
  sort: ItemSort = "oldest",
  cap = 20_000,
  pageSize = 1_000,
): AsyncGenerator<ListedItem[]> {
  await connectToDatabase();
  const now = Date.now();

  const cursor = ItemModel.aggregate([{ $match: buildMatch(f, now) }, ...sortPipeline(sort)]).cursor({
    batchSize: pageSize,
  });

  let batch: ListedItem[] = [];
  let sent = 0;

  try {
    for await (const doc of cursor) {
      batch.push(withAge(toItem(doc as ItemDoc), now));
      sent++;
      if (batch.length >= pageSize) {
        yield batch;
        batch = [];
      }
      if (sent >= cap) break;
    }
  } finally {
    /*
     * Closed in `finally`, so an aborted download closes it too. A caller that
     * stops reading leaves the server-side cursor open until it times out, and
     * a handful of those exhausts the cursor limit on a shared Atlas tier.
     */
    await cursor.close().catch(() => {});
  }
  if (batch.length) yield batch;
}

/**
 * Upsert by deterministic id. Returns the number that **failed**.
 *
 * `ordered: false` so one bad document does not abandon the rest of the batch —
 * a single unparseable row in a 500-row spreadsheet should cost you that row,
 * not the import.
 */
export async function bulkUpsertItems(items: Item[]): Promise<number> {
  if (!items.length) return 0;
  await connectToDatabase();

  const operations = items.map((item) => ({
    replaceOne: {
      filter: { _id: item.id },
      replacement: { ...toDoc(item), _id: item.id },
      upsert: true,
    },
  }));

  try {
    const res = await ItemModel.bulkWrite(operations, { ordered: false });
    const written = (res.upsertedCount ?? 0) + (res.modifiedCount ?? 0) + (res.matchedCount ?? 0);
    return Math.max(0, items.length - written);
  } catch (err) {
    /*
     * An unordered bulkWrite that partially fails *throws* while still having
     * written the good documents. The error carries the failures, so the count
     * is recoverable — treating the throw as "all failed" would report a
     * successful 499-row import as a total loss.
     */
    const failures = (err as { writeErrors?: unknown[] })?.writeErrors;
    if (Array.isArray(failures)) return failures.length;
    throw err;
  }
}

/** One item, by its deterministic id. Used by the webhook's delete path. */
export async function deleteItem(id: string): Promise<void> {
  await connectToDatabase();
  if (typeof id !== "string" || !id) return;
  await ItemModel.deleteOne({ _id: id });
}

/** Everything belonging to a POD, when that POD is deleted. */
export async function deleteItemsForTeam(teamId: string): Promise<number> {
  await connectToDatabase();
  if (typeof teamId !== "string" || !teamId) return 0;
  const res = await ItemModel.deleteMany({ teamId });
  return res.deletedCount ?? 0;
}

/** How many items exist. The seed uses it to decide whether to fill. */
export async function countItems(filter: Record<string, unknown> = {}): Promise<number> {
  await connectToDatabase();
  return ItemModel.countDocuments(filter);
}

export { toItem, withAge } from "./items.shape.ts";
