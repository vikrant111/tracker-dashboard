/**
 * Clear the project back to a fresh clone.
 *
 *     pnpm clear              node_modules, build output, caches
 *     pnpm clear --dry-run    print what would go, remove nothing
 *
 * What it removes is installed or generated — `pnpm install` and `pnpm build`
 * put all of it back. **It never touches `DB_store/`, `.env*` or anything you
 * wrote**: those are data and configuration, and `pnpm delete <seed>` is the
 * command for the first of them.
 *
 * Node's own `rm` rather than `rm -rf`, so it behaves the same on Windows, and
 * so a path outside the project cannot be reached — every target is resolved
 * and checked against the project root before anything is deleted.
 */
import { execSync } from "node:child_process";
import { existsSync, readdirSync, rmSync, statSync } from "node:fs";
import { join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(fileURLToPath(new URL("../", import.meta.url)));
const dryRun = process.argv.includes("--dry-run");
const force = process.argv.includes("--force");

const C = process.stdout.isTTY
  ? { dim: "\x1b[2m", ok: "\x1b[32m", warn: "\x1b[33m", off: "\x1b[0m", b: "\x1b[1m" }
  : { dim: "", ok: "", warn: "", off: "", b: "" };

/**
 * Everything installed or generated.
 *
 * `.next-*` is matched by prefix because `NEXT_DIST_DIR` gives a build its own
 * directory — `.next-check` from the test suite is the usual one — and leaving
 * those behind is half the disk this command is run to get back.
 */
const EXACT = [
  "node_modules",
  ".next",
  ".pnpm-store",
  ".render-check",
  "tsconfig.tsbuildinfo",
  "next-env.d.ts",
];
const PREFIXES = [".next-"];

/** Directory sizes, so the summary is worth reading. */
function bytesIn(path) {
  let total = 0;
  try {
    const stat = statSync(path);
    if (!stat.isDirectory()) return stat.size;
    for (const entry of readdirSync(path, { withFileTypes: true })) {
      total += bytesIn(join(path, entry.name));
    }
  } catch {
    /* A file that vanished or cannot be read is not worth failing over —
       this is a size for a log line, not an inventory. */
  }
  return total;
}

const human = (n) => {
  const units = ["B", "kB", "MB", "GB"];
  let size = n;
  let at = 0;
  while (size >= 1024 && at < units.length - 1) {
    size /= 1024;
    at++;
  }
  return `${size.toFixed(at === 0 ? 0 : 1)} ${units[at]}`;
};

/**
 * Refuse anything that is not inside the project.
 *
 * This is the guard that matters: everything else here is a convenience, and a
 * recursive delete that can be pointed outside its own directory is a footgun
 * no matter how carefully the list above is written.
 */
function insideRoot(path) {
  const full = resolve(path);
  return full !== ROOT && full.startsWith(ROOT + sep);
}

/**
 * Is a dev server running right now?
 *
 * This is the guard that matters most in practice. `.next` and `node_modules`
 * are exactly what a running `next dev` is reading, and pulling them out from
 * under it does not stop it — it keeps serving, and the next request dies on
 * `Invariant: Expected clientReferenceManifest to be defined`, which reads as
 * a Next.js bug rather than as "somebody deleted my build directory".
 *
 * `null` means "cannot tell", which is not the same as "no": it warns and
 * carries on rather than refusing to work on a platform it cannot inspect.
 */
function devServerRunning() {
  if (process.platform === "win32") return null;
  try {
    const lines = execSync("ps -A -o command=", { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).split("\n");
    // This script's own command line says "next" nowhere, but a grep for it
    // would match a shell running it, so the match is on what Next actually
    // execs.
    return lines.some((line) => /\bnext-server\b/.test(line) || /\bnext\b\s+dev\b/.test(line));
  } catch {
    return null;
  }
}

const running = dryRun ? false : devServerRunning();

if (running && !force) {
  console.error(
    `\n${C.warn}A dev server is running.${C.off}\n\n` +
      `  Removing node_modules and .next underneath it does not stop it — it keeps\n` +
      `  serving, and the next request fails with\n` +
      `  ${C.dim}Invariant: Expected clientReferenceManifest to be defined${C.off},\n` +
      `  which looks like a Next.js bug and is not one.\n\n` +
      `  Stop it first (Ctrl-C in its terminal), then run this again.\n` +
      `  ${C.dim}--force clears anyway; --dry-run just lists what would go.${C.off}\n`,
  );
  process.exit(1);
}

if (running === null && !dryRun) {
  console.log(`\n${C.warn}Could not tell whether a dev server is running.${C.off} ${C.dim}Stop it before clearing.${C.off}`);
}

const targets = [];
for (const name of readdirSync(ROOT)) {
  if (EXACT.includes(name) || PREFIXES.some((p) => name.startsWith(p))) targets.push(name);
}

if (targets.length === 0) {
  console.log(`${C.ok}Already clear.${C.off} Nothing installed or built to remove.`);
  process.exit(0);
}

console.log(`\n${C.b}${dryRun ? "Would clear" : "Clearing"}${C.off} ${C.dim}${ROOT}${C.off}\n`);

let freed = 0;
for (const name of targets) {
  const path = join(ROOT, name);

  if (!insideRoot(path) || !existsSync(path)) {
    console.log(`  ${C.warn}skip${C.off}  ${name} ${C.dim}(not inside the project)${C.off}`);
    continue;
  }

  const size = bytesIn(path);
  freed += size;
  console.log(`  ${dryRun ? "would remove" : "removed"}  ${name} ${C.dim}${human(size)}${C.off}`);
  if (!dryRun) rmSync(path, { recursive: true, force: true });
}

console.log(
  `\n${C.ok}${dryRun ? "Would free" : "Freed"} ${human(freed)}.${C.off} ` +
    `${C.dim}Your data in DB_store/ and your .env files were not touched.${C.off}`,
);
if (!dryRun) console.log(`${C.dim}Run \`pnpm install\` to get back to a working checkout.${C.off}\n`);
