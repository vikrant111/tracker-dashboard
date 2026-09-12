"use client";

/**
 * Which changes reached the release branch, and who agreed to them.
 *
 * The risky rows — merged without business or QA — sort to the top and are
 * marked, because they are the reason this report exists. Everything else is
 * context for finding them.
 *
 * The filters live in `use-report-filters.ts`, and the download links carry
 * every one of them. What you are looking at is what you get: a file quietly
 * holding rows the screen had filtered out would be a second dataset wearing
 * the same name.
 */
import { AlertTriangle, Download, ShieldCheck } from "lucide-react";
import { useState } from "react";
import useSWR from "swr";
import { SWR_OPTIONS, failureReason, fetcher } from "@/lib/swr";
import {
  SIGNOFF_FILTERS,
  SIGNOFF_FILTER_LABEL,
  matchesSignoff,
  signoffState,
  type SignoffFilter,
} from "@/lib/devops/signoff";
import { cycleForPull } from "@/lib/devops/to-scope";
import type { Cycle, PullRecord, Repo } from "@/lib/devops/types";
import { Button, Empty, Panel, PanelHeader, Tooltip } from "@/components/ui";
import { PeriodPicker } from "./period-picker";
import { BarSelect, Pager, TableBar, TableFilter } from "./table-controls";
import { matchesQuery, paginate, pullRowFields } from "@/lib/devops/table";
import { podsOfRepo } from "@/lib/devops/pods";
import { SyncControl } from "./sync-control";
import { useReportFilters } from "./use-report-filters";
import { useReportWrites } from "./use-report-writes";
import { ReportTable } from "./report-table";

export function SignoffReport({
  repos,
  teamNames,
  isAdmin,
  canEdit,
  flash,
}: {
  repos: Repo[];
  teamNames: Record<string, string>;
  isAdmin: boolean;
  canEdit: boolean;
  flash: (text: string, tone?: "ok" | "bad") => void;
}) {
  const [busy, setBusy] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const f = useReportFilters();

  const { data, error, mutate } = useSWR<{ pulls?: PullRecord[]; error?: string }>(
    f.listHref,
    fetcher,
    SWR_OPTIONS,
  );
  const cycleReq = useSWR<{ cycles?: Cycle[] }>("/api/cycles", fetcher, SWR_OPTIONS);

  const cycles = Array.isArray(cycleReq.data?.cycles) ? cycleReq.data.cycles : [];
  const failed = failureReason(error, data);
  const all = Array.isArray(data?.pulls) ? data.pulls : [];

  const repoOf = (id: string) => repos.find((r) => r.id === id);
  const repoName = (id: string) => repoOf(id)?.name ?? id;
  /** The PODs a row's repo has, for the drawer's picker. */
  const podsFor = (pr: PullRecord) => podsOfRepo(repoOf(pr.repoId), teamNames).pods;
  const podName = (pr: PullRecord) => {
    const { podOf, repoPods } = podsOfRepo(repoOf(pr.repoId), teamNames);
    // A row from before rows had their own POD falls back to the repo's, so the
    // column says something rather than reading as a mistake.
    return podOf(pr) || repoPods;
  };

  /* Where a moved row lands: the cycle the pull request itself carries, and
     nothing else. Set it in the drawer and the move follows. */
  const cycleFor = (pr: PullRecord) => cycleForPull(pr, cycles);

  /*
   * Filtered, then paged. The other order pages the whole list and then filters
   * one page of it, which shows an empty table with rows behind it. The fields
   * searched come from `lib/devops/table.ts`, the same list the download uses —
   * or a filter finding eleven rows here would write nine into the file.
   */
  const matched = all.filter(
    (p) =>
      matchesSignoff(p.signoffs, Boolean(p.mergedAt), f.signoff) &&
      matchesQuery(pullRowFields(p, repoName(p.repoId), podName(p)), f.text),
  );
  const shown = paginate(matched, f.page);
  const pulls = shown.rows;
  const risky = pulls.filter((p) => signoffState(p.signoffs, Boolean(p.mergedAt)).risk).length;

  const { sync, annotate, toggle, moveToScope } = useReportWrites({
    repoId: f.repoId || repos[0]?.id,
    setBusy,
    flash,
    refresh: () => mutate(),
  });

  return (
    <Panel className="p-4 sm:p-6" delay={0.15}>
      <PanelHeader
        eyebrow="Merged to release"
        title="Sign-off report"
        icon={<ShieldCheck size={16} strokeWidth={2.2} />}
        action={
          <span className="flex flex-wrap items-center gap-2">
            <Tooltip label="Download exactly the rows below — repository, period, sign-off state and filter all carried across.">
              <a href={f.downloadHref()} download>
                <Button>
                  <Download size={14} />
                  Excel
                </Button>
              </a>
            </Tooltip>
            <Tooltip label="The same filtered rows as CSV, for anyone without Excel.">
              <a href={f.downloadHref("csv")} download>
                <Button>CSV</Button>
              </a>
            </Tooltip>
            {isAdmin && <SyncControl repos={repos} busy={busy === "sync"} onSync={sync} />}
          </span>
        }
      />

      <TableBar count={`${shown.total} ${shown.total === 1 ? "row" : "rows"}`}>
        <BarSelect label="Repository" value={f.repoId} onChange={f.setRepoId}>
          <option value="">Every repository</option>
          {repos.map((r) => (
            <option key={r.id} value={r.id}>{r.name}</option>
          ))}
        </BarSelect>

        <PeriodPicker value={f.period} onChange={f.setPeriod} known={all.map((p) => p.mergedOn)} label="Merged when" />

        {/*
          * Complete or incomplete: the two questions this report is actually
          * read for — "what is cleared to ship" and "what is still waiting on
          * somebody" — rather than something to work out by reading a column.
          */}
        <BarSelect
          label="Sign-off state"
          value={f.signoff}
          onChange={(next) => f.setSignoff(next as SignoffFilter)}
        >
          {SIGNOFF_FILTERS.map((option) => (
            <option key={option} value={option}>{SIGNOFF_FILTER_LABEL[option]}</option>
          ))}
        </BarSelect>

        <TableFilter value={f.text} onChange={f.setText} placeholder="Filter rows" />

        {risky > 0 && (
          <span className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--st-critical)] px-2 py-1.5 text-xs font-medium text-[var(--st-critical-ink)]">
            <AlertTriangle size={13} aria-hidden />
            {risky} without business or QA
          </span>
        )}
      </TableBar>

      {failed ? (
        <Empty title="Could not load the report" hint={failed} />
      ) : pulls.length === 0 ? (
        <Empty
          title={all.length === 0 ? "No merged pull requests yet" : "Nothing matches these filters"}
          hint={
            all.length > 0
              ? "Widen the sign-off state, or clear the filter box."
              : isAdmin
                ? "Sync PRs reads them from GitHub. It needs a token on the repository."
                : "An admin syncs these from GitHub."
          }
        />
      ) : (
        <>
          <ReportTable
            pulls={pulls}
            repoName={repoName}
            podName={podName}
            podsFor={podsFor}
            cycles={cycles}
            canEdit={canEdit}
            cycleFor={cycleFor}
            busy={busy}
            openId={openId}
            onOpen={setOpenId}
            onToggle={toggle}
            onAnnotate={annotate}
            onMove={(pr) => moveToScope(pr, cycleFor(pr))}
          />
          <Pager page={shown} onPage={f.setPage} />
        </>
      )}
    </Panel>
  );
}
