"use client";

/**
 * The scope sheet for a deployment cycle.
 *
 * Which bug is on which branch, in which environment, and where it has got to.
 * Members fill it in; admins freeze it when the scope is agreed and download it
 * when it is done.
 *
 * The download links carry the filter box as well as the cycle, so the file
 * holds exactly the rows on screen.
 */
import { AnimatePresence } from "framer-motion";
import { ClipboardList } from "lucide-react";
import { useState } from "react";
import useSWR from "swr";
import { SWR_OPTIONS, failureReason, fetcher } from "@/lib/swr";
import { refuseIfScopeFrozen } from "@/lib/devops/records";
import type { Cycle, Deployment, Repo } from "@/lib/devops/types";
import { Empty, Panel, PanelHeader } from "@/components/ui";
import { ScopeForm } from "./scope-form";
import { ScopeTable } from "./scope-table";
import { ScopeActions } from "./scope-actions";
import { Pager } from "./table-controls";
import { ScopeBar } from "./scope-bar";
import { matchesQuery, paginate, scopeRowFields } from "@/lib/devops/table";
import { podsOfRepo } from "@/lib/devops/pods";
import { useScopeWrites } from "./use-scope-writes";

export function ScopeSheet({
  repos,
  teamNames,
  isAdmin,
  canEdit,
  flash,
}: {
  repos: Repo[];
  /** POD names by id, so a row says which team it is about. */
  teamNames: Record<string, string>;
  isAdmin: boolean;
  /** Whether this reader may change a row that already exists. */
  canEdit: boolean;
  flash: (text: string, tone?: "ok" | "bad") => void;
}) {
  const [repoId, setRepoId] = useState("");
  const [cycleId, setCycleId] = useState("");
  const [draft, setDraft] = useState<Partial<Deployment> | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [armed, setArmed] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);

  /* No repositories renders an explanation rather than throwing on `repos[0]`. */
  const list = Array.isArray(repos) ? repos : [];
  const repo = list.find((r) => r.id === repoId) ?? list[0];

  const cycleReq = useSWR<{ cycles?: Cycle[]; error?: string }>(
    repo ? `/api/cycles?repoId=${encodeURIComponent(repo.id)}` : null,
    fetcher,
    SWR_OPTIONS,
  );
  const cycles = Array.isArray(cycleReq.data?.cycles) ? cycleReq.data.cycles : [];
  const cycle = cycles.find((c) => c.id === cycleId) ?? cycles[0];

  const rowsReq = useSWR<{ deployments?: Deployment[]; error?: string }>(
    cycle ? `/api/deployments?cycleId=${encodeURIComponent(cycle.id)}` : null,
    fetcher,
    SWR_OPTIONS,
  );
  const all = Array.isArray(rowsReq.data?.deployments) ? rowsReq.data.deployments : [];

  const { pods, podOf, repoPods } = podsOfRepo(repo, teamNames);

  /*
   * Filtered, then paged. The other order pages the whole list and then filters
   * one page of it, which shows an empty table with rows behind it. The fields
   * searched come from `lib/devops/table.ts`, which the download route uses
   * too — so the file holds the rows the filter actually matched.
   */
  const matched = all.filter((r) => matchesQuery(scopeRowFields(r, podOf(r) || repoPods), query));
  const shown = paginate(matched, page);
  const rows = shown.rows;
  const failed = failureReason(rowsReq.error, rowsReq.data) ?? failureReason(cycleReq.error, cycleReq.data);

  // One rule, shared with the server, so the form and the API cannot disagree
  // about whether the sheet is open.
  const shut = refuseIfScopeFrozen(cycle);

  const { save, saveRow, remove, setFrozen } = useScopeWrites({
    repo,
    cycle,
    draft,
    setDraft,
    setBusy,
    setProblem,
    flash,
    refresh: () => rowsReq.mutate(),
    refreshCycles: () => cycleReq.mutate(),
  });

  return (
    <Panel className="p-4 sm:p-6" delay={0.1}>
      <PanelHeader
        eyebrow="Deployment records"
        title="Scope sheet"
        icon={<ClipboardList size={16} strokeWidth={2.2} />}
        action={
          <ScopeActions
            cycle={cycle}
            query={query}
            isAdmin={isAdmin}
            busy={busy}
            showAdd={!draft}
            /* One POD means nothing to choose, so the row starts with it. */
            onAdd={() =>
              setDraft({ kind: "bug", state: "planned", branch: cycle?.releaseBranch ?? "", teamId: pods.length === 1 ? pods[0].id : "" })
            }
            onFreeze={setFrozen}
          />
        }
      />

      <ScopeBar
        repos={list}
        cycles={cycles}
        repoId={repo?.id ?? ""}
        cycleId={cycle?.id ?? ""}
        repoName={repo?.name ?? ""}
        pods={pods}
        query={query}
        total={shown.total}
        frozenBecause={shut}
        onRepo={(id) => { setRepoId(id); setCycleId(""); setPage(1); }}
        onCycle={(id) => { setCycleId(id); setPage(1); }}
        onQuery={(q) => { setQuery(q); setPage(1); }}
      />

      <AnimatePresence initial={false}>
        {draft && (
          <ScopeForm
            pods={pods}
            draft={draft}
            setDraft={setDraft}
            cycles={cycles}
            busy={busy}
            problem={problem}
            frozenBecause={shut}
            onSave={save}
            onCancel={() => { setDraft(null); setProblem(null); }}
          />
        )}
      </AnimatePresence>

      {failed ? (
        <Empty title="Could not load the sheet" hint={failed} />
      ) : list.length === 0 ? (
        <Empty
          title="No repositories yet"
          hint="An admin onboards one in Admin → DevOps before there is a sheet to fill in."
        />
      ) : !cycle ? (
        <Empty
          title="No deployment cycle yet"
          hint={isAdmin ? "Create one in Admin → Repositories to start a scope sheet." : "An admin creates a cycle before rows can be added."}
        />
      ) : rows.length === 0 ? (
        <Empty
          title={query ? "Nothing matches that filter" : `Nothing in scope for ${cycle.name}`}
          hint={query ? "Clear the filter box to see the whole sheet." : "Add the bugs and hotfixes going out in this cycle."}
        />
      ) : (
        <>
          <ScopeTable
            rows={rows}
            podOf={podOf}
            repoPods={repoPods}
            repoName={repo?.name ?? ""}
            pods={pods}
            isAdmin={isAdmin}
            canEdit={canEdit}
            busy={busy}
            armed={armed}
            openId={openId}
            frozen={Boolean(shut)}
            setArmed={setArmed}
            onOpen={setOpenId}
            onSave={saveRow}
            onRemove={remove}
          />
          <Pager page={shown} onPage={setPage} />
        </>
      )}
    </Panel>
  );
}
