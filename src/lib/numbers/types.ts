/** A cell, once decoded. `null` is genuinely empty. */
export type NumbersValue = string | number | boolean | Date | null;

/** One table, in the shape the spreadsheet importer already understands. */
export type NumbersSheet = { name: string; rows: NumbersValue[][] };

/** Archive types we can identify by, from Apple's own registry. */
export const TILE = 6002;
export const TABLE_MODEL = 6001;
export const DATA_LIST = 6005;
