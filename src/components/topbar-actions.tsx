"use client";

/**
 * What the reader can *do* to this board, as one menu section.
 *
 * Lifted out of `topbar.tsx` when the upload control gained an admin gate: the
 * bar was already the longest file in the app, and a section that decides who
 * may write to a board deserves to be readable on its own rather than buried
 * two thirds of the way down a component about layout.
 */
import { Download, FileText, RefreshCw, Upload } from "lucide-react";
import { MenuItem, MenuSection } from "./ui";

export function BoardActions({
  teamId,
  baseQuery,
  canSeeAllPods,
  isAdmin,
  onSync,
  syncing,
  lastSyncedAt,
  uploading,
  onPickFile,
}: {
  teamId: string;
  baseQuery: Record<string, string>;
  canSeeAllPods: boolean;
  /** Uploading is an admin's right; downloading is not. */
  isAdmin: boolean;
  onSync: () => void;
  syncing: boolean;
  lastSyncedAt?: string | null;
  uploading: boolean;
  onPickFile: () => void;
}) {
  return (
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
      {/*
        * Admins only, matching the route. Hidden rather than disabled:
        * a greyed-out control reads as "not yet" and invites a member
        * to hunt for the POD that enables it, when the answer is that
        * this is not theirs to do.
        */}
      {isAdmin && (
        <MenuItem
          icon={<Upload size={15} />}
          label={uploading ? "Uploading" : "Upload a spreadsheet"}
          hint={teamId ? "Excel or CSV — only a Title column is required" : "Pick a POD first"}
          onClick={onPickFile}
          disabled={uploading || !teamId}
          busy={uploading}
        />
      )}
    </MenuSection>
  );
}
