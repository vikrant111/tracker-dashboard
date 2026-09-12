"use client";

/**
 * Onboarding a GitHub repository.
 *
 * One row per repo, opened to edit. The URL is the field that matters: paste
 * the address of the repo and everything else is worked out from it, because
 * that is what somebody has in their clipboard when they come here.
 */
import { AnimatePresence, motion } from "framer-motion";
import { Github, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { Button, Panel, PanelHeader, PasswordField, Tooltip } from "@/components/ui";
import { blankRepo, parseRepoUrl, type Repo } from "@/lib/devops/types";
import { validateRepo } from "@/lib/devops/validation";
import { RepoForm } from "./repo-form";

export function ReposPanel({
  repos,
  teams,
  busy,
  onSave,
  onDelete,
}: {
  repos: Repo[];
  teams: { id: string; name: string }[];
  busy: string;
  onSave: (repo: Repo) => Promise<void>;
  onDelete: (repo: Repo) => Promise<void>;
}) {
  const [draft, setDraft] = useState<Repo | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [armed, setArmed] = useState<string | null>(null);

  const patch = (change: Partial<Repo>) => setDraft((d) => (d ? { ...d, ...change } : d));

  /*
   * Owner and repo are shown as they are parsed, not asked for. It turns a
   * pasted URL into visible confirmation that the right repository was
   * understood, before anything is saved against it.
   */
  const parsed = draft ? parseRepoUrl(draft.url) : null;

  const save = async () => {
    if (!draft) return;
    const wrong = validateRepo(draft);
    setProblem(wrong);
    if (wrong) return;

    await onSave(draft);
    setDraft(null);
  };

  return (
    <Panel className="p-6">
      <PanelHeader
        eyebrow="DevOps"
        title="Repositories"
        icon={<Github size={16} strokeWidth={2.2} />}
        action={
          !draft && (
            <Button variant="primary" onClick={() => { setDraft(blankRepo()); setProblem(null); }}>
              <Plus size={14} />
              Onboard a repo
            </Button>
          )
        }
      />

      <RepoForm
        draft={draft}
        patch={patch}
        parsed={parsed}
        teams={teams}
        busy={busy}
        problem={problem}
        onSave={save}
        onCancel={() => { setDraft(null); setProblem(null); }}
      />

      {repos.length === 0 && !draft ? (
        <p className="py-6 text-center text-xs text-[var(--ink-muted)]">
          No repositories onboarded yet.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {repos.map((repo) => (
            <li
              key={repo.id}
              className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-[var(--hairline)] px-3 py-2.5"
            >
              <span className="font-medium">{repo.name}</span>
              <span className="font-mono text-xs text-[var(--ink-muted)]">
                {repo.owner}/{repo.repo}
              </span>
              <span className="text-xs text-[var(--ink-muted)]">
                {repo.releaseBranch} · {repo.developBranch}
              </span>
              {repo.token && (
                <Tooltip label="A token is stored for this repo. It is never shown again.">
                  <span className="rounded-md bg-[var(--wash)] px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-[var(--ink-muted)]">
                    token set
                  </span>
                </Tooltip>
              )}

              <span className="ml-auto flex items-center gap-2">
                <Button onClick={() => { setDraft(repo); setProblem(null); }}>Edit</Button>
                <Tooltip label={`Remove ${repo.name} from the board. The repository on GitHub is untouched.`}>
                  <Button
                    onClick={() => {
                      // Two presses, like every other destructive control here.
                      if (armed !== repo.id) return setArmed(repo.id);
                      setArmed(null);
                      void onDelete(repo);
                    }}
                    disabled={busy === "repo"}
                  >
                    <Trash2 size={14} />
                    {armed === repo.id ? "Remove it?" : "Remove"}
                  </Button>
                </Tooltip>
              </span>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
