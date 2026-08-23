/**
 * Building a `.numbers` file from scratch, for the checks.
 *
 * `src/lib/numbers.ts` reads Apple's format; this writes it. The two are
 * deliberately **independent** — this encoder is written from the zip, Snappy
 * and Protobuf wire formats, not from the parser's code — because a fixture
 * derived from the thing it tests only ever proves the parser agrees with
 * itself. That trap has been sprung on this codebase before.
 *
 * Test-only. Nothing here ships.
 */

/* ------------------------------------------------------------- protobuf -- */

export function varint(value) {
  const out = [];
  let n = value;
  while (n > 0x7f) {
    out.push((n & 0x7f) | 0x80);
    n = Math.floor(n / 128);
  }
  out.push(n & 0x7f);
  return Buffer.from(out);
}

/** A length-delimited field: tag, length, bytes. */
export const bytesField = (field, payload) =>
  Buffer.concat([varint((field << 3) | 2), varint(payload.length), Buffer.from(payload)]);

/** A varint field: tag, value. */
export const intField = (field, value) => Buffer.concat([varint((field << 3) | 0), varint(value)]);

/** A `TSP.Reference` — a message whose only field is an object id. */
export const reference = (field, id) => bytesField(field, intField(1, id));

/* --------------------------------------------------------------- snappy -- */

/**
 * A Snappy block of nothing but literals.
 *
 * Valid Snappy that no decompressor can refuse, and it never exercises the
 * back-reference path — which is the point: the fixture stays a statement about
 * the container, not about compression.
 */
export function snappyLiterals(payload) {
  const body = Buffer.from(payload);
  const parts = [varint(body.length)];
  let at = 0;
  while (at < body.length) {
    // One literal run at a time, capped so the length always fits two bytes.
    const run = Math.min(body.length - at, 60_000);
    if (run < 61) {
      parts.push(Buffer.from([(run - 1) << 2]));
    } else {
      // Tag 60 + n means the length occupies the next n+1 bytes, little-endian.
      const size = run - 1;
      parts.push(Buffer.from([(61 << 2) | 0, size & 0xff, (size >> 8) & 0xff]));
    }
    parts.push(body.subarray(at, at + run));
    at += run;
  }
  return Buffer.concat(parts);
}

/** An IWA file: chunks of `0x00`, a 3-byte length, then a Snappy block. */
export function iwa(payload) {
  const block = snappyLiterals(payload);
  const header = Buffer.from([0x00, block.length & 0xff, (block.length >> 8) & 0xff, (block.length >> 16) & 0xff]);
  return Buffer.concat([header, block]);
}

/** One archive: its info (id and payload length), then the payload. */
export function archive(id, type, payload) {
  const info = Buffer.concat([intField(1, id), bytesField(2, Buffer.concat([intField(1, type), intField(3, payload.length)]))]);
  return Buffer.concat([varint(info.length), info, Buffer.from(payload)]);
}

/* ---------------------------------------------------------------- cells -- */

const cell = (type, flags, payload) => {
  const head = Buffer.alloc(12);
  head[0] = 5; // storage version
  head[1] = type;
  head.writeUInt32LE(flags, 8);
  return Buffer.concat([head, payload]);
};

export const stringCell = (id) => {
  const body = Buffer.alloc(4);
  body.writeUInt32LE(id, 0);
  return cell(3, 0x8, body);
};

export const numberCell = (value) => {
  const body = Buffer.alloc(8);
  body.writeDoubleLE(value, 0);
  return cell(2, 0x2, body);
};

/** Numbers counts seconds from 2001-01-01. */
export const dateCell = (date) => {
  const body = Buffer.alloc(8);
  body.writeDoubleLE((date.getTime() - Date.UTC(2001, 0, 1)) / 1000, 0);
  return cell(5, 0x4, body);
};

/** Put this in a row to get a cell in a storage layout the parser must refuse. */
export const LEGACY = Symbol("legacy cell");

/** A cell in a storage layout this project deliberately does not decode. */
export const legacyCell = (id) => {
  const body = Buffer.alloc(4);
  body.writeUInt32LE(id, 0);
  const out = Buffer.concat([Buffer.alloc(12), body]);
  out[0] = 4; // an older version, which must yield nothing rather than a guess
  out[1] = 3;
  out.writeUInt32LE(0x8, 8);
  return out;
};

/** One row: its index, and its cells laid out with an offset table. */
export function rowInfo(index, cells, width = 256) {
  const offsets = Buffer.alloc(width * 2);
  offsets.fill(0xff); // -1 everywhere: every column empty until placed
  const parts = [];
  let at = 0;
  cells.forEach((body, column) => {
    if (body === null || body === undefined) return;
    offsets.writeInt16LE(at, column * 2);
    parts.push(body);
    at += body.length;
  });
  return bytesField(
    5,
    Buffer.concat([
      intField(1, index),
      intField(2, cells.filter(Boolean).length),
      bytesField(6, Buffer.concat(parts)),
      bytesField(7, offsets),
    ]),
  );
}

/* ------------------------------------------------------------------ zip -- */

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[i] = c;
  }
  return table;
})();

function crc32(buf) {
  let c = -1;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

/**
 * A stored (uncompressed) zip, which is what Numbers writes for its IWA files.
 *
 * `entries` is `{ name: Buffer }`. Order is preserved, so a fixture can put the
 * data entries behind a lot of artwork the way a real bundle does.
 */
export function zip(entries) {
  const locals = [];
  const central = [];
  let offset = 0;

  for (const [name, content] of Object.entries(entries)) {
    const body = Buffer.from(content);
    const nameBytes = Buffer.from(name, "utf8");
    const crc = crc32(body);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x0403_4b50, 0);
    local.writeUInt16LE(20, 4); // version needed
    local.writeUInt16LE(0, 8); // stored
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(body.length, 18);
    local.writeUInt32LE(body.length, 22);
    local.writeUInt16LE(nameBytes.length, 26);
    locals.push(local, nameBytes, body);

    const entry = Buffer.alloc(46);
    entry.writeUInt32LE(0x0201_4b50, 0);
    entry.writeUInt16LE(20, 4);
    entry.writeUInt16LE(20, 6);
    entry.writeUInt16LE(0, 10); // stored
    entry.writeUInt32LE(crc, 16);
    entry.writeUInt32LE(body.length, 20);
    entry.writeUInt32LE(body.length, 24);
    entry.writeUInt16LE(nameBytes.length, 28);
    entry.writeUInt32LE(offset, 42);
    central.push(entry, nameBytes);

    offset += 30 + nameBytes.length + body.length;
  }

  const directory = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x0605_4b50, 0);
  end.writeUInt16LE(Object.keys(entries).length, 8);
  end.writeUInt16LE(Object.keys(entries).length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);

  return Buffer.concat([...locals, directory, end]);
}

/* -------------------------------------------------------------- bundles -- */

/**
 * A complete one-table Numbers bundle.
 *
 * `rows` is an array of arrays; strings are pooled into the shared table the
 * way Numbers pools them, so the fixture exercises id lookup rather than
 * inlined text. The table model goes in a **different** IWA file from its
 * tiles, because that is how Apple lays a real bundle out and the parser has to
 * resolve ids across files rather than within one.
 */
export function numbersBundle(rows, { name = "Table 1", width = null, tileSize = 256, lead = {}, decoy = null } = {}) {
  const columns = width ?? Math.max(...rows.map((row) => row.length), 1);

  // Pool the strings, first use wins its id — ids start at 1, as Numbers does.
  const pool = new Map();
  const idFor = (text) => {
    if (!pool.has(text)) pool.set(text, pool.size + 1);
    return pool.get(text);
  };
  const encoded = rows.map((row) =>
    row.map((value) => {
      if (value === null || value === undefined) return null;
      // A ready-made cell passes straight through, so a check can plant one the
      // encoder would never produce — a reference to a string that is not there.
      if (Buffer.isBuffer(value)) return value;
      if (value instanceof Date) return dateCell(value);
      if (typeof value === "number") return numberCell(value);
      if (value === LEGACY) return legacyCell(idFor("must not be read"));
      return stringCell(idFor(String(value)));
    }),
  );

  // Split across tiles exactly as Numbers does, so multi-tile ordering is real.
  const tiles = [];
  const tileRefs = [];
  for (let start = 0, n = 0; start < encoded.length; start += tileSize, n++) {
    const id = 700 + n;
    const slice = encoded.slice(start, start + tileSize);
    tiles.push(
      archive(
        id,
        6002,
        Buffer.concat([intField(4, columns), ...slice.map((cells, i) => rowInfo(i, cells, columns))]),
      ),
    );
    tileRefs.push(bytesField(1, Buffer.concat([intField(1, start), reference(2, id)])));
  }

  /*
   * A decoy: an object the model references in exactly the shape a tile
   * reference takes, laid out like a tile, but of another type — and listed
   * first, so anything that reads it would put its row above the header. Only
   * the archive's **type** tells the two apart, which is the property under
   * test: a reference is a tile because of what it points at, never its shape.
   */
  const decoyArchives = [];
  const decoyRefs = [];
  if (decoy) {
    decoyArchives.push(archive(800, 6005, Buffer.concat([intField(4, columns), rowInfo(0, [stringCell(idFor(decoy))], columns)])));
    decoyRefs.push(bytesField(1, Buffer.concat([intField(1, 0), reference(2, 800)])));
  }

  // Built last: every string, the decoy's included, has its id by now.
  const stringTable = archive(
    600,
    6005,
    Buffer.concat([...pool].map(([text, id]) => bytesField(3, Buffer.concat([intField(1, id), bytesField(3, Buffer.from(text, "utf8"))])))),
  );

  const dataStore = bytesField(
    4,
    Buffer.concat([
      bytesField(3, Buffer.concat([...decoyRefs, ...tileRefs, intField(2, tileSize)])),
      reference(4, 600),
    ]),
  );
  const model = archive(
    500,
    6001,
    Buffer.concat([dataStore, intField(6, encoded.length), intField(7, columns), bytesField(8, Buffer.from(name, "utf8"))]),
  );

  return zip({
    ...lead,
    "Index/Tables/Tile.iwa": iwa(Buffer.concat(tiles)),
    "Index/CalculationEngine.iwa": iwa(Buffer.concat([model, stringTable, ...decoyArchives])),
  });
}
