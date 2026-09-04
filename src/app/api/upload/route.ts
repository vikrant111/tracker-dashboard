import { Readable } from "node:stream";
import ExcelJS from "exceljs";
import { fromRow, pickDataSheet } from "@/lib/normalize";
import { bulkUpsertItems } from "@/controllers/items.controller";
import { getStore } from "@/db/store";
import { canSeeTeam, errorResponse, requireAdmin } from "@/lib/session";
import { getTeam } from "@/lib/teams";
import type { Item } from "@/lib/types";
import { UPLOAD } from "@/lib/constants";
import { detectSheet, whyNotReadable } from "@/lib/spreadsheet";
import { readNumbers } from "@/lib/numbers";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const MAX_BYTES = UPLOAD.maxBytes;
import { fromWorkbook, isEmptyRow, isLinked, type Sheet } from "./sheets";

export async function POST(req: Request) {
  try {
    /*
     * Admins only.
     *
     * An upload is not a read of somebody's own POD — it writes items into it,
     * and a spreadsheet row overwrites whatever shares its id. That makes it a
     * bulk edit of the board every member of that POD is measured by, from a
     * file nobody else has seen. The POD check below still runs on top: being
     * an admin says *may upload*, not *may upload anywhere*.
     */
    const user = await requireAdmin();
    /*
     * The content type first. `req.formData()` throws a TypeError on anything
     * that is not a form, so a JSON body — which is what a mistaken caller or a
     * probe sends — came back as a 500 quoting an internal message instead of a
     * sentence saying what was wrong.
     */
    const contentType = req.headers.get("content-type") ?? "";
    if (!/multipart\/form-data|application\/x-www-form-urlencoded/i.test(contentType)) {
      return Response.json(
        { error: "Upload the file as form data, not JSON. Use the Upload button on the dashboard." },
        { status: 400 },
      );
    }
    const form = await req.formData();
    const file = form.get("file");
    const teamId = String(form.get("teamId") || "");

    if (!(file instanceof File)) return Response.json({ error: "Choose a file to upload." }, { status: 400 });
    if (file.size > MAX_BYTES) return Response.json({ error: `File is larger than ${UPLOAD.maxLabel}.` }, { status: 400 });
    if (!teamId) return Response.json({ error: "Pick the POD this file belongs to." }, { status: 400 });
    if (!canSeeTeam(user, teamId)) return Response.json({ error: "No access to that POD." }, { status: 403 });

    const team = await getTeam(teamId);
    if (!team) return Response.json({ error: "POD not found." }, { status: 404 });

    await getStore().init();

    const bytes = await file.arrayBuffer();

    /*
     * Which reader to use is decided by the **bytes**, not the filename.
     *
     * The old rule — ends with `.csv` or else it is Excel — assumed the reader
     * has Excel and names files the way Excel does. Numbers, Google Sheets,
     * LibreOffice and a plain text editor all produce good data under names it
     * got wrong, and the failure was a flat "could not read it".
     */
    const kind = detectSheet(new Uint8Array(bytes), file.name);
    if (kind !== "csv" && kind !== "xlsx" && kind !== "numbers") {
      // Named formats get the exact way out, because "could not read it" is
      // useless when the fix is two menu items away.
      return Response.json({ error: whyNotReadable(kind, file.name) }, { status: 400 });
    }

    let sheets: Sheet[];
    try {
      if (kind === "numbers") {
        // Numbers is the default spreadsheet on every Mac, and the one app most
        // likely to be the only one installed. Reading its own format directly
        // saves an export step on the platform that needs it most; a file this
        // cannot decode comes back empty and falls through to the advice below.
        sheets = readNumbers(new Uint8Array(bytes));
      } else {
        const workbook = new ExcelJS.Workbook();
        if (kind === "csv") await workbook.csv.read(Readable.from([Buffer.from(bytes)]));
        // exceljs's types predate the Buffer<ArrayBuffer> generic; it reads an ArrayBuffer fine.
        else await workbook.xlsx.load(bytes as never);
        sheets = fromWorkbook(workbook);
      }
    } catch {
      // A corrupt file is the reader's problem to fix, not a server fault — say
      // so instead of leaking a zip parser's internals as a 500.
      return Response.json({ error: whyNotReadable("unknown", file.name) }, { status: 400 });
    }

    // Numbers pads a table out to its full height, so most rows are empty
    // padding rather than data somebody meant to import. Dropping them keeps
    // the skipped count meaningful — it means "had content but no title".
    sheets = sheets.map((sheet) => ({ name: sheet.name, rows: sheet.rows.filter((row) => !isEmptyRow(row)) }));

    if (sheets.length === 0 || sheets.every((sheet) => sheet.rows.length === 0)) {
      /*
       * The container opened but held nothing we could read. For a `.numbers`
       * that means a layout this parser does not recognise; for an `.xlsx`, a
       * package structured in a way exceljs cannot open. Either way the way out
       * is the format nothing can get wrong.
       */
      return Response.json(
        {
          error:
            kind === "numbers"
              ? `"${file.name}" could not be read as a Numbers file. In Numbers choose File → Export To → CSV, then upload that.`
              : `"${file.name}" opened but contained no readable sheets. ` +
                "Some apps write .xlsx files this reader cannot open. " +
                "Export it as CSV instead and upload that.",
        },
        { status: 400 },
      );
    }

    /*
     * Read the header row of **every** tab, not just the first.
     *
     * Taking `worksheets[0]` failed on workbooks whose data sits one tab over —
     * a "Notes" sheet in front of it, a chart sheet, or a cover page from
     * whatever exported it. The data sheet is the one with a Title column.
     */
    const headers = sheets.map((sheet) => ({
      name: sheet.name,
      headers: (sheet.rows[0] ?? []).map((cell) => (isLinked(cell) ? cell.text : String(cell ?? ""))),
    }));

    const picked = pickDataSheet(headers);
    if (!picked) {
      // Name every tab and what was on its first row, so the reader can see
      // whether the headers are wrong or the header row is not row 1.
      const seen = headers
        .map((sheet) => `${sheet.name}: ${sheet.headers.filter(Boolean).join(", ") || "(empty)"}`)
        .join(" · ");
      return Response.json(
        {
          error:
            `No "Title" column found in ${headers.length === 1 ? "that sheet" : `any of the ${headers.length} sheets`}. ` +
            `Row 1 must be the header row. Read — ${seen}`,
        },
        { status: 400 },
      );
    }

    const columns = picked.columns;
    const items: Item[] = [];
    let skipped = 0;

    // Row 1 is the header; everything after it is data.
    for (const [offset, row] of sheets[picked.index].rows.slice(1).entries()) {
      const record: Record<string, unknown> = {};
      row.forEach((cell, column) => {
        const field = columns[column];
        if (!field) return;
        // The URL column wants the link behind the cell; everything else wants
        // the text, which for a linked cell is the label rather than the href.
        record[field] = isLinked(cell) ? (field === "url" ? cell.hyperlink : cell.text) : cell;
      });
      const item = fromRow(record, team, offset + 2);
      if (item) items.push(item);
      else skipped++;
    }

    // Rows sharing an id collapse to one document, so counting rows would
    // overstate what was actually imported. Last row wins, matching a re-upload.
    const byId = new Map(items.map((item) => [item.id, item]));
    const unique = [...byId.values()];
    const duplicates = items.length - unique.length;

    const failed = await bulkUpsertItems(unique);

    return Response.json({
      imported: unique.length - failed,
      skipped,
      duplicates,
      failed,
      sheet: picked.name,
      columns: Object.values(columns),
      // From the sheet actually used, not from whichever tab came first.
      ignoredHeaders: headers[picked.index].headers.filter((header, i) => header && !columns[i]),
    });
  } catch (err) {
    return errorResponse(err);
  }
}
