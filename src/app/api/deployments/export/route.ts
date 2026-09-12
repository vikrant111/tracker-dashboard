/**
 * Download the scope sheet.
 *
 * Honours the same filters as the board — repo, cycle, environment, branch,
 * date prefix, and the words typed into the filter box — so what you are
 * looking at is what you get. A download that quietly ignored the filters would
 * be a different dataset wearing the same name.
 *
 * The text filter is the same pure pair the panel uses, `scopeRowFields` and
 * `matchesQuery`, over the same resolved POD name. Re-implementing it here is
 * how a file ends up with rows the screen had filtered out.
 *
 * The live severity and status columns are joined from the tracker at download
 * time, so a sheet mailed to a stakeholder carries what is true now.
 */
import ExcelJS from "exceljs";
import { listDeployments } from "@/lib/devops/deployments";
import { listCycles } from "@/lib/devops/cycles";
import { listRepos } from "@/lib/devops/repos";
import { SCOPE_COLUMNS, toCsv, toScopeRow, type LiveBug } from "@/lib/devops/scope-sheet";
import { cleanQuery, matchesQuery, scopeRowFields } from "@/lib/devops/table";
import { DEVOPS_DOWNLOAD } from "@/lib/devops/constants";
import { getStore } from "@/db/store";
import { accessibleTeams } from "@/lib/api";
import { errorResponse, requireUser } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const user = await requireUser();
    const p = new URL(req.url).searchParams;

    const q = cleanQuery(p.get("q"));

    const rows = await listDeployments({
      repoId: p.get("repoId") || undefined,
      cycleId: p.get("cycleId") || undefined,
      environment: p.get("environment") || undefined,
      branch: p.get("branch") || undefined,
      on: p.get("on") || undefined,
    });

    const [repos, cycles, teams] = await Promise.all([listRepos(), listCycles(), accessibleTeams(user)]);
    const repoName = new Map(repos.map((r) => [r.id, r.name]));
    const cycleName = new Map(cycles.map((c) => [c.id, c.name]));
    const teamName = new Map(teams.map((t) => [t.id, t.name]));
    const repoById = new Map(repos.map((r) => [r.id, r]));

    /*
     * The POD the row says it is for, falling back to every POD on the repo —
     * exactly what the board shows, so the file and the screen cannot disagree,
     * and so the filter searches the same words the reader could see.
     */
    const podOf = (row: { teamId: string; repoId: string }) =>
      row.teamId
        ? (teamName.get(row.teamId) ?? row.teamId)
        : (repoById.get(row.repoId)?.teamIds ?? []).map((id) => teamName.get(id) ?? id).join(", ");

    const filtered = rows.filter((row) => matchesQuery(scopeRowFields(row, podOf(row)), q));

    /*
     * One pass over the items for every ticket on the sheet, rather than a
     * lookup per row. The sheet is small; the item collection is not. Done
     * after filtering, so a narrow download does not read the whole board.
     */
    const wanted = new Set(filtered.map((r) => r.ticket).filter(Boolean));
    const live = new Map<string, LiveBug>();
    if (wanted.size) {
      const store = getStore();
      await store.init();
      for (const item of await store.items.find({}, Date.now())) {
        const id = String(item.workItemId ?? "");
        if (wanted.has(id)) live.set(id, { severity: String(item.severity ?? ""), status: String(item.status ?? "") });
      }
    }

    const sheet = filtered.map((r) =>
      toScopeRow(
        r,
        { repo: repoName.get(r.repoId), cycle: cycleName.get(r.cycleId), pod: podOf(r) },
        live.get(r.ticket),
      ),
    );

    const stamp = new Date().toISOString().slice(0, 10);
    const name = `${DEVOPS_DOWNLOAD.scopeFile}-${stamp}`;

    if ((p.get("format") ?? "").toLowerCase() === "csv") {
      return new Response(toCsv(sheet), {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="${name}.csv"`,
        },
      });
    }

    const workbook = new ExcelJS.Workbook();
    workbook.creator = DEVOPS_DOWNLOAD.creator;
    workbook.created = new Date();
    const ws = workbook.addWorksheet(DEVOPS_DOWNLOAD.scopeSheetName);
    ws.columns = SCOPE_COLUMNS.map((c) => ({ header: c.header, key: c.field, width: c.width }));
    for (const row of sheet) ws.addRow(row);
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
