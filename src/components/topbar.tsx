"use client";

import { motion } from "framer-motion";
import { Download, FileText, LogOut, RefreshCw, Settings, Sparkles, Upload } from "lucide-react";
import { UPLOAD } from "@/lib/constants";
import Link from "next/link";
import { useRef } from "react";
import type { Kind } from "@/lib/types";
import { SearchBox } from "./search-box";
import { ThemeToggle } from "./theme-toggle";
import { Button, Menu, MenuItem, MenuSection, SegmentedControl } from "./ui";

export type TeamOption = { id: string; name: string };

const KINDS: { key: Kind | "all"; label: string }[] = [
  { key: "all", label: "Everything" },
  { key: "bug", label: "Bugs" },
  { key: "ticket", label: "Tickets" },
  { key: "cr", label: "CRs" },
];

export function Topbar({
  teams,
  teamId,
  onTeam,
  kind,
  onKind,
  search,
  onSearch,
  suggestions,
  baseQuery,
  onSync,
  onUpload,
  syncing,
  uploading,
  isAdmin,
  authEnabled,
  lastSyncedAt,
  canSeeAllPods,
}: {
  teams: TeamOption[];
  teamId: string;
  onTeam: (id: string) => void;
  kind: Kind | "all";
  onKind: (k: Kind | "all") => void;
  search: string;
  onSearch: (s: string) => void;
  /** Names on this board, offered as you type. */
  suggestions: string[];
  /** The filters the board is showing, so a download matches the screen. */
  baseQuery: Record<string, string>;
  onSync: () => void;
  onUpload: (file: File) => void;
  syncing: boolean;
  uploading: boolean;
  isAdmin: boolean;
  authEnabled: boolean;
  lastSyncedAt: string | null;
  canSeeAllPods: boolean;
}) {
  const fileRef = useRef<HTMLInputElement>(null);

  return (
    /*
     * The sticky bar sat at `top-3`, leaving a 12px gap above it through which
     * scrolling panels were visible — the bar looked detached and content
     * appeared to run over it. The wrapper is pinned to the very top instead and
     * carries a blurred, bottom-fading backdrop that covers that gap, so
     * everything passes cleanly underneath.
     */
    <div className="sticky top-0 z-30 -mx-4 mb-6 px-4 pt-3 pb-3 sm:-mx-6 sm:px-6">
      {/*
       * Full-bleed on purpose. At `inset-0` this backdrop stopped at the
       * container's max width, so on any screen wider than 1400px it ended in
       * two hard vertical seams either side of the bar. It reaches half a
       * viewport past each edge instead, which the viewport's own `overflow-x`
       * clips — so there is no edge to see at any width, and no extra scroll.
       */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-y-0 -left-[50vw] -right-[50vw] backdrop-blur-xl"
        style={{
          background: "linear-gradient(to bottom, var(--plane) 30%, transparent)",
          maskImage: "linear-gradient(to bottom, #000 62%, transparent)",
          WebkitMaskImage: "linear-gradient(to bottom, #000 62%, transparent)",
        }}
      />
      <motion.header
        initial={{ opacity: 0, y: -14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        className="glass relative flex flex-wrap items-center gap-2 px-3 py-2.5 shadow-[var(--glass-shadow)] sm:gap-3 sm:px-4 sm:py-3"
      >
        <Link href="/" className="flex items-center gap-2.5">
          <span
            aria-hidden
            className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-[var(--accent)] to-[var(--accent-2)] font-[family-name:var(--font-display)] text-sm font-bold text-[var(--mark-ink)] glow transition-transform duration-300 hover:scale-105"
          >
            T
          </span>
          <span className="font-[family-name:var(--font-display)] text-base font-semibold tracking-tight">
            POD Tracker
          </span>
        </Link>

        <span aria-hidden className="hidden h-6 w-px bg-[var(--wash-2)] sm:block" />

        {/*
         * The POD picker and the kind filter are *filters*, not actions — they
         * change what the board is showing rather than doing something to it.
         * They stay on the bar where there is room, and fold into the menu on a
         * phone, where there is not.
         */}
        <div className="hidden items-center gap-2 sm:flex sm:gap-3">
          <label className="sr-only" htmlFor="pod-picker">
            POD
          </label>
          <select
            id="pod-picker"
            value={teamId}
            onChange={(e) => onTeam(e.target.value)}
            className="!w-auto min-w-0 max-w-[9rem] cursor-pointer !py-1.5 text-sm sm:min-w-[9rem]"
          >
            {canSeeAllPods && <option value="">All PODs</option>}
            {teams.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>

          <SegmentedControl groupId="kind-filter" value={kind} onChange={onKind} options={KINDS} />
        </div>

        <div className="flex w-full flex-wrap items-center gap-2 sm:ml-auto sm:w-auto sm:flex-nowrap">
          {/*
           * The search gets its own line on a phone.
           *
           * Sharing a row with the other controls under `flex-1 min-w-0` let it
           * be the only thing that could give — so it collapsed to **0px wide**:
           * present in the DOM, focusable, and completely invisible.
           * `basis-full` puts it on its own row below them.
           */}
          <div className="order-last w-full min-w-0 basis-full sm:order-none sm:w-auto sm:basis-auto">
            <SearchBox value={search} onChange={onSearch} names={suggestions} />
          </div>

          <input
            ref={fileRef}
            type="file"
            accept={UPLOAD.accept}
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) onUpload(file);
              e.target.value = "";
            }}
          />

          {/*
           * Everything the reader can *do*, behind one trigger.
           *
           * The bar had grown to nine controls in a row — an icon wall where
           * every button looked equally urgent and nothing had room for a label.
           * In here each action gets its name and a line of explanation, which
           * is where the upload format and the sync time actually belong.
           *
           * On a phone the filters join them, leaving the bar with only what a
           * reader needs at a glance: search, theme, and the way out.
           */}
          <Menu label="For you" icon={<Sparkles size={15} />}>
            <MenuSection label="This board">
              <MenuItem
                icon={<RefreshCw size={15} className={syncing ? "animate-spin" : ""} />}
                label={syncing ? "Syncing" : "Sync now"}
                hint={lastSyncedAt ? `Last synced ${new Date(lastSyncedAt).toLocaleString()}` : "Pull from Azure Boards"}
                onClick={onSync}
                disabled={syncing}
                busy={syncing}
                tone="primary"
              />
              <MenuItem
                icon={<Download size={15} />}
                label="Download report"
                hint="This view as .xlsx — same filters, same columns"
                href={`/api/export?${new URLSearchParams(baseQuery)}`}
                download
                disabled={!teamId && !canSeeAllPods}
              />
              {/* For anyone without Excel. CSV opens anywhere and re-uploads
                  through exactly the same column mapping. */}
              <MenuItem
                icon={<FileText size={15} />}
                label="Download as CSV"
                hint="Opens in Numbers, Sheets, anything"
                href={`/api/export?${new URLSearchParams({ ...baseQuery, format: "csv" })}`}
                download
                disabled={!teamId && !canSeeAllPods}
              />
              <MenuItem
                icon={<Upload size={15} />}
                label={uploading ? "Uploading" : "Upload a spreadsheet"}
                hint={teamId ? "Excel or CSV — only a Title column is required" : "Pick a POD first"}
                onClick={() => fileRef.current?.click()}
                disabled={uploading || !teamId}
                busy={uploading}
              />
            </MenuSection>

            {/* Filters live up on the bar once there is room for them. */}
            <div className="sm:hidden">
              <span aria-hidden className="my-1 block h-px bg-[var(--hairline)]" />
              <MenuSection label="Showing">
                <div className="flex flex-col gap-2 px-2 py-1">
                  <label className="sr-only" htmlFor="pod-picker-menu">
                    POD
                  </label>
                  <select
                    id="pod-picker-menu"
                    value={teamId}
                    onChange={(e) => onTeam(e.target.value)}
                    className="cursor-pointer !py-1.5 text-sm"
                  >
                    {canSeeAllPods && <option value="">All PODs</option>}
                    {teams.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                  <SegmentedControl groupId="kind-filter-menu" value={kind} onChange={onKind} options={KINDS} />
                </div>
              </MenuSection>
            </div>

            {isAdmin && (
              <>
                <span aria-hidden className="my-1 block h-px bg-[var(--hairline)]" />
                <MenuSection label="Manage">
                  {/* Admin is a destination, so it is a link — right-clickable,
                      and openable in a new tab like any other. */}
                  <MenuItem
                    icon={<Settings size={15} />}
                    label="Admin"
                    hint="PODs, members and access"
                    href="/admin"
                  />
                </MenuSection>
              </>
            )}
          </Menu>

          {/* What a reader needs at a glance, on every size. */}
          <ThemeToggle />

          {authEnabled && (
            <Link href="/api/auth/signout">
              <Button title="Sign out">
                <LogOut size={15} />
              </Button>
            </Link>
          )}
        </div>
      </motion.header>
    </div>
  );
}
