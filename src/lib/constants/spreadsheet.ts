/** Reading a spreadsheet in, and writing one back out. */
// --------------------------------------------------------------------- export

export const EXPORT = {
  /**
   * Ceiling on one download.
   *
   * Well above any real POD, and bounded on purpose: the whole sheet is built
   * in memory before a byte is sent, so an unbounded export is an unbounded
   * allocation triggered by a query string.
   */
  maxRows: 20_000,
  /**
   * Rows per underlying query.
   *
   * Comfortably under OpenSearch's default `index.max_result_window` of 10,000
   * — the export pages with `search_after`, so the window never applies, but a
   * page that approached it would be one config change from failing again.
   */
  pageSize: 1_000,
  sheetName: "Work items",
  /** Written into the cells so Excel treats them as dates, not text. */
  dateFormat: "yyyy-mm-dd",
  headerFill: "FFEEF4FB",
} as const;

// --------------------------------------------------------------------- upload

export const UPLOAD = {
  /** Largest spreadsheet accepted, in bytes. */
  maxBytes: 20 * 1024 * 1024,
  /** Same figure in the copy shown to the reader, so the two cannot drift. */
  maxLabel: "20 MB",
  /**
   * What the file picker offers.
   *
   * MIME types **and** extensions. An extension-only filter greys out files the
   * operating system happens to type differently — which is how somebody with
   * no Excel installed finds their own CSV unselectable.
   *
   * `.xls` is deliberately absent: exceljs reads the OOXML container and CSV,
   * not the old binary format. The server still sniffs the bytes, so this list
   * only decides what is easy to pick, never what is accepted.
   *
   * `.numbers` is here because on a Mac it is often the only spreadsheet format
   * the reader has — `lib/numbers.ts` reads it directly.
   */
  accept: [
    ".csv",
    ".xlsx",
    ".xlsm",
    ".numbers",
    ".txt",
    ".tsv",
    "text/csv",
    "text/plain",
    "text/tab-separated-values",
    "application/csv",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/x-iwork-numbers-sffnumbers",
  ].join(","),
} as const;
