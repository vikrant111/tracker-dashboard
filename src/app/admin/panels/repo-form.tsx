"use client";

/**
 * The onboarding form for one repository.
 *
 * Split from `repos-panel.tsx` so that file is the list and this is the form.
 * Both were over the length anyone reads in one sitting when they shared a file.
 */
import { AnimatePresence, motion } from "framer-motion";
import { Check, Plus } from "lucide-react";
import { Button, PasswordField } from "@/components/ui";
import { FREEZE_METHODS, repoId, type Repo } from "@/lib/devops/types";
import { Field } from "./field";

const METHOD_HINT: Record<string, string> = {
  ruleset: "A repository ruleset with lock_branch. The modern API, and the only one that locks a branch outright.",
  protection: "Classic branch protection with the push allow-list emptied. For older repos where rulesets are not enabled.",
  record: "No GitHub call. The board records the freeze so people can see it; nothing is enforced.",
};

export function RepoForm({
  draft,
  patch,
  parsed,
  teams,
  busy,
  problem,
  onSave,
  onCancel,
}: {
  draft: Repo | null;
  patch: (change: Partial<Repo>) => void;
  /** Owner and repo as read from the pasted URL, so the reader sees it landed. */
  parsed: { owner: string; repo: string } | null;
  teams: { id: string; name: string }[];
  busy: string;
  problem: string | null;
  onSave: () => void;
  onCancel: () => void;
}) {
  return (
      <AnimatePresence initial={false}>
        {draft && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="mb-4 overflow-hidden"
          >
            <div className="grid gap-4 rounded-xl border border-[var(--hairline)] bg-[var(--wash)] p-4 sm:grid-cols-2">
              <Field
                label="Repository URL"
                hint={parsed ? `Reads as ${parsed.owner}/${parsed.repo}` : "Paste the GitHub address, e.g. https://github.com/acme/3in1cms"}
                className="sm:col-span-2"
              >
                <input
                  value={draft.url}
                  onChange={(e) => patch({ url: e.target.value })}
                  placeholder="https://github.com/acme/3in1cms"
                  autoFocus
                />
              </Field>

              <Field label="Display name" hint="What this repo is called on the board">
                <input
                  value={draft.name}
                  onChange={(e) => patch({ name: e.target.value })}
                  placeholder={parsed?.repo ?? "3in1cms"}
                />
              </Field>

              <div className="flex flex-col gap-1.5">
                <span className="eyebrow">PODs</span>
                {/*
                  * Chips, not a select. A repository is routinely worked on by
                  * several teams, and the state has to be readable at a glance
                  * rather than hidden behind a closed dropdown.
                  */}
                <span className="flex flex-wrap gap-1.5">
                  {teams.length === 0 && <span className="text-xs text-[var(--ink-muted)]">Create a POD first</span>}
                  {teams.map((t) => {
                    const on = draft.teamIds.includes(t.id);
                    return (
                      <button
                        key={t.id}
                        type="button"
                        aria-pressed={on}
                        onClick={() =>
                          patch({ teamIds: on ? draft.teamIds.filter((id) => id !== t.id) : [...draft.teamIds, t.id] })
                        }
                        className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium transition-colors ${
                          on
                            ? "border-[var(--accent-line)] bg-[var(--accent-tint)] text-[var(--accent-ink)]"
                            : "border-dashed border-[var(--hairline)] text-[var(--ink-muted)] hover:text-[var(--ink)]"
                        }`}
                      >
                        {on ? <Check size={11} aria-hidden /> : <Plus size={11} aria-hidden />}
                        {t.name}
                      </button>
                    );
                  })}
                </span>
                <span className="text-xs text-[var(--ink-muted)]">
                  Optional. Every POD picked sees this repo as theirs on the report.
                </span>
              </div>

              <Field label="Release branch" hint="The branch releases are cut from">
                <input value={draft.releaseBranch} onChange={(e) => patch({ releaseBranch: e.target.value })} />
              </Field>

              <Field label="Develop branch" hint="The branch that gets frozen">
                <input value={draft.developBranch} onChange={(e) => patch({ developBranch: e.target.value })} />
              </Field>

              <Field label="How to freeze" hint={METHOD_HINT[draft.freezeMethod]}>
                <select
                  value={draft.freezeMethod}
                  onChange={(e) => patch({ freezeMethod: e.target.value as Repo["freezeMethod"] })}
                >
                  {FREEZE_METHODS.map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              </Field>

              <Field
                label="GitHub token"
                hint="Needs admin rights on this repo. Leave blank to use the GITHUB_TOKEN environment variable. Never shown again once saved."
              >
                <PasswordField
                  value={draft.token}
                  onChange={(token) => patch({ token })}
                  autoComplete="off"
                  placeholder={draft.id ? "Stored — leave blank to keep it" : "github_pat_…"}
                />
              </Field>

              {problem && (
                <p className="text-xs text-[var(--st-critical-ink)] sm:col-span-2" role="alert">
                  {problem}
                </p>
              )}

              <span className="flex flex-wrap items-center gap-2 sm:col-span-2">
                <Button variant="primary" onClick={onSave} disabled={busy === "repo"}>
                  {busy === "repo" ? "Saving…" : draft.id ? "Save repository" : "Onboard"}
                </Button>
                <Button onClick={onCancel}>Cancel</Button>
                {!draft.id && parsed && (
                  <span className="text-xs text-[var(--ink-muted)]">
                    Will be stored as <code>{repoId(parsed.owner, parsed.repo)}</code>
                  </span>
                )}
              </span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

  );
}
