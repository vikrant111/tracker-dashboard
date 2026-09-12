/**
 * Refuse to start a second dev server against the same `.next`.
 *
 * Runs automatically as `predev`.
 *
 * Two `next dev` processes sharing one build directory is not a conflict the
 * framework notices. The second finds port 3000 taken, quietly moves to 3001,
 * and then **both write `.next`** — so each keeps serving a page whose chunks
 * the other has just replaced underneath it. It surfaces in the browser as
 *
 *     ChunkLoadError: Loading chunk app/… failed
 *     Invariant: Expected clientReferenceManifest to be defined
 *
 * which reads as a framework bug, is not one, and sends people looking in
 * entirely the wrong place. It has cost this project three debugging sessions.
 *
 * A build directory of its own makes it safe, which is what the test suite does
 * (`NEXT_DIST_DIR=.next-check`), so that case is allowed through.
 */
import { execSync } from "node:child_process";

const C = process.stdout.isTTY
  ? { warn: "\x1b[33m", dim: "\x1b[2m", off: "\x1b[0m", b: "\x1b[1m" }
  : { warn: "", dim: "", off: "", b: "" };

/* A directory of its own is the safe case — nothing to collide over. */
if (process.env.NEXT_DIST_DIR?.trim() || process.env.DEV_ALLOW_MULTIPLE === "1") process.exit(0);

/** Other `next dev` processes, if this platform can be asked. */
function others() {
  if (process.platform === "win32") return [];
  try {
    return execSync("ps -A -o pid=,command=", { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] })
      .split("\n")
      .filter((line) => /\bnext-server\b/.test(line) || /\bnext\b\s+dev\b/.test(line))
      /* Not this process, and not the shell that is starting it. */
      .filter((line) => {
        const pid = Number(line.trim().split(/\s+/)[0]);
        return pid !== process.pid && pid !== process.ppid;
      });
  } catch {
    return [];
  }
}

const running = others();
if (running.length === 0) process.exit(0);

console.error(
  `\n${C.warn}A dev server is already running.${C.off}\n\n` +
    running.map((l) => `  ${C.dim}${l.trim().slice(0, 96)}${C.off}`).join("\n") +
    `\n\n  Starting a second one does not give you a second app — it gives you two\n` +
    `  servers writing the same ${C.b}.next${C.off}, and the browser then fails with\n` +
    `  ${C.dim}ChunkLoadError${C.off} or ${C.dim}Expected clientReferenceManifest to be defined${C.off}\n` +
    `  on a page that worked a minute ago.\n\n` +
    `  Use the one already running, or stop it first (Ctrl-C in its terminal).\n` +
    `  ${C.dim}A build directory of its own is safe:  NEXT_DIST_DIR=.next-alt pnpm dev${C.off}\n`,
);
process.exit(1);
