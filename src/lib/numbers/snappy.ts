/**
 * Snappy's raw block format, and the IWA framing wrapped around it.
 *
 * IWA uses the bare block rather than the framed stream, so there is no
 * checksum to verify and nothing on npm that reads it out of the box.
 */
/**
 * Snappy's raw block format — a varint length, then literals and back-references.
 *
 * IWA uses the bare block, not the framed stream, so there is no checksum to
 * verify and no library that reads it out of the box.
 */
export function snappy(input: Uint8Array): Uint8Array {
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
export function unwrapIWA(bytes: Uint8Array): Uint8Array {
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
