/**
 * A deployment cycle, and whether its scope is still open.
 *
 * Scope belongs to a cycle rather than to a repository: "what is in 2026.09" is
 * a different list from "what is in 2026.10", and agreeing one must not close
 * the other.
 */
import { HttpError } from "../http-error.ts";
import { LIMITS } from "../constants.ts";
import { findAllCycles, findCycleById, saveCycleDoc } from "../../controllers/cycles.controller.ts";
import { findRepoById } from "../../controllers/repos.controller.ts";
import { cleanBranch, cleanDay, cycleId, type Cycle } from "./types.ts";

/*
 * Re-exported, not defined here. The scope-sheet form asks the same question in
 * the browser, and this module reaches the store — importing it from a client
 * component pulled mongoose into the browser bundle and broke the build.
 */
export { refuseIfScopeFrozen } from "./records.ts";

/** Newest planned first; a cycle with no date yet is still to come, so it leads. */
export const inCycleOrder = (list: Cycle[]): Cycle[] =>
  [...list].sort(
    (a, b) =>
      (b.plannedFor || "9999-99-99").localeCompare(a.plannedFor || "9999-99-99") ||
      b.createdAt.localeCompare(a.createdAt),
  );

export async function listCycles(repoId?: string): Promise<Cycle[]> {
  const all = await findAllCycles();
  return inCycleOrder(repoId ? all.filter((c) => c.repoId === repoId) : all);
}

export const getCycle = (id: string) => findCycleById(id);

/** Create or rename a cycle. The scope freeze is not settable from here. */
export async function saveCycle(input: Partial<Cycle>, now = Date.now()): Promise<Cycle> {
  const repoId = String(input.repoId ?? "").trim();
  const repo = await findRepoById(repoId);
  if (!repo) throw new HttpError(400, "Pick the repository this cycle ships from.");

  const name = String(input.name ?? "").trim().slice(0, LIMITS.teamName);
  if (!name) throw new HttpError(400, "Name the cycle — the release version, or the sprint.");

  const id = input.id || cycleId(repoId, name);
  if (!id) throw new HttpError(400, "Could not work out an id for that cycle.");

  const existing = await findCycleById(id);
  const at = new Date(now).toISOString();

  return saveCycleDoc({
    id,
    repoId,
    name,
    releaseBranch: cleanBranch(input.releaseBranch ?? existing?.releaseBranch ?? repo.releaseBranch, repo.releaseBranch),
    plannedFor: cleanDay(input.plannedFor ?? existing?.plannedFor),
    /*
     * Never from this form. Only the scope route may close or open a sheet, so
     * renaming a cycle cannot quietly reopen scope somebody agreed was final.
     */
    scope: existing?.scope ?? { frozen: false, changedAt: "", changedBy: "", reason: "" },
    createdAt: existing?.createdAt ?? at,
    updatedAt: at,
  });
}
