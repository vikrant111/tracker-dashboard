/**
 * Enough of the Protobuf wire format to read fields without knowing the schema.
 *
 * Which is the only option available: the schemas are Apple's, and unpublished.
 * Anything malformed ends the walk rather than throwing, because a file this
 * cannot read must yield no rows rather than a crash.
 */
export type Field = { field: number; wire: number; varint: number; bytes: Uint8Array | null };

/**
 * Walk one level of a Protobuf message.
 *
 * Enough of the wire format to read fields without knowing the schema, which is
 * the only option when the schema is Apple's and unpublished. Anything
 * malformed ends the walk rather than throwing.
 */
export function* walk(buf: Uint8Array): Generator<Field> {
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

export type Archive = { id: number; type: number; payload: Uint8Array };

/**
 * An IWA stream is a run of `varint(length) ArchiveInfo payload…`, where the
 * info names the object's id and the byte length of each payload following it.
 */
export function readArchives(buf: Uint8Array): Archive[] {
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
