"use client";

/**
 * The two things the POD board writes: a sync and a spreadsheet upload.
 *
 * Lifted out of `dashboard-client.tsx`, which is about what is on screen — the
 * same split the DevOps board already makes with `use-report-writes`. Both are
 * the same shape: call an endpoint, turn the answer into one sentence, refresh
 * every panel.
 *
 * **Every** API key is revalidated, not just the board's. A sync changes the
 * data under all the panels at once, so an open drawer or an expanded POD row
 * would otherwise keep showing pre-sync rows beside post-sync tiles.
 */
import { useState } from "react";
import { useSWRConfig } from "swr";
import { isApiKey } from "@/lib/swr";
import { describeSync, describeUpload } from "./board-actions";

export function useBoardWrites({
  teamId,
  flash,
}: {
  teamId: string;
  flash: (text: string, tone?: "ok" | "bad") => void;
}) {
  const { mutate: mutateAll } = useSWRConfig();
  const [syncing, setSyncing] = useState(false);
  const [uploading, setUploading] = useState(false);

  const refreshEverything = () => mutateAll(isApiKey);

  const sync = async () => {
    setSyncing(true);
    try {
      const res = await fetch("/api/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ teamId: teamId || undefined }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Sync failed.");

      const said = describeSync(body);
      flash(said.text, said.tone);
      await refreshEverything();
    } catch (err) {
      flash(err instanceof Error ? err.message : "Sync failed.", "bad");
    } finally {
      setSyncing(false);
    }
  };

  const upload = async (file: File) => {
    setUploading(true);
    try {
      const form = new FormData();
      form.set("file", file);
      form.set("teamId", teamId);
      const res = await fetch("/api/upload", { method: "POST", body: form });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Upload failed.");
      flash(describeUpload(body));
      await refreshEverything();
    } catch (err) {
      flash(err instanceof Error ? err.message : "Upload failed.", "bad");
    } finally {
      setUploading(false);
    }
  };

  return { sync, upload, syncing, uploading, refreshEverything };
}
