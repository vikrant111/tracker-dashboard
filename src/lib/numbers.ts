/**
 * Reading Apple Numbers files.
 *
 * `.numbers` is a zip, like `.xlsx`, but nothing else about it is the same.
 * Inside are IWA files — Apple's own container — and each one is a stream of
 * Snappy-compressed Protobuf messages against schemas Apple does not publish.
 * exceljs cannot open one, and neither can anything else on npm.
 *
 * The reason to do it anyway: on a Mac with no Excel installed, Numbers *is*
 * the spreadsheet app. Telling somebody to export CSV every time they want to
 * upload a file they already have is a tax on the one platform most likely to
 * be running this.
 *
 * ## How it is kept honest
 *
 * Apple renumbers these fields between releases, so nothing here trusts a field
 * number it can check instead. References are resolved by **what they point
 * at** — an id is the tile list because it resolves to tile archives, and the
 * string table because it resolves to a list that actually holds strings. A
 * layout this does not recognise yields no rows rather than wrong ones, and the
 * caller falls back to telling the reader to export CSV.
 *
 * That is the whole safety argument: this can only ever do better than
 * refusing the file, never worse. A misread would be far more expensive than a
 * refusal, so every step that could misread is written to give up instead.
 */
import { inflateRawSync } from "node:zlib";

/** Numbers counts seconds from 2001-01-01, not from the Unix epoch. */
const NUMBERS_EPOCH = Date.UTC(2001, 0, 1);

/** Archive types we can identify by, from Apple's own registry. */
const TILE = 6002;
const TABLE_MODEL = 6001;
const DATA_LIST = 6005;

/** A cell, once decoded. `null` is genuinely empty. */
export type NumbersValue = string | number | boolean | Date | null;

/** One table, in the shape the spreadsheet importer already understands. */
export type NumbersSheet = { name: string; rows: NumbersValue[][] };

/* ------------------------------------------------------------------ zip -- */

/**
 * The `.iwa` entries of a zip, by name.
 *
 * Written by hand against `node:zlib` rather than pulling in a zip library:
 * only the central directory and one compression method are needed, and the
 * `Data/` folder — full of preview images that can be most of the file — is
 * skipped without ever being decompressed.
 */
function readZip(bytes: Uint8Array): Map<string, Uint8Array> {
  const out = new Map<string, Uint8Array>();
  if (bytes.length < 22) return out;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  // The end-of-central-directory record is last, after a comment of unknown
  // length — so it is found by scanning backwards for its signature.
  let end = -1;
  const floor = Math.max(0, bytes.length - 66_000);
  for (let i = bytes.length - 22; i >= floor; i--) {
    if (view.getUint32(i, true) === 0x0605_4b50) {
      end = i;
      break;
    }
  }
  if (end < 0) return out;

  const count = view.getUint16(end + 10, true);
  let at = view.getUint32(end + 16, true);

  for (let i = 0; i < count; i++) {
    if (at + 46 > bytes.length || view.getUint32(at, true) !== 0x0201_4b50) break;
    const method = view.getUint16(at + 10, true);
    const size = view.getUint32(at + 20, true);
    const nameLength = view.getUint16(at + 28, true);
    const extraLength = view.getUint16(at + 30, true);
    const commentLength = view.getUint16(at + 32, true);
    const localAt = view.getUint32(at + 42, true);
    const name = new TextDecoder().decode(bytes.subarray(at + 46, at + 46 + nameLength));
    at += 46 + nameLength + extraLength + commentLength;

    // Only the IWA files carry data. Everything else is artwork.
    if (!name.endsWith(".iwa")) continue;
    if (localAt + 30 > bytes.length || view.getUint32(localAt, true) !== 0x0403_4b50) continue;

    // The local header repeats the name and extra lengths, and may disagree
    // with the central directory's — the local one governs where data starts.
    const dataAt = localAt + 30 + view.getUint16(localAt + 26, true) + view.getUint16(localAt + 28, true);
    if (dataAt + size > bytes.length) continue;
    const raw = bytes.subarray(dataAt, dataAt + size);

    try {
      if (method === 0) out.set(name, raw);
      else if (method === 8) out.set(name, new Uint8Array(inflateRawSync(raw)));
    } catch {
      // One unreadable entry is not a reason to abandon the other fifty.
    }
  }
  return out;
}

/* -------------------------------------------------------------- snappy -- */

/**
 * Snappy's raw block format — a varint length, then literals and back-references.
 *
 * IWA uses the bare block, not the framed stream, so there is no checksum to
 * verify and no library that reads it out of the box.
 */
function snappy(input: Uint8Array): Uint8Array {
  let at = 0;
  let length = 0;
  let shift = 0;
  let byte = 0;
  do {
    if (at >= input.length) return new Uint8Array(0);
    byte = input[at++];
    length |= (byte & 0x7f) << shift;
    shift += 7;
  } while (byte & 0x80);

  if (length <= 0 || length > 1 << 30) return new Uint8Array(0);
  const out = new Uint8Array(length);
  let put = 0;

  while (at < input.length && put < length) {
    const tag = input[at++];
    if ((tag & 3) === 0) {
      // Literal: a length, then that many bytes copied straight across.
      let run = tag >> 2;
      if (run >= 60) {
        const width = run - 59;
        run = 0;
        for (let i = 0; i < width; i++) run |= input[at + i] << (8 * i);
        at += width;
      }
      run += 1;
      if (at + run > input.length || put + run > length) break;
      out.set(input.subarray(at, at + run), put);
      at += run;
      put += run;
    } else {
      // Copy: repeat bytes already written, at some offset behind the cursor.
      let run: number;
      let back: number;
      if ((tag & 3) === 1) {
        run = 4 + ((tag >> 2) & 7);
        back = ((tag >> 5) << 8) | input[at++];
      } else if ((tag & 3) === 2) {
        run = (tag >> 2) + 1;
        back = input[at] | (input[at + 1] << 8);
        at += 2;
      } else {
        run = (tag >> 2) + 1;
        back = input[at] | (input[at + 1] << 8) | (input[at + 2] << 16) | (input[at + 3] << 24);
        at += 4;
      }
      if (back <= 0 || back > put || put + run > length) break;
      // Byte at a time on purpose: the run may overlap itself, which is how
      // Snappy encodes a repeated pattern.
      for (let i = 0; i < run; i++, put++) out[put] = out[put - back];
    }
  }
  return out.subarray(0, put);
}

/** An IWA file is chunks of `0x00`, a 3-byte length, then a Snappy block. */
function unwrapIWA(bytes: Uint8Array): Uint8Array {
  const parts: Uint8Array[] = [];
  let total = 0;
  let at = 0;
  while (at + 4 <= bytes.length) {
    const size = bytes[at + 1] | (bytes[at + 2] << 8) | (bytes[at + 3] << 16);
    if (size <= 0 || at + 4 + size > bytes.length) break;
    const part = snappy(bytes.subarray(at + 4, at + 4 + size));
    parts.push(part);
    total += part.length;
    at += 4 + size;
  }
  const out = new Uint8Array(total);
  let put = 0;
  for (const part of parts) {
    out.set(part, put);
    put += part.length;
  }
  return out;
}

/* ------------------------------------------------------------ protobuf -- */

type Field = { field: number; wire: number; varint: number; bytes: Uint8Array | null };

/**
 * Walk one level of a Protobuf message.
 *
 * Enough of the wire format to read fields without knowing the schema, which is
 * the only option when the schema is Apple's and unpublished. Anything
 * malformed ends the walk rather than throwing.
 */
function* walk(buf: Uint8Array): Generator<Field> {
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let at = 0;
  while (at < buf.length) {
    let key = 0;
    let shift = 0;
    let byte = 0;
    do {
      if (at >= buf.length || shift > 28) return;
      byte = buf[at++];
      key |= (byte & 0x7f) << shift;
      shift += 7;
    } while (byte & 0x80);

    const field = key >>> 3;
    const wire = key & 7;
    if (field === 0) return;

    if (wire === 0) {
      let value = 0;
      shift = 0;
      do {
        if (at >= buf.length || shift > 63) return;
        byte = buf[at++];
        // Beyond 2^53 the value is an id we would not use anyway; keep it finite.
        if (shift < 32) value |= (byte & 0x7f) << shift;
        shift += 7;
      } while (byte & 0x80);
      yield { field, wire, varint: value >>> 0, bytes: null };
    } else if (wire === 2) {
      let size = 0;
      shift = 0;
      do {
        if (at >= buf.length || shift > 28) return;
        byte = buf[at++];
        size |= (byte & 0x7f) << shift;
        shift += 7;
      } while (byte & 0x80);
      if (size < 0 || at + size > buf.length) return;
      yield { field, wire, varint: 0, bytes: buf.subarray(at, at + size) };
      at += size;
    } else if (wire === 5) {
      if (at + 4 > buf.length) return;
      yield { field, wire, varint: view.getUint32(at, true), bytes: null };
      at += 4;
    } else if (wire === 1) {
      if (at + 8 > buf.length) return;
      yield { field, wire, varint: 0, bytes: buf.subarray(at, at + 8) };
      at += 8;
    } else {
      return;
    }
  }
}

/* ------------------------------------------------------------- archives -- */

type Archive = { id: number; type: number; payload: Uint8Array };

/**
 * An IWA stream is a run of `varint(length) ArchiveInfo payload…`, where the
 * info names the object's id and the byte length of each payload following it.
 */
function readArchives(buf: Uint8Array): Archive[] {
  const out: Archive[] = [];
  let at = 0;
  while (at < buf.length) {
    let size = 0;
    let shift = 0;
    let byte = 0;
    do {
      if (at >= buf.length || shift > 28) return out;
      byte = buf[at++];
      size |= (byte & 0x7f) << shift;
      shift += 7;
    } while (byte & 0x80);
    if (size <= 0 || at + size > buf.length) return out;

    const info = buf.subarray(at, at + size);
    at += size;

    let id = 0;
    const messages: { type: number; length: number }[] = [];
    for (const field of walk(info)) {
      if (field.field === 1 && field.wire === 0) id = field.varint;
      if (field.field === 2 && field.bytes) {
        let type = 0;
        let length = 0;
        for (const inner of walk(field.bytes)) {
          if (inner.field === 1 && inner.wire === 0) type = inner.varint;
          if (inner.field === 3 && inner.wire === 0) length = inner.varint;
        }
        messages.push({ type, length });
      }
    }

    for (const message of messages) {
      if (at + message.length > buf.length) return out;
      out.push({ id, type: message.type, payload: buf.subarray(at, at + message.length) });
      at += message.length;
    }
  }
  return out;
}

/* ----------------------------------------------------------------- cells -- */

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
function readCell(cell: Uint8Array, strings: Map<number, string>): NumbersValue {
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
function readStrings(payload: Uint8Array): Map<number, string> {
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
function readTile(payload: Uint8Array, strings: Map<number, string>, width: number): NumbersValue[][] {
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

/* ----------------------------------------------------------------- doc -- */

/** Every `{ field 1: varint, field 2: { field 1: varint } }` pair in a message. */
function referencePairs(buf: Uint8Array, found: { at: number; id: number }[], depth = 0): void {
  if (depth > 6) return;
  for (const field of walk(buf)) {
    if (!field.bytes) continue;
    let at: number | null = null;
    let id: number | null = null;
    for (const inner of walk(field.bytes)) {
      if (inner.field === 1 && inner.wire === 0) at = inner.varint;
      if (inner.field === 2 && inner.bytes) {
        for (const ref of walk(inner.bytes)) if (ref.field === 1 && ref.wire === 0) id = ref.varint;
      }
    }
    if (at !== null && id !== null) found.push({ at, id });
    referencePairs(field.bytes, found, depth + 1);
  }
}

/** Every id referenced anywhere inside a message, as `{ field 1: varint }`. */
function referencedIds(buf: Uint8Array, found: Set<number>, depth = 0): void {
  if (depth > 6) return;
  for (const field of walk(buf)) {
    if (!field.bytes) continue;
    const fields = [...walk(field.bytes)];
    if (fields.length === 1 && fields[0].field === 1 && fields[0].wire === 0) found.add(fields[0].varint);
    referencedIds(field.bytes, found, depth + 1);
  }
}

const PRINTABLE = /^[^\u0000-\u001f]+$/;

/** The table's own name, if one of its string fields reads like one. */
function tableName(payload: Uint8Array, fallback: string): string {
  for (const field of walk(payload)) {
    if (field.field !== 8 || !field.bytes || !field.bytes.length) continue;
    const text = new TextDecoder().decode(field.bytes);
    if (PRINTABLE.test(text) && text.length <= 120) return text;
  }
  return fallback;
}

/**
 * Read every table in a Numbers file.
 *
 * Returns an empty array for anything it cannot read with confidence — a
 * password-protected file, a layout from a future release, a bundle missing its
 * index. The caller treats that as "export CSV instead", which is where this
 * started, so the worst case is the behaviour we already had.
 */
export function readNumbers(bytes: Uint8Array): NumbersSheet[] {
  let archives: Archive[];
  try {
    archives = [...readZip(bytes).values()].flatMap((file) => readArchives(unwrapIWA(file)));
  } catch {
    return [];
  }
  if (!archives.length) return [];

  // Objects reference each other by id across files, so resolve globally.
  const byId = new Map<number, Archive>();
  for (const archive of archives) if (!byId.has(archive.id)) byId.set(archive.id, archive);

  const sheets: NumbersSheet[] = [];
  const models = archives.filter((archive) => archive.type === TABLE_MODEL);

  for (const [index, model] of models.entries()) {
    let width = 0;
    for (const field of walk(model.payload)) {
      // Column count, sanity-bounded — a tile carries at most 256 columns.
      if (field.field === 7 && field.wire === 0 && field.varint > 0 && field.varint <= 256) width = field.varint;
    }

    // Which id is the tile list and which the string table is decided by what
    // they resolve to, never by the field number carrying them.
    const pairs: { at: number; id: number }[] = [];
    referencePairs(model.payload, pairs);
    const tiles = pairs
      .filter((pair) => byId.get(pair.id)?.type === TILE)
      .sort((a, b) => a.at - b.at);

    const ids = new Set<number>();
    referencedIds(model.payload, ids);
    let strings = new Map<number, string>();
    for (const id of ids) {
      const archive = byId.get(id);
      if (archive?.type !== DATA_LIST) continue;
      const candidate = readStrings(archive.payload);
      // The list that actually holds strings; the others hold styles and formats.
      if (candidate.size > strings.size) strings = candidate;
    }

    if (!tiles.length) continue;
    if (!width) width = 256;

    const rows: NumbersValue[][] = [];
    for (const tile of tiles) {
      const archive = byId.get(tile.id);
      if (archive) rows.push(...readTile(archive.payload, strings, width));
    }
    if (rows.length) sheets.push({ name: tableName(model.payload, `Table ${index + 1}`), rows });
  }

  return sheets;
}
