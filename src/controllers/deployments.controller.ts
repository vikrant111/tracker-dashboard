/**
 * Persistence for deployment records.
 *
 * The domain rules — the id, what the form may set, when the sheet is closed —
 * live in `lib/devops/deployments.ts`.
 */
import { getStore } from "../db/store/index.ts";
import type { Deployment } from "../lib/devops/types.ts";

export async function findAllDeployments(): Promise<Deployment[]> {
  const store = getStore();
  await store.init();
  return store.deployments.all();
}

export async function findDeploymentById(id: string): Promise<Deployment | null> {
  const store = getStore();
  await store.init();
  // Guard the key: a JSON body can carry an operator where a string belongs.
  if (typeof id !== "string" || !id) return null;
  return store.deployments.byId(id);
}

export async function saveDeploymentDoc(row: Deployment): Promise<Deployment> {
  const store = getStore();
  await store.init();
  return store.deployments.save(row);
}

export async function deleteDeploymentDoc(id: string): Promise<void> {
  if (typeof id !== "string" || !id) return;
  const store = getStore();
  await store.init();
  await store.deployments.remove(id);
}
