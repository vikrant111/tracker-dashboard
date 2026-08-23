"use client";

import { motion } from "framer-motion";
import { Database, RefreshCw, Server } from "lucide-react";
import Link from "next/link";

/**
 * Everything here is a fact the page already knows — where the data came from,
 * when it last moved, how much of it there is. No invented links, no social
 * icons pointing nowhere: a footer full of dead ornament is worse than none.
 */
export function Footer({
  totals,
  lastSyncedAt,
  podCount,
  isAdmin,
}: {
  totals: { total: number; active: number };
  lastSyncedAt: string | null;
  podCount: number;
  isAdmin: boolean;
}) {
  const synced = lastSyncedAt ? new Date(lastSyncedAt) : null;
  const syncedLabel = synced && !Number.isNaN(synced.getTime()) ? relative(synced) : "not yet";

  return (
    <motion.footer
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-40px" }}
      transition={{ type: "spring", stiffness: 200, damping: 26 }}
      className="glass mt-6 flex flex-col gap-4 p-5 sm:p-6"
    >
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-4">
        <div className="flex items-center gap-2.5">
          <span
            aria-hidden
            className="glow grid h-8 w-8 place-items-center rounded-xl bg-gradient-to-br from-[var(--accent)] to-[var(--accent-2)] font-[family-name:var(--font-display)] text-xs font-bold text-[var(--mark-ink)]"
          >
            T
          </span>
          <div>
            <p className="font-[family-name:var(--font-display)] text-sm font-semibold tracking-tight">POD Tracker</p>
            <p className="text-xs text-[var(--ink-muted)]">Ageing bugs, tickets and CRs across every POD</p>
          </div>
        </div>

        <dl className="flex flex-wrap items-center gap-x-6 gap-y-3">
          <Fact icon={<Database size={13} />} label="Tracked">
            {totals.total.toLocaleString()} items · {totals.active.toLocaleString()} open
          </Fact>
          <Fact icon={<Server size={13} />} label="PODs">
            {podCount} onboarded
          </Fact>
          <Fact icon={<RefreshCw size={13} />} label="Last sync">
            {syncedLabel}
          </Fact>
        </dl>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border-t border-[var(--hairline)] pt-4">
        <p className="text-[11px] text-[var(--ink-muted)]">
          Data read from Azure DevOps Boards and spreadsheet uploads. Ages are computed at query time, so nothing here
          goes stale between syncs.
        </p>
        <nav className="flex items-center gap-4 text-[11px]">
          {isAdmin && (
            <Link href="/admin" className="text-[var(--accent-ink)] transition-colors hover:text-[var(--accent)]">
              Admin
            </Link>
          )}
          <a
            href="https://learn.microsoft.com/azure/devops/boards"
            target="_blank"
            rel="noreferrer"
            className="text-[var(--ink-muted)] transition-colors hover:text-[var(--ink-2)]"
          >
            Azure Boards
          </a>
        </nav>
      </div>
    </motion.footer>
  );
}

function Fact({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <span className="grid h-7 w-7 place-items-center rounded-lg bg-[var(--wash)] text-[var(--ink-muted)]">{icon}</span>
      <div>
        <dt className="eyebrow">{label}</dt>
        <dd className="font-[family-name:var(--font-mono)] text-xs tnum text-[var(--ink-2)]">{children}</dd>
      </div>
    </div>
  );
}

/** "4 minutes ago" — a wall-clock timestamp makes the reader do the arithmetic. */
function relative(then: Date): string {
  const seconds = Math.round((Date.now() - then.getTime()) / 1000);
  if (seconds < 0) return "just now";
  if (seconds < 60) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}
