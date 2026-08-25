import { walk } from "./protobuf.ts";
import type { NumbersValue } from "./types.ts";

/** Numbers counts seconds from 2001-01-01, not from the Unix epoch. */
const NUMBERS_EPOCH = Date.UTC(2001, 0, 1);

/**
 * One cell of the current storage layout (version 5).
 *
 * The header is a version, a type, and a flag word; the flags say which of the
 * optional values follow, in bit order. Only the four that carry data are read
 * — the rest are style and format ids, skipped by width.
 *
 * Older versions are deliberately **not** guessed at. Their layout differs in
 * ways that would still decode into plausible-looking values, and a wrong value
 * imported silently is worse than a file politely refused.
 */
export function readCell(cell: Uint8Array, strings: Map<number, string>): NumbersValue {
  if (cell.length < 12 || cell[0] !== 5) return null;
  const view = new DataView(cell.buffer, cell.byteOffset, cell.byteLength);
  const type = cell[1];
  const flags = view.getUint32(8, true);

  let at = 12;
  let double: number | null = null;
  let seconds: number | null = null;
  let text: number | null = null;

  if (flags & 0x1) at += 16; // 128-bit decimal, which we do not need
  if (flags & 0x2) {
    if (at + 8 > cell.length) return null;
    double = view.getFloat64(at, true);
    at += 8;
  }
  if (flags & 0x4) {
    if (at + 8 > cell.length) return null;
    seconds = view.getFloat64(at, true);
    at += 8;
  }
  if (flags & 0x8) {
    if (at + 4 > cell.length) return null;
    text = view.getUint32(at, true);
  }

  if (type === 3 && text !== null) return strings.get(text) ?? null;
  if (type === 5 && seconds !== null && Number.isFinite(seconds)) return new Date(NUMBERS_EPOCH + seconds * 1000);
  if (type === 6 && double !== null) return double !== 0;
  if (type === 2 && double !== null) return double;
  // Fall back on whatever the cell actually carries — a formula cell stores its
  // computed result the same way, under a type we have no name for.
  if (text !== null) return strings.get(text) ?? null;
  if (double !== null) return double;
  return null;
}

/** Every string in a data list, by its key. Empty for lists of anything else. */
export function readStrings(payload: Uint8Array): Map<number, string> {
  const out = new Map<number, string>();
  for (const entry of walk(payload)) {
    if (entry.field !== 3 || !entry.bytes) continue;
    let key: number | null = null;
    let value: string | null = null;
    for (const field of walk(entry.bytes)) {
      if (field.field === 1 && field.wire === 0) key = field.varint;
      if (field.field === 3 && field.bytes) value = new TextDecoder().decode(field.bytes);
    }
    if (key !== null && value !== null) out.set(key, value);
  }
  return out;
}

/** The rows of one tile, in order, as sparse arrays of cells. */
export function readTile(payload: Uint8Array, strings: Map<number, string>, width: number): NumbersValue[][] {
  const rows: { at: number; cells: NumbersValue[] }[] = [];

  for (const row of walk(payload)) {
    if (row.field !== 5 || !row.bytes) continue;
    let index = 0;
    let storage: Uint8Array | null = null;
    let offsets: Uint8Array | null = null;
    for (const field of walk(row.bytes)) {
      if (field.field === 1 && field.wire === 0) index = field.varint;
      if (field.field === 6 && field.bytes) storage = field.bytes;
      if (field.field === 7 && field.bytes) offsets = field.bytes;
    }
    if (!storage || !offsets) continue;

    // `cell_offsets` is an int16 per column into the row's storage buffer;
    // -1 means the column is empty in this row.
    const view = new DataView(offsets.buffer, offsets.byteOffset, offsets.byteLength);
    const cells: NumbersValue[] = [];
    const columns = Math.min(width, Math.floor(offsets.length / 2));
    for (let column = 0; column < columns; column++) {
      const start = view.getInt16(column * 2, true);
      cells[column] = start < 0 || start >= storage.length ? null : readCell(storage.subarray(start), strings);
    }
    rows.push({ at: index, cells });
  }

  rows.sort((a, b) => a.at - b.at);
  return rows.map((row) => row.cells);
}
