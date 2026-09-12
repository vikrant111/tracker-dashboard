"use client";

/**
 * Adding a row to the scope sheet.
 *
 * The one thing on this board a member writes, because they are the person who
 * knows what their change is and which branch it sits on.
 *
 * Only the title is required. Everything else has a sensible default, because a
 * half-filled row that exists beats a complete row nobody bothered to add —
 * the sheet is only useful if people actually fill it in.
 */
import { motion } from "framer-motion";
import { Send } from "lucide-react";
import type { Cycle, Deployment } from "@/lib/devops/types";
import { ScopePicks } from "./scope-picks";
import { Button, Tooltip } from "@/components/ui";

export function ScopeForm({
  draft,
  setDraft,
  cycles,
  pods,
  busy,
  problem,
  frozenBecause,
  onSave,
  onCancel,
}: {
  draft: Partial<Deployment>;
  setDraft: (d: Partial<Deployment>) => void;
  cycles: Cycle[];
  /** The PODs this repo is linked to — the only ones a row may belong to. */
  pods: { id: string; name: string }[];
  busy: boolean;
  problem: string | null;
  /** Why the sheet is closed, when it is. Disables everything. */
  frozenBecause: string | null;
  onSave: () => void;
  onCancel: () => void;
}) {
  const set = (change: Partial<Deployment>) => setDraft({ ...draft, ...change });
  const shut = Boolean(frozenBecause);

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: "auto" }}
      exit={{ opacity: 0, height: 0 }}
      className="mb-3 overflow-hidden"
    >
      <fieldset
        disabled={shut || busy}
        className="flex flex-col gap-2 rounded-xl border border-[var(--hairline)] bg-[var(--wash)] p-3 disabled:opacity-60"
      >
        {frozenBecause && (
          <p className="text-xs text-[var(--st-critical-ink)]" role="status">
            {frozenBecause}
          </p>
        )}

        <ScopePicks draft={draft} set={set} cycles={cycles} pods={pods} />

        <div className="grid gap-2 sm:grid-cols-[10rem_1fr]">
          <Tooltip label="The work item id, when there is one. It is what links this row to the bug on the POD board, so its severity and status stay current here.">
            <input
              value={draft.ticket ?? ""}
              onChange={(e) => set({ ticket: e.target.value })}
              placeholder="Ticket / bug id"
              aria-label="Ticket or bug id"
              className="w-full rounded-lg border border-[var(--hairline)] bg-[var(--panel)] px-2.5 py-1.5 text-sm"
            />
          </Tooltip>
          <input
            value={draft.title ?? ""}
            onChange={(e) => set({ title: e.target.value })}
            placeholder="What is going out — the only field that is required"
            aria-label="Title"
            className="rounded-lg border border-[var(--hairline)] bg-[var(--panel)] px-2.5 py-1.5 text-sm"
          />
        </div>

        <div className="grid gap-2 sm:grid-cols-2">
          <input
            value={draft.branch ?? ""}
            onChange={(e) => set({ branch: e.target.value })}
            placeholder="Branch it is sitting on"
            aria-label="Branch"
            className="rounded-lg border border-[var(--hairline)] bg-[var(--panel)] px-2.5 py-1.5 font-mono text-sm"
          />
          <input
            value={draft.prUrl ?? ""}
            onChange={(e) => set({ prUrl: e.target.value })}
            placeholder="Pull request URL"
            aria-label="Pull request URL"
            className="rounded-lg border border-[var(--hairline)] bg-[var(--panel)] px-2.5 py-1.5 text-sm"
          />
        </div>

        <textarea
          value={draft.notes ?? ""}
          onChange={(e) => set({ notes: e.target.value })}
          placeholder="Anything the next person reading this sheet needs to know"
          aria-label="Notes"
          rows={2}
          className="rounded-lg border border-[var(--hairline)] bg-[var(--panel)] px-2.5 py-1.5 text-sm"
        />

        {problem && (
          <p className="text-xs text-[var(--st-critical-ink)]" role="alert">{problem}</p>
        )}

        <span className="flex items-center gap-2">
          <Button variant="primary" onClick={onSave} disabled={shut || busy}>
            <Send size={13} />
            {busy ? "Saving…" : draft.id ? "Save row" : "Add to the sheet"}
          </Button>
          <Button onClick={onCancel}>Cancel</Button>
        </span>
      </fieldset>
    </motion.div>
  );
}
