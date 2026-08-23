import ExcelJS from "exceljs";
import { filtersFromRequest } from "@/lib/api";
import { EXPORT_COLUMNS, toRow } from "@/lib/normalize";
import { streamItems } from "@/lib/metrics";
import { errorResponse, requireUser } from "@/lib/session";
import { EXPORT } from "@/lib/constants";

export const dynamic = "force-dynamic";

/**
 * Download the current view as a spreadsheet.
 *
 * The file is written in **exactly the shape the importer reads** — the headers
 * come from `EXPORT_COLUMNS`, every one of which is an alias `mapHeaders`
 * recognises. So a downloaded report can be edited and uploaded straight back
 * with nothing lost and nothing mis-mapped, which is the point of the button.
 *
 * It honours the same filters as the board: POD, kind, severity, environment,
 * status, assignee, search, ageing window. What you are looking at is what you
 * get — a download that quietly ignored the filters would be a different
 * dataset wearing the same name.
 */
export async function GET(req: Request) {
  try {
    const user = await requireUser();
    // The security boundary. A member cannot export a POD they cannot see, for
    // the same reason they cannot view it — this route reads real work items.
    const filters = await filtersFromRequest(req, user);

    const workbook = new ExcelJS.Workbook();
    workbook.creator = "POD Tracker";
    workbook.created = new Date();
    const sheet = workbook.addWorksheet(EXPORT.sheetName);

    sheet.columns = EXPORT_COLUMNS.map((c) => ({ header: c.header, key: c.field, width: c.width }));

    // Paged, not one big request. OpenSearch refuses any `from + size` above
    // `index.max_result_window` (10,000 by default), so asking for the cap in
    // one go failed on *every* board regardless of how many items it held.
    let rows = 0;
    for await (const page of streamItems(filters, "oldest", EXPORT.maxRows, EXPORT.pageSize)) {
      for (const item of page) sheet.addRow(toRow(item));
      rows += page.length;
    }

    // Dates as dates, not as whatever locale string the writer felt like — the
    // importer parses either, but a real date survives a round trip through
    // Excel's own editing without being reformatted into something ambiguous.
    for (const col of ["createdDate", "closedDate"]) {
      const index = EXPORT_COLUMNS.findIndex((c) => c.field === col) + 1;
      if (index > 0) sheet.getColumn(index).numFmt = EXPORT.dateFormat;
    }

    const header = sheet.getRow(1);
    header.font = { bold: true };
    header.eachCell((cell) => {
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: EXPORT.headerFill } };
    });
    // Freeze it, so a 5,000-row export is still readable when you scroll.
    sheet.views = [{ state: "frozen", ySplit: 1 }];
    sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: EXPORT_COLUMNS.length } };

    /*
     * CSV is offered because not everybody has Excel.
     *
     * Numbers, Google Sheets and LibreOffice all open `.xlsx`, but CSV is the
     * format nothing can refuse — and it re-uploads through exactly the same
     * column mapping, so the round trip holds either way.
     */
    const wantsCsv = new URL(req.url).searchParams.get("format") === "csv";

    const body = wantsCsv ? await workbook.csv.writeBuffer() : await workbook.xlsx.writeBuffer();

    return new Response(body, {
      headers: {
        "Content-Type": wantsCsv
          ? "text/csv; charset=utf-8"
          : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        // The filename is built here rather than in the browser so the date and
        // the POD in it always match the data actually inside the file.
        "Content-Disposition": `attachment; filename="${filename(filters.teamId, wantsCsv ? "csv" : "xlsx")}"`,
        // A report is a point-in-time snapshot; caching one would hand back
        // yesterday's numbers under today's name.
        "Cache-Control": "no-store",
        // So a caller can tell a complete export from one that hit the cap.
        "X-Row-Count": String(rows),
      },
    });
  } catch (err) {
    return errorResponse(err);
  }
}

/** `pod-tracker-amc-pod-2026-08-23.xlsx`, or without the POD when unscoped. */
function filename(teamId: string | undefined, extension: "xlsx" | "csv"): string {
  const day = new Date().toISOString().slice(0, 10);
  // Whatever the POD id contains, the filename may not contain a quote, a
  // slash or a control character — a Content-Disposition header is parsed, and
  // a crafted POD name must not be able to steer it.
  const scope = String(teamId ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return `${["pod-tracker", scope, day].filter(Boolean).join("-")}.${extension}`;
}
