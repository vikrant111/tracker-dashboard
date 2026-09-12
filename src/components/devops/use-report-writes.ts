"use client";

/**
 * The three things the sign-off report writes.
 *
 * Lifted out of `signoff-report.tsx`, which is about which rows are on screen.
 *
 * They are deliberately separate calls even though two hit the same endpoint:
 * recording a sign-off is somebody putting their name to something, and
 * correcting a record is somebody who was chosen to do that fixing a fact.
 * The server gates them differently for the same reason.
 */
import { refuseMoveToScope } from "@/lib/devops/to-scope";
import type { Cycle, PullRecord } from "@/lib/devops/types";

export function useReportWrites({
  repoId,
  setBusy,
  flash,
  refresh,
}: {
  repoId: string | undefined;
  setBusy: (id: string) => void;
  flash: (text: string, tone?: "ok" | "bad") => void;
  refresh: () => Promise<unknown>;
}) {
  const post = async (busyKey: string, body: unknown, fallback: string, onGood?: (answer: Record<string, unknown>) => void) => {
    setBusy(busyKey);
    try {
      const res = await fetch("/api/pulls", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const answer = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(answer.error || fallback);

      onGood?.(answer);
      await refresh();
    } catch (err) {
      flash(err instanceof Error ? err.message : fallback, "bad");
    } finally {
      setBusy("");
    }
  };

  return {
    /** Read merged pull requests from GitHub. Changes nothing on GitHub. */
    sync: async (which?: string, branch?: string) => {
      const target = which || repoId;
      if (!target) return;
      setBusy("sync");
      try {
        const res = await fetch("/api/pulls/sync", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ repoId: target, branch }),
        });
        const answer = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(answer.error || "Could not read the pull requests.");

        // Says what came back, including "no token", rather than a bare tick.
        flash(answer.detail ?? "Read the pull requests.", answer.ok ? "ok" : "bad");
        await refresh();
      } catch (err) {
        flash(err instanceof Error ? err.message : "Could not read the pull requests.", "bad");
      } finally {
        setBusy("");
      }
    },

    annotate: (pr: PullRecord, patch: Partial<PullRecord>) =>
      post(pr.id, { id: pr.id, ...patch }, "Could not save that."),

    toggle: (pr: PullRecord, level: string, on: boolean) =>
      post(pr.id, { id: pr.id, level, on }, "Could not record that."),

    /**
     * Put a merged, fully signed-off change onto **its own** cycle's scope
     * sheet.
     *
     * The cycle is passed only so the toast can name it and so a frozen sheet
     * is refused here rather than after a round trip. The server takes the
     * cycle off the stored record either way — see `api/pulls/to-scope`.
     */
    moveToScope: async (pr: PullRecord, cycle: Cycle | undefined) => {
      /*
       * Answered before the request. The button is already disabled for every
       * one of these, so reaching this means something changed underneath —
       * a sheet frozen in another tab, most likely — and the reader is owed the
       * reason rather than a generic failure.
       */
      const refusal = refuseMoveToScope(pr, cycle, true);
      if (refusal) {
        flash(refusal, "bad");
        return;
      }

      setBusy(pr.id);
      try {
        const res = await fetch("/api/pulls/to-scope", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: pr.id, cycleId: cycle?.id ?? "" }),
        });
        const answer = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(answer.error || "Could not move it to the sheet.");

        // Names the sheet it landed on: with one sheet per cycle, "it moved" is
        // only half the answer.
        flash(`#${pr.number} is on the ${answer.cycle?.name ?? cycle?.name ?? ""} scope sheet.`.replace("  ", " "));
        await refresh();
      } catch (err) {
        flash(err instanceof Error ? err.message : "Could not move it to the sheet.", "bad");
      } finally {
        setBusy("");
      }
    },
  };
}
