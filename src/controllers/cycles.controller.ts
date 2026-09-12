/**
 * Persistence for deployment cycles.
 *
 * The domain rules — the id, the scope freeze — live in `lib/devops/cycles.ts`.
 */
import { getStore } from "../db/store/index.ts";
import type { Cycle } from "../lib/devops/types.ts";

export async function findAllCycles(): Promise<Cycle[]> {
  const store = getStore();
  await store.init();
  return store.cycles.all();
}

export async function findCycleById(id: string): Promise<Cycle | null> {
  const store = getStore();
  await store.init();
  // Guard the key: a JSON body can carry an operator where a string belongs.
  if (typeof id !== "string" || !id) return null;
  return store.cycles.byId(id);
}

export async function saveCycleDoc(cycle: Cycle): Promise<Cycle> {
  const store = getStore();
  await store.init();
  return store.cycles.save(cycle);
}

export async function deleteCycleDoc(id: string): Promise<void> {
  if (typeof id !== "string" || !id) return;
  const store = getStore();
  await store.init();
  await store.cycles.remove(id);
}
