"use client";

/**
 * The DevOps board.
 *
 * Same shell as the POD board on purpose — one bar, one column of panels, the
 * same motion and the same theme. Somebody who knows one should not have to
 * learn the other; only the questions differ.
 */
import { motion } from "framer-motion";
import { useState } from "react";
import useSWR from "swr";
import { GitBranch, LogOut, Settings } from "lucide-react";
import Link from "next/link";
import { SWR_OPTIONS, failureReason, fetcher } from "@/lib/swr";
import type { Repo } from "@/lib/devops/types";
import { Button, Empty, Panel } from "@/components/ui";
import { ThemeToggle } from "@/components/theme-toggle";
import { TIMING } from "@/lib/constants";
import { BoardSwitch } from "./board-switch";
import { Toast } from "./toast";
import { FreezeControl } from "./freeze-control";
import { Announcements } from "./announcements";
import { ScopeSheet } from "./scope-sheet";
import { SignoffReport } from "./signoff-report";
import { PurgePanel } from "./purge-panel";
import { RepoTable } from "./repo-table";

export function DevOpsClient({
  userName,
  isAdmin,
  authEnabled,
  teamNames,
  githubMode,
  canEdit,
}: {
  userName: string;
  isAdmin: boolean;
  authEnabled: boolean;
  teamNames: Record<string, string>;
  /** "dry-run" or "live", so a control can say which before it acts. */
  githubMode: string;
  /** Whether this reader may change a DevOps record that already exists. */
  canEdit: boolean;
}) {
  const [busy, setBusy] = useState("");
  const [toast, setToast] = useState<{ text: string; tone: "ok" | "bad" } | null>(null);
  const { data, error, isLoading, mutate } = useSWR<{ repos?: Repo[]; error?: string }>(
    "/api/repos",
    fetcher,
    SWR_OPTIONS,
  );

  // Both failures, as on the POD board: a refusal, and a request that never
  // arrived. Only reading the first shows "no repositories" when the truth is
  // that nothing was asked.
  const failed = failureReason(error, data);
  const repos = data?.repos ?? [];

  const flash = (text: string, tone: "ok" | "bad" = "ok") => {
    setToast({ text, tone });
    setTimeout(() => setToast(null), TIMING.toastMs);
  };

  const setFreeze = async (repo: Repo, frozen: boolean, reason: string) => {
    setBusy(repo.id);
    try {
      const res = await fetch(`/api/repos/${encodeURIComponent(repo.id)}/freeze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ frozen, reason }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Could not change the freeze.");

      // Says which mode it ran in. "Frozen." after a dry run would be a lie
      // that an admin only discovers when somebody pushes anyway.
      if (!body.ok) flash(body.repo?.freeze?.detail ?? "GitHub refused the change.", "bad");
      else if (body.dryRun) flash(`Dry run — ${repo.name} recorded as ${frozen ? "frozen" : "open"}. Nothing was sent to GitHub.`);
      else flash(`${repo.name}: ${repo.developBranch} is now ${frozen ? "frozen" : "open"}.`);

      await mutate();
    } catch (err) {
      flash(err instanceof Error ? err.message : "Could not change the freeze.", "bad");
    } finally {
      setBusy("");
    }
  };

  return (
    /* Same width, same padding, same bar as the POD board. Somebody moving
       between the two should not feel the page change shape under them. */
    <div className="mx-auto max-w-[1400px] px-3 pb-24 sm:px-6">
      <motion.header
        initial={{ opacity: 0, y: -14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        className="glass sticky top-3 z-30 mb-4 flex flex-wrap items-center gap-2 px-3 py-2.5 shadow-[var(--glass-shadow)] sm:gap-3 sm:px-4 sm:py-3"
      >
        <span className="flex items-center gap-2.5">
          <span
            aria-hidden
            className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-[var(--accent)] to-[var(--accent-2)] text-[var(--mark-ink)] glow"
          >
            <GitBranch size={16} strokeWidth={2.4} />
          </span>
          <span className="font-[family-name:var(--font-display)] text-base font-semibold tracking-tight">
            DevOps
          </span>
        </span>

        <span aria-hidden className="hidden h-6 w-px bg-[var(--wash-2)] sm:block" />

        <BoardSwitch current="/devops" />

        <span className="ml-auto flex items-center gap-2">
          <span className="hidden text-xs text-[var(--ink-muted)] sm:inline">{userName}</span>
          <ThemeToggle />
          {/*
            * The admin for *this* board. Sending somebody from the DevOps board
            * to POD admin made them navigate back to find the screen they were
            * already looking for.
            */}
          {isAdmin && (
            <Link href="/admin/devops">
              <Button>
                <Settings size={14} />
                DevOps admin
              </Button>
            </Link>
          )}
          {authEnabled && (
            <a href="/api/auth/signout">
              <Button>
                <LogOut size={14} />
                Sign out
              </Button>
            </a>
          )}
        </span>
      </motion.header>

      {failed ? (
        <Panel className="p-8">
          <Empty title="Could not load the repositories" hint={failed} />
        </Panel>
      ) : isLoading && !data ? (
        <Panel className="p-8">
          <div className="h-24 animate-pulse rounded-xl bg-[var(--wash)]" />
        </Panel>
      ) : (
        <RepoTable
          repos={repos}
          teamNames={teamNames}
          action={
            isAdmin
              ? (repo) => (
                  <FreezeControl
                    repo={repo}
                    busy={busy === repo.id}
                    mode={githubMode}
                    onApply={(frozen, reason) => setFreeze(repo, frozen, reason)}
                  />
                )
              : undefined
          }
        />
      )}

      {!failed && !isLoading && repos.length > 0 && (
        <ScopeSheet repos={repos} teamNames={teamNames} isAdmin={isAdmin} canEdit={canEdit} flash={flash} />
      )}

      {!failed && !isLoading && repos.length > 0 && (
        <SignoffReport repos={repos} teamNames={teamNames} isAdmin={isAdmin} canEdit={canEdit} flash={flash} />
      )}

      {!failed && !isLoading && <Announcements repos={repos} isAdmin={isAdmin} />}

      {!failed && !isLoading && isAdmin && repos.length > 0 && (
        <PurgePanel known={[]} flash={flash} onDone={() => void mutate()} />
      )}

      <Toast toast={toast} />
    </div>
  );
}
