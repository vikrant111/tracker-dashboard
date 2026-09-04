/**
 * Upserting and removing a single keyed row.
 *
 * The three small collections — teams, users, sync state — are all "replace the
 * row with this id, or append it", so they share these rather than repeating
 * the same filter-and-push three times.
 */
import { mutate } from "./json-files.ts";

type Named = "teams" | "users" | "sync";

/** Replace the row with this id, or append it. */
export function upsertRow(name: Named, id: string, value: unknown): Promise<void> {
  return mutate<Record<string, unknown>, void>(name, (rows) => {
    const next = rows.filter((r) => String(r._id ?? r.id ?? r.teamId) !== id);
    next.push({ ...(value as Record<string, unknown>), _id: id });
    return { rows: next, result: undefined };
  });
}

export function removeRow(name: Named, id: string): Promise<void> {
  if (typeof id !== "string" || !id) return Promise.resolve();
  return mutate<Record<string, unknown>, void>(name, (rows) => ({
    rows: rows.filter((r) => String(r._id ?? r.id ?? r.teamId) !== id),
    result: undefined,
  }));
}
