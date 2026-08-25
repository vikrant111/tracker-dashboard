/**
 * Downloads the three typefaces into `src/fonts/files/`, so the build never
 * has to reach Google.
 *
 *     pnpm fonts:vendor
 *
 * Run this from a machine that **can** reach `fonts.googleapis.com`, then commit
 * what it writes. The locked-down machine gets the files through git and builds
 * with `FONT_SOURCE=local`, touching the network for nothing.
 *
 * Only the `latin` subset is taken, which is what the Google configuration asks
 * for. The whole set is about 140 KB.
 */
import { writeFileSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "src/fonts/files");

/*
 * A browser user-agent, because Google serves `.ttf` to anything it does not
 * recognise and `.woff2` only to modern browsers. Without this you silently get
 * files four times the size, in a format `next/font/local` will still accept.
 */
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

/*
 * These specs must stay in step with `src/fonts/google.ts` — same families,
 * same weights, same subset. If you change one, change both, or `local` and
 * `google` quietly render differently.
 */
const FAMILIES = [
  { name: "Bricolage Grotesque", spec: "Bricolage+Grotesque:opsz,wght@12..96,200..800" },
  { name: "IBM Plex Sans", spec: "IBM+Plex+Sans:wght@400;500;600" },
  { name: "IBM Plex Mono", spec: "IBM+Plex+Mono:wght@400;500;600" },
];

const slug = (name) => name.toLowerCase().replace(/[^a-z0-9]+/g, "-");

async function fetchText(url) {
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`);
  return res.text();
}

/** The `latin` faces from one family's stylesheet, in declaration order. */
async function latinFaces({ name, spec }) {
  const css = await fetchText(`https://fonts.googleapis.com/css2?family=${spec}&display=swap`);
  const faces = [];
  /*
   * Google labels each block with a `/* subset *\/` comment immediately above
   * it. Pairing the comment with the block is the only way to tell latin from
   * latin-ext and cyrillic — the `unicode-range` would also work but is far
   * more to parse.
   */
  const blocks = css.matchAll(/\/\*\s*([a-z0-9-]+)\s*\*\/\s*@font-face\s*\{([\s\S]*?)\}/g);
  for (const [, subset, body] of blocks) {
    if (subset !== "latin") continue;
    const weight = body.match(/font-weight:\s*([^;]+);/)?.[1].trim();
    const url = body.match(/url\((https:\/\/[^)]+\.woff2)\)/)?.[1];
    if (weight && url) faces.push({ family: name, weight, url });
  }
  if (!faces.length) throw new Error(`no latin faces found for ${name}`);
  return faces;
}

async function main() {
  mkdirSync(OUT, { recursive: true });

  const downloaded = new Map(); // url → filename, so a shared file is fetched once
  let declarations = 0;

  for (const family of FAMILIES) {
    const faces = await latinFaces(family);
    for (const face of faces) {
      declarations++;
      if (downloaded.has(face.url)) continue;

      /*
       * A weight like `200 800` is a variable font's range, not a number, so it
       * cannot go in a filename. Those become `-variable`.
       */
      const label = face.weight.includes(" ") ? "variable" : face.weight;
      const file = `${slug(face.family)}-${label}.woff2`;

      const res = await fetch(face.url, { headers: { "User-Agent": UA } });
      if (!res.ok) throw new Error(`${face.url} → HTTP ${res.status}`);
      const buf = Buffer.from(await res.arrayBuffer());

      /*
       * Check the magic bytes rather than the status code. A proxy that
       * intercepts this returns 200 with an HTML block page, and an HTML file
       * named `.woff2` fails much later and much more confusingly.
       */
      if (buf.subarray(0, 4).toString("latin1") !== "wOF2") {
        throw new Error(
          `${file} is not a woff2 file — got ${buf.length} bytes starting ` +
            `"${buf.subarray(0, 16).toString("latin1").replace(/[^\x20-\x7e]/g, ".")}". ` +
            `A proxy or captive portal probably answered instead of Google.`,
        );
      }

      writeFileSync(join(OUT, file), buf);
      downloaded.set(face.url, file);
      console.log(`  ${file.padEnd(36)} ${String(buf.length).padStart(7)} bytes`);
    }
  }

  const total = readdirSync(OUT)
    .filter((f) => f.endsWith(".woff2"))
    .reduce((sum, f) => sum + statSync(join(OUT, f)).size, 0);

  console.log(
    `\n${downloaded.size} files (${(total / 1024).toFixed(0)} KB) for ${declarations} declarations.`,
  );
  console.log("Commit src/fonts/files/, then build with FONT_SOURCE=local.");
}

main().catch((err) => {
  console.error(`\nCould not vendor the fonts: ${err.message}\n`);
  if (/certificate|self-signed|unable to (get|verify)/i.test(err.message)) {
    console.error(
      "That is a TLS error, so this machine is behind an inspecting proxy too.\n" +
        "Run this from a machine that is not, or set NODE_EXTRA_CA_CERTS to your\n" +
        "organisation's CA bundle. See docs/restricted-environments.md.",
    );
  }
  process.exit(1);
});
