import { inflateRawSync } from "node:zlib";

/**
 * Just enough zip to find the `.iwa` entries.
 *
 * Written by hand rather than pulling in a zip library: only the central
 * directory and one compression method are needed, and the `Data/` folder —
 * often most of the file, all preview images — is skipped without ever being
 * decompressed.
 */
/**
 * The `.iwa` entries of a zip, by name.
 *
 * Written by hand against `node:zlib` rather than pulling in a zip library:
 * only the central directory and one compression method are needed, and the
 * `Data/` folder — full of preview images that can be most of the file — is
 * skipped without ever being decompressed.
 */
export function readZip(bytes: Uint8Array): Map<string, Uint8Array> {
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
