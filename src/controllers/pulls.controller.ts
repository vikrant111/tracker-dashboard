/**
 * Persistence for pull request records.
 *
 * The rules — what a sync may overwrite, who may correct a row — live in
 * `lib/devops/pulls.ts` and `lib/devops/pull-sync.ts`.
 */
import { getStore } from "../db/store/index.ts";
import type { PullRecord } from "../lib/devops/types.ts";
import { sameLink } from "../lib/devops/scope-link.ts";

export async function findPullById(id: string): Promise<PullRecord | null> {
  const store = getStore();
  await store.init();
  // Guard the key: a JSON body can carry an operator where a string belongs.
  if (typeof id !== "string" || !id) return null;
  return store.pulls.byId(id);
}

/**
 * The pull request a scope row came from, if any.
 *
 * The id when the row has one, the URL when it does not. The second case is a
 * row written before rows carried the id, and the reason it is answered here
 * rather than at the call site is that deleting such a row without finding its
 * pull request is the silent data loss this whole path exists to prevent.
 */
export async function findPullForRow(row: { pullId?: string; prUrl?: string }): Promise<PullRecord | null> {
  if (row.pullId) return findPullById(row.pullId);
  if (!row.prUrl) return null;

  const store = getStore();
  await store.init();
  return (await store.pulls.all()).find((pr) => sameLink(row.prUrl, pr.url)) ?? null;
}

export async function savePullDoc(pr: PullRecord): Promise<PullRecord> {
  const store = getStore();
  await store.init();
  return store.pulls.save(pr);
}
