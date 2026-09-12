"use client";

/**
 * The repositories panel, with its own data.
 *
 * `admin-client.tsx` is already the longest file in the app and is the thing
 * the size rule is trying to shrink, so this section fetches and saves for
 * itself rather than adding four more handlers and another SWR key to it.
 */
import { useState } from "react";
import useSWR from "swr";
import { SWR_OPTIONS, failureReason, fetcher } from "@/lib/swr";
import type { Repo } from "@/lib/devops/types";
import { Empty, Panel } from "@/components/ui";
import { ReposPanel } from "./repos-panel";

export function ReposSection({
  teams,
  flash,
}: {
  teams: { id: string; name: string }[];
  /** The admin screen's toast, so this speaks in the same voice as everything else. */
  flash: (text: string, tone?: "ok" | "bad") => void;
}) {
  const { data, error, isLoading, mutate } = useSWR<{ repos?: Repo[]; error?: string }>(
    "/api/repos",
    fetcher,
    SWR_OPTIONS,
  );
  const [busy, setBusy] = useState("");

  const failed = failureReason(error, data);

  const save = async (repo: Repo) => {
    setBusy("repo");
    try {
      const res = await fetch("/api/repos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(repo),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Could not save that repository.");

      flash(`Saved ${body.repo?.name ?? "the repository"}.`);
      await mutate();
    } catch (err) {
      flash(err instanceof Error ? err.message : "Could not save that repository.", "bad");
    } finally {
      setBusy("");
    }
  };

  const remove = async (repo: Repo) => {
    setBusy("repo");
    try {
      const res = await fetch(`/api/repos?id=${encodeURIComponent(repo.id)}`, { method: "DELETE" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Could not remove that repository.");

      // Says what was *not* done. Removing a repo from the board sounds like it
      // could touch GitHub, and somebody hesitating over this button deserves
      // to know that it does not.
      flash(`Removed ${repo.name} from the board. Nothing on GitHub changed.`);
      await mutate();
    } catch (err) {
      flash(err instanceof Error ? err.message : "Could not remove that repository.", "bad");
    } finally {
      setBusy("");
    }
  };

  if (failed) {
    return (
      <Panel className="p-6">
        <Empty title="Could not load the repositories" hint={failed} />
      </Panel>
    );
  }

  if (isLoading && !data) {
    return (
      <Panel className="p-6">
        <div className="h-20 animate-pulse rounded-xl bg-[var(--wash)]" />
      </Panel>
    );
  }

  return <ReposPanel repos={data?.repos ?? []} teams={teams} busy={busy} onSave={save} onDelete={remove} />;
}
