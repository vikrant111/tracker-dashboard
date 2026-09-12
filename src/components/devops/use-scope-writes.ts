"use client";

/**
 * Adding, changing and removing a scope row.
 *
 * Lifted out of `scope-sheet.tsx`, which is about *which* sheet — repo, cycle,
 * filter, page — while this is about writing to it. Three requests that all
 * end the same way: say what happened, then refetch.
 */
import type { Cycle, Deployment, Repo } from "@/lib/devops/types";

export function useScopeWrites({
  repo,
  cycle,
  draft,
  setDraft,
  setBusy,
  setProblem,
  flash,
  refresh,
  refreshCycles,
}: {
  repo: Repo | undefined;
  cycle: Cycle | undefined;
  draft: Partial<Deployment> | null;
  setDraft: (d: Partial<Deployment> | null) => void;
  setBusy: (busy: boolean) => void;
  setProblem: (problem: string | null) => void;
  flash: (text: string, tone?: "ok" | "bad") => void;
  /** Re-read the rows. */
  refresh: () => Promise<unknown>;
  /** Re-read the cycles, after their freeze state changes. */
  refreshCycles: () => Promise<unknown>;
}) {
  /** Post a row and report what came back. Shared by adding and editing. */
  const post = async (body: unknown, whenGood: () => void, onBad: (message: string) => void) => {
    setBusy(true);
    try {
      const res = await fetch("/api/deployments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const answer = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(answer.error || "Could not save that row.");

      whenGood();
      await refresh();
    } catch (err) {
      onBad(err instanceof Error ? err.message : "Could not save that row.");
    } finally {
      setBusy(false);
    }
  };

  return {
    /** The new-row form. Its errors belong beside the form, not in a toast. */
    save: () => {
      setProblem(null);
      return post({ ...draft, repoId: repo?.id, cycleId: cycle?.id }, () => setDraft(null), setProblem);
    },

    /*
     * A change to a row that already exists. The whole row is sent, not the
     * patch, so the server sees a complete document and its own rules decide
     * what may change.
     */
    saveRow: (row: Deployment, patch: Partial<Deployment>) =>
      post({ ...row, ...patch }, () => flash("Saved."), (m) => flash(m, "bad")),

    /**
     * Take a row off the sheet.
     *
     * A row that came from a pull request carries a remark: the pull request
     * goes back to the sign-off report and somebody is waiting to read why.
     * The table collects it — not `window.prompt`, which blocks the page and
     * cannot be driven by a test.
     */
    remove: async (row: Deployment, remarks = "") => {
      setBusy(true);
      try {
        const res = await fetch(`/api/deployments?id=${encodeURIComponent(row.id)}`, {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ remarks }),
        });
        const answer = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(answer.error || "Could not remove that row.");
        await refresh();
      } catch (err) {
        flash(err instanceof Error ? err.message : "Could not remove that row.", "bad");
      } finally {
        setBusy(false);
      }
    },

    /**
     * Close or reopen this cycle's scope.
     *
     * A write to the cycle rather than to a row, which is why it lives beside
     * the other three instead of in the panel: the panel is about which sheet
     * is on screen.
     *
     * Freezing asks for a reason, because everyone a freeze blocks reads it.
     * Reopening does not — nobody needs an explanation for being unblocked.
     */
    setFrozen: async (frozen: boolean) => {
      if (!cycle) return;

      const reason = frozen
        ? window.prompt("Why is the scope frozen? Everyone who tries to add a row will read this.")
        : "";
      // A cancelled prompt is not a freeze with no reason; it is no freeze.
      if (frozen && reason === null) return;

      setBusy(true);
      try {
        const res = await fetch(`/api/cycles/${encodeURIComponent(cycle.id)}/scope`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ frozen, reason }),
        });
        const answer = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(answer.error || "Could not change the scope.");

        flash(frozen ? `Scope for ${cycle.name} is frozen.` : `Scope for ${cycle.name} is open again.`);
        await refreshCycles();
      } catch (err) {
        flash(err instanceof Error ? err.message : "Could not change the scope.", "bad");
      } finally {
        setBusy(false);
      }
    },
  };
}
