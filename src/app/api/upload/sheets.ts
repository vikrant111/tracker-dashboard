import ExcelJS from "exceljs";

/**
 * One shape for every reader.
 *
 * Excel, CSV and Numbers arrive through different parsers; normalising them
 * here is what lets the route have a single row-reading path rather than three
 * that drift apart.
 */
/**
 * A cell that carries a link out of band from its text — only Excel does this,
 * and only the URL column wants the link rather than the label.
 */
export type Linked = { text: string; hyperlink: string };
export type Cell = string | number | boolean | Date | null | Linked;

/** Every reader normalises to this, so there is one row-reading path, not three. */
export type Sheet = { name: string; rows: Cell[][] };

export const isLinked = (value: Cell): value is Linked =>
  typeof value === "object" && value !== null && !(value instanceof Date) && "hyperlink" in value;

export const isEmptyRow = (row: Cell[]) => row.every((cell) => cell === null || cell === undefined || cell === "");

export function fromWorkbook(workbook: ExcelJS.Workbook): Sheet[] {
  return workbook.worksheets.map((worksheet) => {
    const rows: Cell[][] = [];
    worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      const cells: Cell[] = [];
      row.eachCell({ includeEmpty: true }, (cell, column) => {
        const hyperlink = (cell.value as { hyperlink?: string } | null)?.hyperlink;
        // Keep both halves: the URL column wants the link, every other column
        // wants the text somebody actually typed.
        if (hyperlink) cells[column - 1] = { text: cell.text, hyperlink };
        // Keep the Date object when Excel typed the cell as one; normalize parses the rest.
        else cells[column - 1] = cell.value instanceof Date ? cell.value : cell.text;
      });
      rows.push(cells);
    });
    return { name: worksheet.name, rows };
  });
}
