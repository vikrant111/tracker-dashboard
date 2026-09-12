"use client";

/**
 * Writing an announcement.
 *
 * Split from the list so each file does one job. The kind is a row of chips
 * rather than a select: there are four, and the icon is what people recognise
 * in the list underneath — picking it from a dropdown would hide the thing that
 * makes it findable later.
 */
import { AnimatePresence, motion } from "framer-motion";
import { Pin, Rocket, Snowflake, StickyNote, Zap } from "lucide-react";
import { Button, Tooltip } from "@/components/ui";
import { ANNOUNCEMENT_KINDS, type Announcement, type AnnouncementKind, type Repo } from "@/lib/devops/types";

const HINT: Record<AnnouncementKind, { Icon: typeof Rocket; hint: string }> = {
  release: { Icon: Rocket, hint: "A release has been cut or deployed." },
  freeze: { Icon: Snowflake, hint: "A branch is locked, or about to be." },
  hotfix: { Icon: Zap, hint: "Something is going out outside the normal cycle." },
  note: { Icon: StickyNote, hint: "Anything else worth saying." },
};

/** A chip that reads as pressed, not merely tinted. */
const chip = (on: boolean) =>
  `inline-flex items-center gap-1 rounded-lg border px-2 py-1.5 text-xs font-medium transition-colors ${
    on
      ? "border-[var(--accent-line)] bg-[var(--accent-tint)] text-[var(--accent-ink)]"
      : "border-dashed border-[var(--hairline)] text-[var(--ink-muted)] hover:text-[var(--ink)]"
  }`;

export function AnnouncementComposer({
  draft,
  setDraft,
  repos,
  busy,
  problem,
  onPost,
  onCancel,
}: {
  draft: Partial<Announcement> | null;
  setDraft: (d: Partial<Announcement> | null) => void;
  repos: Repo[];
  busy: boolean;
  problem: string | null;
  onPost: () => void;
  onCancel: () => void;
}) {
  if (!draft) return null;

  return (
      <AnimatePresence initial={false}>
        {draft && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="mb-3 overflow-hidden"
          >
            <div className="flex flex-col gap-2 rounded-xl border border-[var(--hairline)] bg-[var(--wash)] p-3">
              <div className="flex flex-wrap gap-2">
                <select
                  aria-label="Repository"
                  value={draft.repoId ?? ""}
                  onChange={(e) => setDraft({ ...draft, repoId: e.target.value })}
                  className="rounded-lg border border-[var(--hairline)] bg-[var(--panel)] px-2 py-1.5 text-sm"
                >
                  {repos.map((r) => (
                    <option key={r.id} value={r.id}>{r.name}</option>
                  ))}
                </select>

                {/* Kind is a chip row rather than a select: four options, and the
                    icon is what people recognise in the list below. */}
                {ANNOUNCEMENT_KINDS.map((k) => {
                  const { Icon, hint } = HINT[k];
                  const on = (draft.kind ?? "note") === k;
                  return (
                    <Tooltip key={k} label={hint}>
                      <button
                        type="button"
                        aria-pressed={on}
                        onClick={() => setDraft({ ...draft, kind: k })}
                        className={`inline-flex items-center gap-1 rounded-lg border px-2 py-1.5 text-xs font-medium transition-colors ${
                          on
                            ? "border-[var(--accent-line)] bg-[var(--accent-tint)] text-[var(--accent-ink)]"
                            : "border-dashed border-[var(--hairline)] text-[var(--ink-muted)] hover:text-[var(--ink)]"
                        }`}
                      >
                        <Icon size={12} aria-hidden />
                        {k}
                      </button>
                    </Tooltip>
                  );
                })}

                <Tooltip label="Keep this at the top of the list until it is unpinned.">
                  <button
                    type="button"
                    aria-pressed={Boolean(draft.pinned)}
                    onClick={() => setDraft({ ...draft, pinned: !draft.pinned })}
                    className={`inline-flex items-center gap-1 rounded-lg border px-2 py-1.5 text-xs font-medium transition-colors ${
                      draft.pinned
                        ? "border-[var(--accent-line)] bg-[var(--accent-tint)] text-[var(--accent-ink)]"
                        : "border-dashed border-[var(--hairline)] text-[var(--ink-muted)] hover:text-[var(--ink)]"
                    }`}
                  >
                    <Pin size={12} aria-hidden />
                    Pin
                  </button>
                </Tooltip>
              </div>

              <input
                value={draft.title ?? ""}
                onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                placeholder="Release 2026.09 cut from release — develop is frozen"
                autoFocus
                className="rounded-lg border border-[var(--hairline)] bg-[var(--panel)] px-2.5 py-1.5 text-sm"
              />
              <textarea
                value={draft.body ?? ""}
                onChange={(e) => setDraft({ ...draft, body: e.target.value })}
                placeholder="Anything else people need — what is in it, who to ask, when it lifts."
                rows={3}
                className="rounded-lg border border-[var(--hairline)] bg-[var(--panel)] px-2.5 py-1.5 text-sm"
              />

              {problem && (
                <p className="text-xs text-[var(--st-critical-ink)]" role="alert">{problem}</p>
              )}

              <span className="flex items-center gap-2">
                <Button variant="primary" onClick={onPost} disabled={busy}>
                  {busy ? "Posting…" : "Post it"}
                </Button>
                <Button onClick={onCancel}>Cancel</Button>
              </span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

  );
}
