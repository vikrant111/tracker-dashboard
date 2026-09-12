"use client";

/**
 * Reading merged pull requests from GitHub: which repo, which branch.
 *
 * The branch is a field rather than a fixed value because teams cut from more
 * than one — a hotfix branch, last quarter's release — and a report that could
 * only ever read the release branch left the rest invisible.
 *
 * It is prefilled with the repo's release branch, so the common case is still
 * one click.
 */
import { RefreshCw } from "lucide-react";
import { useState } from "react";
import type { Repo } from "@/lib/devops/types";
import { Button, Tooltip } from "@/components/ui";
import { Popover } from "./popover";

export function SyncControl({
  repos,
  busy,
  onSync,
}: {
  repos: Repo[];
  busy: boolean;
  onSync: (repoId: string, branch: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [repoId, setRepoId] = useState(repos[0]?.id ?? "");
  const [branch, setBranch] = useState("");
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);

  const repo = repos.find((r) => r.id === repoId) ?? repos[0];
  const field = "w-full rounded-lg border border-[var(--hairline)] bg-[var(--panel)] !py-1.5 !px-2.5 text-sm";

  return (
    <>
      <span ref={setAnchor}>
        <Tooltip label="Read merged pull requests from GitHub. Changes nothing on GitHub; it only reads.">
          <Button onClick={() => setOpen((v) => !v)} disabled={busy || repos.length === 0}>
            <RefreshCw size={14} className={busy ? "animate-spin" : ""} />
            {busy ? "Reading" : "Sync PRs"}
          </Button>
        </Tooltip>
      </span>

      <Popover open={open} onClose={() => setOpen(false)} trigger={anchor} width={280}>
        <div className="flex flex-col gap-2">
          <label className="flex flex-col gap-1">
            <span className="eyebrow">Repository</span>
            <select value={repo?.id ?? ""} onChange={(e) => { setRepoId(e.target.value); setBranch(""); }} className={field}>
              {repos.map((r) => (
                <option key={r.id} value={r.id}>{r.name}</option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1">
            <span className="eyebrow">Branch</span>
            <input
              value={branch}
              onChange={(e) => setBranch(e.target.value)}
              placeholder={repo?.releaseBranch ?? "release"}
              className={`${field} font-mono`}
            />
            <span className="text-xs text-[var(--ink-muted)]">
              Blank reads {repo?.releaseBranch ?? "the release branch"}.
            </span>
          </label>

          <Button
            variant="primary"
            onClick={() => {
              onSync(repo?.id ?? "", branch.trim());
              setOpen(false);
            }}
            disabled={busy || !repo}
          >
            <RefreshCw size={13} />
            Read merged PRs
          </Button>
        </div>
      </Popover>
    </>
  );
}
