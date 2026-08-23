"use client";

import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, Hourglass, ListChecks, Server } from "lucide-react";
import { useMemo, useState } from "react";
import useSWR, { useSWRConfig } from "swr";
import type { Dashboard } from "@/lib/metrics";
import { STATUS } from "@/lib/palette";
import { REFRESH_MS, SWR_OPTIONS, fetcher, isApiKey } from "@/lib/swr";
import type { Kind } from "@/lib/types";
import type { Weather } from "@/lib/weather";
import { BreakdownCard } from "./breakdown-card";
import { DrillProvider } from "./drill-drawer";
import { HealthRing } from "./health-ring";
import { Leaderboard } from "./leaderboard";
import { Footer } from "./footer";
import { ParallaxBackdrop } from "./parallax-backdrop";
import { SkyBackdrop } from "./sky-backdrop";
import { StatRail } from "./stat-rail";
import { TeamRollup } from "./team-rollup";
import { Topbar, type TeamOption } from "./topbar";
import { TrendChart } from "./trend-chart";
import { Empty, Panel } from "./ui";

type Payload = Dashboard & {
  teamNames: Record<string, string>;
  lastSyncedAt: string | null;
  error?: string;
};

export function DashboardClient({
  teams,
  userName,
  weather,
  isAdmin,
  authEnabled,
  initialTeamId,
}: {
  teams: TeamOption[];
  userName: string;
  weather: Weather | null;
  isAdmin: boolean;
  authEnabled: boolean;
  initialTeamId: string;
}) {
  const [teamId, setTeamId] = useState(initialTeamId);
  const [kind, setKind] = useState<Kind | "all">("all");
  const [search, setSearch] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [toast, setToast] = useState<{ text: string; tone: "ok" | "bad" } | null>(null);
  // The health card, once it exists. A callback ref in state rather than a
  // `useRef` object: the backdrop must re-measure when the card mounts, and a
  // ref object mutating does not re-render anything.
  const [skyAnchor, setSkyAnchor] = useState<HTMLElement | null>(null);

  const baseQuery = useMemo(() => {
    const q: Record<string, string> = {};
    if (teamId) q.teamId = teamId;
    if (kind !== "all") q.kind = kind;
    if (search.trim()) q.search = search.trim();
    return q;
  }, [teamId, kind, search]);

  const { mutate: mutateAll } = useSWRConfig();
  const { data, isLoading, mutate } = useSWR<Payload>(
    `/api/metrics?${new URLSearchParams(baseQuery)}`,
    fetcher,
    SWR_OPTIONS,
  );

  /**
   * Sync and upload change the data under every panel at once, so refresh every
   * API key rather than just this one. Otherwise an open drawer or an expanded
   * POD row keeps showing pre-sync numbers beside post-sync tiles.
   */
  const refreshEverything = () => mutateAll(isApiKey);

  const flash = (text: string, tone: "ok" | "bad" = "ok") => {
    setToast({ text, tone });
    setTimeout(() => setToast(null), 5000);
  };

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

      const failed = (body.results || []).filter((r: { error?: string }) => r.error);
      const imported = (body.results || []).reduce((n: number, r: { imported: number }) => n + r.imported, 0);
      if (failed.length) flash(failed[0].error, "bad");
      else flash(imported ? `Synced ${imported} work item${imported === 1 ? "" : "s"}.` : "Already up to date.");
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
      const notes = [
        body.skipped ? `skipped ${body.skipped} without a title` : "",
        body.duplicates ? `merged ${body.duplicates} duplicate id${body.duplicates === 1 ? "" : "s"}` : "",
      ].filter(Boolean);
      flash(
        `Imported ${body.imported} row${body.imported === 1 ? "" : "s"}${notes.length ? `, ${notes.join(", ")}` : ""}.`,
      );
      await refreshEverything();
    } catch (err) {
      flash(err instanceof Error ? err.message : "Upload failed.", "bad");
    } finally {
      setUploading(false);
    }
  };

  const podName = teamId ? (teams.find((t) => t.id === teamId)?.name ?? teamId) : "All PODs";

  return (
    // Assignee names come from the metrics payload, so the drawer's filter has
    // real options without a second request.
    <DrillProvider baseQuery={baseQuery} assignees={(data?.assignees ?? []).map((a) => a.name)}>
      <ParallaxBackdrop />
      {/* The takeover needs the card element itself, and the card does not exist
          until the data lands — so it arrives through state, not a ref object,
          which is what makes the backdrop re-measure when it finally mounts. */}
      <SkyBackdrop anchor={skyAnchor} weather={weather} />

      <div className="mx-auto max-w-[1400px] px-3 pb-24 sm:px-6">
        <Topbar
          teams={teams}
          teamId={teamId}
          onTeam={setTeamId}
          kind={kind}
          onKind={setKind}
          search={search}
          onSearch={setSearch}
          suggestions={(data?.assignees ?? []).map((a) => a.name)}
          baseQuery={baseQuery}
          onSync={sync}
          onUpload={upload}
          syncing={syncing}
          uploading={uploading}
          isAdmin={isAdmin}
          authEnabled={authEnabled}
          lastSyncedAt={data?.lastSyncedAt ?? null}
          canSeeAllPods={isAdmin}
        />

        {teams.length === 0 ? (
          <Panel className="mt-10 p-8">
            <Empty
              title="No PODs yet"
              hint={
                isAdmin
                  ? "Open Admin to onboard your first POD — name it, add the members, and point it at your Azure Boards project."
                  : "You are not assigned to a POD yet. Ask an admin to add you."
              }
            />
          </Panel>
        ) : data?.error ? (
          <Panel className="mt-10 p-8">
            <Empty title="Could not load the dashboard" hint={data.error} />
          </Panel>
        ) : !data && isLoading ? (
          <SkeletonBoard />
        ) : data ? (
          <div className="flex flex-col gap-4">
            <div className="grid items-stretch gap-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
              <HealthRing ref={setSkyAnchor} data={data} podName={podName} userName={userName} weather={weather} />
              <Leaderboard assignees={data.assignees} thresholdDays={data.thresholdDays} />
            </div>

            <StatRail data={data} />

            <div className="grid items-start gap-4 lg:grid-cols-2">
              <BreakdownCard
                dimension="severity"
                icon={AlertTriangle}
                hue={STATUS.critical}
                eyebrow="Severity"
                title="How bad is what is open"
                note="Counts include closed items. Click a row for titles and links."
                buckets={data.severity}
              />
              <BreakdownCard
                dimension="status"
                icon={ListChecks}
                hue={"var(--series-1)"}
                eyebrow="Bug status"
                title="Where items are sitting"
                note="Status is mapped from your board's own states. Click through for the list."
                buckets={data.status}
                delay={0.05}
              />
              <BreakdownCard
                dimension="environment"
                icon={Server}
                hue={"var(--series-3)"}
                eyebrow="Environment"
                title="Where they were raised"
                note="Read from the environment field, then tags, then area path."
                buckets={data.environment}
                delay={0.1}
              />
              <BreakdownCard
                dimension="ageing"
                icon={Hourglass}
                hue={"var(--series-4)"}
                eyebrow="Ageing"
                title="How long open items have waited"
                note={`Open items only. Anything past ${data.thresholdDays} days counts as aged.`}
                buckets={data.ageing}
                delay={0.15}
              />
            </div>

            <TrendChart daily={data.trend.daily} weekly={data.trend.weekly} />

            {!teamId && (
              <TeamRollup
                teams={data.teams}
                names={data.teamNames}
                thresholdDays={data.thresholdDays}
                onPick={setTeamId}
              />
            )}
          </div>
        ) : null}

        {data && !data.error && (
          <Footer
            totals={data.totals}
            lastSyncedAt={data.lastSyncedAt ?? null}
            podCount={teams.length}
            isAdmin={isAdmin}
          />
        )}
      </div>

      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 24 }}
            role="status"
            className="glass fixed bottom-6 left-1/2 z-50 max-w-[90vw] -translate-x-1/2 px-4 py-3 text-sm"
            style={{ borderColor: toast.tone === "bad" ? "var(--danger)" : "var(--st-good)" }}
          >
            {toast.text}
          </motion.div>
        )}
      </AnimatePresence>
    </DrillProvider>
  );
}

function SkeletonBoard() {
  return (
    <div className="flex flex-col gap-4">
      <div className="grid items-stretch gap-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <div className="glass h-[216px] animate-pulse" />
        <div className="glass h-[216px] animate-pulse" />
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="glass h-[132px] animate-pulse" />
        ))}
      </div>
      <div className="grid items-start gap-4 lg:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="glass h-[260px] animate-pulse" />
        ))}
      </div>
    </div>
  );
}
