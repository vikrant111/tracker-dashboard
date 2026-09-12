"use client";

/**
 * Freezing a branch, and the sentence that has to be typed first.
 *
 * This is the one control on the board that changes something outside it, so it
 * does not fire on a single click. Opening it shows the exact requests that
 * will be sent — method, path and why — and freezing needs a reason, because
 * everyone blocked by it will read that reason and nothing else.
 *
 * Unfreezing asks for nothing. Being blocked needs explaining; being unblocked
 * does not.
 */
import { AnimatePresence, motion } from "framer-motion";
import { Lock, LockOpen, Send } from "lucide-react";
import { useState } from "react";
import { Button, Tooltip } from "@/components/ui";
import { describePlan, planFreeze } from "@/lib/devops/github-plan";
import type { Repo } from "@/lib/devops/types";

export function FreezeControl({
  repo,
  busy,
  mode,
  onApply,
}: {
  repo: Repo;
  busy: boolean;
  /** "dry-run" or "live", so the button can say which it is. */
  mode: string;
  onApply: (frozen: boolean, reason: string) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");

  const frozen = repo.freeze.state === "frozen";
  const next = !frozen;
  const plan = planFreeze(repo, next, repo.freeze.rulesetId || undefined);
  const dry = mode !== "live";

  const apply = async () => {
    await onApply(next, reason);
    setOpen(false);
    setReason("");
  };

  return (
    <>
      <Tooltip
        label={
          frozen
            ? `Let ${repo.developBranch} accept pushes and merges again.`
            : `Stop anything being pushed or merged into ${repo.developBranch}.`
        }
      >
        <Button onClick={() => setOpen((v) => !v)} disabled={busy}>
          {frozen ? <LockOpen size={14} /> : <Lock size={14} />}
          {frozen ? "Unfreeze" : "Freeze"}
        </Button>
      </Tooltip>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6, height: 0 }}
            animate={{ opacity: 1, y: 0, height: "auto" }}
            exit={{ opacity: 0, y: -6, height: 0 }}
            className="mt-2 overflow-hidden text-left"
          >
            <div className="flex flex-col gap-2 rounded-xl border border-[var(--hairline)] bg-[var(--wash)] p-3">
              <p className="text-xs font-medium text-[var(--ink)]">
                {next ? "Freeze" : "Unfreeze"} <code>{repo.developBranch}</code> on {repo.owner}/{repo.repo}
              </p>

              {next && (
                <label className="flex flex-col gap-1">
                  <span className="eyebrow">Reason</span>
                  <input
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="Release cut for 2026.09 — hotfixes only, via release branch"
                    autoFocus
                    className="rounded-lg border border-[var(--hairline)] bg-[var(--panel)] px-2.5 py-1.5 text-sm"
                  />
                  <span className="text-xs text-[var(--ink-muted)]">
                    Shown to everyone the freeze blocks.
                  </span>
                </label>
              )}

              {/*
               * The exact requests, before anyone agrees to send them. A control
               * that changes a real repository should not be a button whose
               * effect you have to take on trust.
               */}
              <details className="text-xs">
                <summary className="cursor-pointer text-[var(--ink-muted)] hover:text-[var(--ink)]">
                  {plan.length === 0
                    ? "Nothing is sent to GitHub"
                    : `What gets sent to GitHub (${plan.length} ${plan.length === 1 ? "request" : "requests"})`}
                </summary>
                <pre className="mt-1.5 overflow-x-auto whitespace-pre-wrap rounded-lg bg-[var(--panel)] p-2 font-mono text-[11px] text-[var(--ink-muted)]">
                  {describePlan(plan)}
                </pre>
              </details>

              <span className="flex flex-wrap items-center gap-2">
                <Button variant="primary" onClick={apply} disabled={busy || (next && !reason.trim())}>
                  <Send size={13} />
                  {busy ? "Working…" : dry ? `${next ? "Freeze" : "Unfreeze"} (dry run)` : next ? "Freeze it" : "Unfreeze it"}
                </Button>
                <Button onClick={() => setOpen(false)} disabled={busy}>
                  Cancel
                </Button>

                {/*
                 * Says which mode this is in, next to the button that acts. An
                 * admin should never have to guess whether they just changed a
                 * real branch.
                 */}
                <span className="text-xs text-[var(--ink-muted)]">
                  {dry
                    ? "Dry run — nothing reaches GitHub. Set GITHUB_MODE=live to apply it."
                    : "Live — this changes the real branch."}
                </span>
              </span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
