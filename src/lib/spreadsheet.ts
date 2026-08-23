/**
 * Working out what a spreadsheet actually *is*, from its bytes.
 *
 * The uploader used to branch on the filename: `.csv` went to the CSV reader,
 * everything else to the Excel reader. That assumes the reader has Excel and
 * names files the way Excel does. Plenty of people do not — Numbers, Google
 * Sheets, LibreOffice and a plain text editor all produce perfectly good data
 * under names that rule got wrong, and the failure was a flat "could not read
 * it" with no clue what to do next.
 *
 * Pure and client-safe, so `scripts/check-ui.mjs` exercises the real sniffing.
 */

/** What we can actually parse, plus the shapes worth naming when we cannot. */
export type SheetKind = "xlsx" | "csv" | "numbers" | "ods" | "legacy-xls" | "unknown";

const startsWith = (bytes: Uint8Array, signature: number[]) =>
  bytes.length >= signature.length && signature.every((byte, i) => bytes[i] === byte);

/**
 * Every OOXML file — `.xlsx`, `.xlsm` — is a zip, and so are `.numbers` and
 * `.ods`. The container is the same; what distinguishes them is what is inside.
 */
export function isZip(bytes: Uint8Array): boolean {
  // "PK" then a local-file, empty-archive or spanned-archive marker.
  return bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && [3, 5, 7].includes(bytes[2]);
}

/** The old binary format, which exceljs cannot read at all. */
export function isLegacyXls(bytes: Uint8Array): boolean {
  // OLE2 compound document header.
  return startsWith(bytes, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
}

/** Bytes that text does not contain, and a misread binary file does. */
const CONTROL_BYTES = /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/;

/**
 * What kind of spreadsheet these bytes hold.
 *
 * Content first, the filename only as a tie-breaker between zip formats. Entry
 * names inside a zip appear as plain ASCII in its local file headers, so a scan
 * of the first few kilobytes identifies the package without unzipping it — and
 * both `.numbers` and `.ods` announce themselves clearly enough to name in an
 * error message.
 */
export function detectSheet(bytes: Uint8Array, filename = ""): SheetKind {
  if (!bytes.length) return "unknown";
  if (isLegacyXls(bytes)) return "legacy-xls";

  if (isZip(bytes)) {
    /*
     * Read both ends of the archive.
     *
     * The head alone is not enough. A zip's local file headers appear in
     * storage order, and a Numbers bundle leads with several hundred kilobytes
     * of preview artwork — so `Index/` can sit far past any sane read limit and
     * the file reads as "unknown". The **central directory** at the tail lists
     * every entry name in one place, which is exactly the question being asked.
     */
    const latin1 = new TextDecoder("latin1");
    const head = latin1.decode(bytes.subarray(0, Math.min(bytes.length, 4096)));
    const tail = latin1.decode(bytes.subarray(Math.max(0, bytes.length - 65_536)));
    const names = head + tail;

    if (names.includes("Index/") || names.includes(".numbers")) return "numbers";
    if (names.includes("opendocument.spreadsheet")) return "ods";
    if (names.includes("xl/") || names.includes("[Content_Types].xml")) return "xlsx";

    // A zip we cannot place from its entry names. Trust the name only here,
    // where the alternative is refusing a file that may well be fine.
    const lower = filename.toLowerCase();
    if (lower.endsWith(".numbers")) return "numbers";
    return lower.endsWith(".xlsx") || lower.endsWith(".xlsm") ? "xlsx" : "unknown";
  }

  // Not a zip and not OLE2. If the first line decodes as text, it is a delimited
  // file whatever it is called — `.txt`, `.tsv`, or no extension at all.
  const text = new TextDecoder("utf-8", { fatal: false }).decode(bytes.subarray(0, Math.min(bytes.length, 8192)));
  const firstLine = text.split(/\r?\n/)[0] ?? "";
  if (!firstLine.trim()) return "unknown";
  if (CONTROL_BYTES.test(firstLine)) return "unknown";

  // A delimiter settles it; a single-column sheet has none and is still a CSV.
  return "csv";
}

/**
 * What to tell somebody whose file we cannot read.
 *
 * Named formats get the exact way out, because "could not read it" is useless
 * when the fix is two menu items away.
 */
export function whyNotReadable(kind: SheetKind, filename: string): string {
  const name = filename || "that file";
  switch (kind) {
    case "numbers":
      return `"${name}" is a Numbers file. In Numbers choose File → Export To → CSV, then upload that.`;
    case "ods":
      return `"${name}" is an OpenDocument sheet. In LibreOffice choose File → Save a Copy → CSV, then upload that.`;
    case "legacy-xls":
      return `"${name}" is the old .xls format. Open it and re-save as .xlsx or .csv, then upload that.`;
    default:
      return `Could not read "${name}". Export it as CSV — every spreadsheet app can do that — or as .xlsx.`;
  }
}
