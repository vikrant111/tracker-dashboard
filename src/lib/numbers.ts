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
import { readZip } from "./numbers/zip.ts";
import { unwrapIWA } from "./numbers/snappy.ts";
import { walk, readArchives, type Archive } from "./numbers/protobuf.ts";
import { readStrings, readTile } from "./numbers/cells.ts";
import { DATA_LIST, TABLE_MODEL, TILE, type NumbersSheet, type NumbersValue } from "./numbers/types.ts";

export type { NumbersSheet, NumbersValue };

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
