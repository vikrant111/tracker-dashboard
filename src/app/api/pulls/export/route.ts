/**
 * Download the sign-off report.
 *
 * The columns the board shows, in the same order, honouring **every** filter
 * the board has — repository, merged-when, sign-off state, and the words typed
 * into the filter box. A download that quietly differed from the screen would
 * be a second dataset wearing the same name.
 *
 * The filtering is not re-implemented here: `matchesQuery`, `pullRowFields` and
 * `matchesSignoff` are the same pure functions the panel calls, over the same
 * resolved names. Two copies of one rule is how a file ends up with nine rows
 * where the screen showed eleven.
 */
import ExcelJS from "exceljs";
import { listPulls } from "@/lib/devops/pulls";
import { listRepos } from "@/lib/devops/repos";
import { listCycles } from "@/lib/devops/cycles";
import { REPORT_COLUMNS, toReportRow } from "@/lib/devops/report";
import { cleanQuery, matchesQuery, pullRowFields } from "@/lib/devops/table";
import { cleanSignoffFilter, matchesSignoff } from "@/lib/devops/signoff";
import { DEVOPS_DOWNLOAD } from "@/lib/devops/constants";
import { toCsv } from "@/lib/devops/scope-sheet";
import { accessibleTeams } from "@/lib/api";
import { errorResponse, requireUser } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const user = await requireUser();
    const p = new URL(req.url).searchParams;

    const q = cleanQuery(p.get("q"));
    const signoff = cleanSignoffFilter(p.get("signoff"));

    const [pulls, repos, teams, cycles] = await Promise.all([
      listPulls({ repoId: p.get("repoId") || undefined, on: p.get("on") || undefined }),
      listRepos(),
      accessibleTeams(user),
      listCycles(),
    ]);

    const teamName = new Map(teams.map((t) => [t.id, t.name]));
    const repo = new Map(repos.map((r) => [r.id, r]));
    const cycleName = new Map(cycles.map((c) => [c.id, c.name]));

    /*
     * The POD a row says it is for. A row from before rows carried one falls
     * back to every POD on the repo, which is what the board shows too — and
     * the filter has to search the same text the reader was looking at.
     */
    const podOf = (pr: { teamId?: string; repoId: string }) =>
      pr.teamId
        ? (teamName.get(pr.teamId) ?? pr.teamId)
        : (repo.get(pr.repoId)?.teamIds ?? []).map((id) => teamName.get(id) ?? id).filter(Boolean).join(", ");

    const filtered = pulls.filter(
      (pr) =>
        matchesSignoff(pr.signoffs, Boolean(pr.mergedAt), signoff) &&
        matchesQuery(pullRowFields(pr, repo.get(pr.repoId)?.name ?? pr.repoId, podOf(pr)), q),
    );

    const rows = filtered.map((pr) =>
      toReportRow(pr, {
        project: podOf(pr),
        repo: repo.get(pr.repoId)?.name,
        cycle: cycleName.get(pr.cycleId),
      }),
    );

    const stamp = new Date().toISOString().slice(0, 10);
    const name = `${DEVOPS_DOWNLOAD.reportFile}-${stamp}`;

    if ((p.get("format") ?? "").toLowerCase() === "csv") {
      return new Response(toCsv(rows, REPORT_COLUMNS), {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="${name}.csv"`,
        },
      });
    }

    const workbook = new ExcelJS.Workbook();
    workbook.creator = DEVOPS_DOWNLOAD.creator;
    workbook.created = new Date();
    const ws = workbook.addWorksheet(DEVOPS_DOWNLOAD.reportSheetName);
    ws.columns = REPORT_COLUMNS.map((c) => ({ header: c.header, key: c.field, width: c.width }));
    for (const row of rows) ws.addRow(row);
    ws.getRow(1).font = { bold: true };

    const buffer = await workbook.xlsx.writeBuffer();
    return new Response(buffer as ArrayBuffer, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${name}.xlsx"`,
      },
    });
  } catch (err) {
    return errorResponse(err);
  }
}
