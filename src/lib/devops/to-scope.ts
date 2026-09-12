/**
 * Moving a merged pull request onto a scope sheet.
 *
 * **A pull request goes onto the sheet of the cycle it is assigned to, and no
 * other.** Whoever sets the cycle on the row decides where it lands; the button
 * has no say and neither does whatever the browser happens to post. That is the
 * whole point of the cycle field — before this, a move went to "the first cycle
 * whose scope is still open", so correcting a pull request's cycle changed
 * nothing about where it ended up.
 *
 * The one place that decides whether a move may happen, so the button and the
 * API agree. Each refusal names itself — a disabled button with no explanation
 * is the thing people file bugs about.
 *
 * Pure: no store, no session.
 */
import { DEVOPS_MESSAGES } from "./constants.ts";
import { SIGNOFF_LABEL, SIGNOFF_LEVELS, signoffState, type Signoffs } from "./signoff.ts";
import { refuseMoveIfScopeFrozen } from "./records.ts";
import type { Cycle } from "./records.ts";

export type MoveSubject = {
  signoffs?: Signoffs;
  mergedAt?: string;
  /** Which cycle's sheet this belongs on. Blank until somebody sets it. */
  cycleId?: string;
  /** The repository it was opened against, so a foreign cycle is refused. */
  repoId?: string;
  /** Set once it has been moved, so it cannot be moved twice. */
  movedToScope?: boolean;
};

/** As much of a cycle as this decision needs. */
type CycleSubject = Pick<Cycle, "name" | "scope"> & { id?: string; repoId?: string };

/**
 * The cycle a pull request is taped to.
 *
 * Its own `cycleId` and nothing else — not the first open cycle, not the newest
 * one. `undefined` when none is set or when the id points at a cycle that is
 * gone, which both read the same way to the person looking at the row: pick one.
 *
 * A cycle belonging to a different repository is refused rather than used. Two
 * repositories can have a cycle called `2026.09`, and putting a change on the
 * wrong repository's sheet is a record that is quietly wrong rather than
 * obviously missing.
 */
export function cycleForPull<T extends CycleSubject>(
  pr: MoveSubject | null | undefined,
  cycles: T[] | null | undefined,
): T | undefined {
  const wanted = String(pr?.cycleId ?? "").trim();
  if (!wanted) return undefined;

  const list = Array.isArray(cycles) ? cycles : [];
  const found = list.find((c) => c?.id === wanted);
  if (!found) return undefined;

  const repo = String(pr?.repoId ?? "").trim();
  if (repo && found.repoId && found.repoId !== repo) return undefined;
  return found;
}

/**
 * `null` when it may be moved, otherwise the sentence explaining why not.
 *
 * The order matters: the reason shown is the one the reader can act on first.
 * Telling somebody the scope is frozen when they also lack permission sends
 * them to ask the wrong person.
 */
export function refuseMoveToScope(
  pr: MoveSubject | null | undefined,
  cycle: CycleSubject | null | undefined,
  canEdit: boolean,
): string | null {
  /*
   * Permission first — before even "there is nothing to move".
   *
   * Somebody who may not do this at all should not be told to chase a sign-off
   * they cannot use, and should not learn from the answer whether a given pull
   * request exists.
   */
  if (!canEdit) return "Only a DevOps editor can move a pull request onto the sheet. Ask an admin to add you.";

  if (!pr) return "There is nothing to move.";

  if (!pr.mergedAt) return "This pull request has not been merged yet.";
  if (pr.movedToScope) return "This pull request is already on the sheet.";

  /*
   * No cycle on the row means there is no sheet to move it to. Said as an
   * instruction rather than a fact, because the fix is one field away and the
   * reader is looking at the row that holds it.
   */
  if (!cycle) return DEVOPS_MESSAGES.moveNoCycle;

  /*
   * A cycle from another repository is refused outright. Reached only when a
   * caller passes one by hand — `cycleForPull` will not return one — and it is
   * worth answering anyway, because the API takes the same route.
   */
  if (pr.repoId && cycle.repoId && cycle.repoId !== pr.repoId) {
    return DEVOPS_MESSAGES.moveWrongRepo(cycle.name);
  }

  const frozen = refuseMoveIfScopeFrozen(cycle);
  if (frozen) return frozen;

  /*
   * Every sign-off, not just business and QA. The scope sheet is the record of
   * what shipped; putting an unverified change on it makes the record say
   * something nobody agreed to.
   */
  const state = signoffState(pr.signoffs, true);
  if (!state.complete) {
    const missing = state.missing.map((level) => SIGNOFF_LABEL[level]);
    return `Waiting on ${missing.join(" and ")} sign-off.`;
  }

  return null;
}

/** Which sign-offs are still needed, for a tooltip that lists them. */
export const missingSignoffs = (pr: MoveSubject | null | undefined): string[] =>
  SIGNOFF_LEVELS.filter((level) => !pr?.signoffs?.[level]?.by).map((level) => SIGNOFF_LABEL[level]);
