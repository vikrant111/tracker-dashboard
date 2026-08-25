/**
 * Converting between the stored document and the shape the browser sees.
 *
 * Split out of the controller so that file stays about *queries*, and so these
 * can be exercised without a database — everything here is pure.
 *
 * The two shapes genuinely differ: Mongo stores real `Date`s so the aggregation
 * can do arithmetic on them, while `Item` carries ISO strings because that is
 * what crosses the wire. This is the one place that knows.
 */
import type { ItemDoc } from "../db/models/index.ts";
import { DAY_MS } from "../lib/metrics/dates.ts";
import type { ListedItem } from "../lib/metrics/types.ts";
import type { Item } from "../lib/types.ts";

/** An ISO string, or null — never `Invalid Date` leaking to the browser. */
export const iso = (d: Date | string | null | undefined): string | null => {
  if (!d) return null;
  const at = d instanceof Date ? d : new Date(d);
  return Number.isNaN(at.getTime()) ? null : at.toISOString();
};

/**
 * A stored document, back in the domain shape.
 *
 * Every field is coerced rather than trusted. A document written by an older
 * version of the app — or by hand — is missing keys, and an undefined
 * `severity` reaching a chart renders as a blank slice rather than `Unknown`.
 */
export function toItem(doc: Partial<ItemDoc>): Item {
  return {
    id: String(doc.id ?? doc._id ?? ""),
    workItemId: String(doc.workItemId ?? ""),
    teamId: String(doc.teamId ?? ""),
    source: (doc.source ?? "azure") as Item["source"],
    kind: (doc.kind ?? "ticket") as Item["kind"],
    type: String(doc.type ?? ""),
    title: String(doc.title ?? ""),
    url: String(doc.url ?? ""),
    assignee: String(doc.assignee ?? ""),
    assigneeEmail: String(doc.assigneeEmail ?? ""),
    severity: (doc.severity ?? "Unknown") as Item["severity"],
    environment: (doc.environment ?? "Unknown") as Item["environment"],
    status: (doc.status ?? "Unknown") as Item["status"],
    state: String(doc.state ?? ""),
    priority: typeof doc.priority === "number" ? doc.priority : null,
    tags: Array.isArray(doc.tags) ? doc.tags.map(String) : [],
    createdDate: iso(doc.createdDate) ?? "",
    changedDate: iso(doc.changedDate) ?? "",
    closedDate: iso(doc.closedDate),
    isActive: Boolean(doc.isActive),
  };
}

/** The stored shape: real dates, so the aggregation can do arithmetic on them. */
export function toDoc(item: Item): Omit<ItemDoc, "_id"> {
  return {
    ...item,
    createdDate: new Date(item.createdDate),
    changedDate: item.changedDate ? new Date(item.changedDate) : null,
    closedDate: item.closedDate ? new Date(item.closedDate) : null,
  };
}

/** Age in whole days, measured to the close date when there is one. */
export function withAge(item: Item, now: number): ListedItem {
  const end = item.closedDate ? new Date(item.closedDate).getTime() : now;
  const start = new Date(item.createdDate).getTime();
  /*
   * An unparseable stored date would otherwise produce NaN, which serialises to
   * null and renders as an empty cell rather than a zero.
   */
  const days = Number.isFinite(start) ? Math.round((end - start) / DAY_MS) : 0;
  return { ...item, ageDays: Math.max(0, days) };
}
