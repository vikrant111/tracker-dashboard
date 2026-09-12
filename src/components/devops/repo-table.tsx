"use client";

/**
 * Every onboarded repository, and where its branches stand.
 *
 * The board's front page. A member opens it to answer one question — can I push
 * to develop right now — so freeze state is the column the eye lands on, and
 * everything else is arranged around it.
 */
import { AnimatePresence, motion } from "framer-motion";
import { ExternalLink, GitBranch, Search, Rocket } from "lucide-react";
import { useState } from "react";
import type { Repo } from "@/lib/devops/types";
import { Empty, Panel, PanelHeader, Tooltip } from "@/components/ui";
import { FreezeBadge } from "./freeze-badge";

export function RepoTable({
  repos,
  teamNames,
  action,
}: {
  repos: Repo[];
  /** POD names by id, so a repo shows the team rather than a slug. */
  teamNames: Record<string, string>;
  /** The freeze control, supplied by the parent so this stays presentational. */
  action?: (repo: Repo) => React.ReactNode;
}) {
  const [query, setQuery] = useState("");

  const needle = query.trim().toLowerCase();
  const shown = needle
    ? repos.filter((r) =>
        [r.name, r.owner, r.repo, r.releaseBranch, r.developBranch].some((v) => v.toLowerCase().includes(needle)),
      )
    : repos;

  const frozen = repos.filter((r) => r.freeze.state === "frozen").length;

  return (
    <Panel className="p-4 sm:p-6">
      <PanelHeader
        eyebrow="Across every repository"
        title="Branch status"
        icon={<GitBranch size={16} strokeWidth={2.2} />}
        action={
          <span className="text-xs text-[var(--ink-muted)]">
            {repos.length} {repos.length === 1 ? "repo" : "repos"}
            {frozen > 0 && ` · ${frozen} frozen`}
          </span>
        }
      />

      {repos.length === 0 ? (
        <Empty
          title="No repositories yet"
          hint="An admin can onboard one from Admin → Repositories: paste the GitHub URL and name the release and develop branches."
        />
      ) : (
        <>
          {/* Only worth a search box once the list outgrows a glance. */}
          {repos.length > 5 && (
            <div className="relative mb-3">
              <Search
                size={14}
                aria-hidden
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--ink-muted)]"
              />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Filter by repo or branch"
                aria-label="Filter repositories"
                className="w-full rounded-lg border border-[var(--hairline)] bg-[var(--panel)] py-2 pl-9 pr-3 text-sm"
              />
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="w-full min-w-[46rem] border-collapse text-sm">
              <thead>
                <tr className="text-left">
                  {["Repository", "PODs", "Release branch", "Develop branch", "Status"].map((h) => (
                    <th key={h} className="eyebrow pb-2 font-medium">
                      {h}
                    </th>
                  ))}
                  {action && <th className="pb-2" />}
                </tr>
              </thead>

              <tbody>
                <AnimatePresence initial={false}>
                  {shown.map((repo, i) => (
                    <motion.tr
                      key={repo.id}
                      layout
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      transition={{ delay: Math.min(i * 0.03, 0.24) }}
                      className="border-t border-[var(--hairline)]"
                    >
                      <td className="py-3 pr-3">
                        <Tooltip label={`Open ${repo.owner}/${repo.repo} on GitHub`}>
                          <a
                            href={repo.url}
                            target="_blank"
                            rel="noreferrer noopener"
                            className="inline-flex items-center gap-1.5 font-medium text-[var(--ink)] transition-colors hover:text-[var(--accent-ink)]"
                          >
                            {repo.name}
                            <ExternalLink size={12} aria-hidden />
                          </a>
                        </Tooltip>
                        <div className="text-xs text-[var(--ink-muted)]">{repo.owner}</div>
                      </td>

                      <td className="py-3 pr-3 text-[var(--ink-muted)]">
                        {/*
                          * `?? []` because one odd row must not take the board
                          * with it. The store fills schema defaults on read, so
                          * this should never be missing — but a page that throws
                          * on a single row loses every other row too.
                          */}
                        {(repo.teamIds ?? []).length === 0 ? (
                          <span className="text-xs">Not linked</span>
                        ) : (
                          <span className="flex flex-wrap gap-1">
                            {(repo.teamIds ?? []).map((id) => (
                              <span key={id} className="rounded-md bg-[var(--wash)] px-1.5 py-0.5 text-xs">
                                {teamNames[id] ?? id}
                              </span>
                            ))}
                          </span>
                        )}
                      </td>

                      <td className="py-3 pr-3">
                        <Branch name={repo.releaseBranch} icon={<Rocket size={11} aria-hidden />} />
                      </td>
                      <td className="py-3 pr-3">
                        <Branch name={repo.developBranch} icon={<GitBranch size={11} aria-hidden />} />
                      </td>

                      <td className="py-3 pr-3">
                        <FreezeBadge
                          state={repo.freeze.state}
                          reason={repo.freeze.reason}
                          changedAt={repo.freeze.changedAt}
                          changedBy={repo.freeze.changedBy}
                          detail={repo.freeze.detail}
                        />
                      </td>

                      {action && <td className="py-3 text-right">{action(repo)}</td>}
                    </motion.tr>
                  ))}
                </AnimatePresence>
              </tbody>
            </table>
          </div>

          {shown.length === 0 && (
            <p className="py-6 text-center text-xs text-[var(--ink-muted)]">
              Nothing matches “{query}”.
            </p>
          )}
        </>
      )}
    </Panel>
  );
}

/** A branch name, in the monospace it deserves. */
function Branch({ name, icon }: { name: string; icon: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-md bg-[var(--wash)] px-2 py-1 font-mono text-xs text-[var(--ink)]">
      <span className="text-[var(--ink-muted)]">{icon}</span>
      {name}
    </span>
  );
}
