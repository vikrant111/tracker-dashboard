/**
 * Runs every suite, in one command.
 *
 *   pnpm test                 everything
 *   pnpm test --no-server     skip the end-to-end suite (no dev server started)
 *   pnpm test invariants      only that group of the end-to-end suite
 *   pnpm test --keep          leave the dev server running afterwards
 *
 * The end-to-end suite needs a live server. Previously you had to remember to
 * start one in another terminal, and forgetting produced a confusing failure
 * rather than a clear message — so this starts one if nothing is listening, and
 * shuts down only the server it started.
 */
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, openSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const BASE = process.env.CHECK_BASE || "http://localhost:3000";
const READY_TIMEOUT_MS = 120_000;

const argv = process.argv.slice(2);
const flag = (name) => argv.includes(name);
const noServer = flag("--no-server");
const keep = flag("--keep");
const group = argv.find((a) => !a.startsWith("--"));

const bold = (s) => `[1m${s}[0m`;
const dim = (s) => `[2m${s}[0m`;
const green = (s) => `[32m${s}[0m`;
const red = (s) => `[31m${s}[0m`;

/** Capture stdout instead of streaming it, so a suite's tail can be summarised. */
function capture(cmd, args) {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { cwd: ROOT });
    let out = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (out += d));
    child.on("close", (code) => resolve({ code: code ?? 1, out }));
    child.on("error", (e) => resolve({ code: 1, out: String(e) }));
  });
}

const alive = async () => {
  try {
    await fetch(`${BASE}/login`, { signal: AbortSignal.timeout(2000) });
    return true;
  } catch {
    return false;
  }
};

async function waitForServer(deadline) {
  while (Date.now() < deadline) {
    if (await alive()) return true;
    await new Promise((r) => setTimeout(r, 1000));
  }
  return false;
}

let devServer = null;
let devLog = null;

async function startServer() {
  devLog = join(mkdtempSync(join(tmpdir(), "tracker-test-")), "dev.log");
  // A raw fd, not a WriteStream — spawn needs one that is already open.
  const fd = openSync(devLog, "a");
  // `pnpm dev` would add a wrapper process that survives the kill; go direct.
  //
  // `detached` puts it in its own process group so the whole tree can be
  // signalled at once. `next dev` forks a `next-server` worker, and SIGTERM to
  // the parent alone leaves that worker holding port 3000 — after which the
  // next run silently reuses a server running last run's code, and a `pnpm
  // build` against it corrupts `.next`.
  devServer = spawn("node_modules/.bin/next", ["dev"], {
    cwd: ROOT,
    stdio: ["ignore", fd, fd],
    detached: true,
  });
  devServer.unref?.();

  if (!(await waitForServer(Date.now() + READY_TIMEOUT_MS))) {
    console.log(red(`\nThe dev server did not come up within ${READY_TIMEOUT_MS / 1000}s.`));
    console.log(dim(readFileSync(devLog, "utf8").split("\n").slice(-25).join("\n")));
    return false;
  }
  return true;
}

function stopServer() {
  if (!devServer || devServer.killed) return;
  const pid = devServer.pid;
  devServer = null;
  try {
    // Negative pid = the whole group, which is the forked worker as well as the
    // parent. Killing the pid alone is what used to orphan the worker.
    process.kill(-pid, "SIGTERM");
  } catch {
    try {
      process.kill(pid, "SIGTERM");
    } catch {
      /* already gone */
    }
  }
}

// However this exits — pass, fail, Ctrl-C — a server we started must not be left behind.
for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, () => {
    stopServer();
    process.exit(130);
  });
}
process.on("exit", stopServer);

const results = [];
const record = (name, code, detail = "") => {
  results.push({ name, ok: code === 0, detail });
  console.log(code === 0 ? green(`  ✓ ${name} ${dim(detail)}`) : red(`  ✗ ${name} ${detail}`));
};

/** Pull the "All N checks passed." tail out of a suite's own output. */
const summarise = (out) => {
  const m = out.match(/All (\d+) [\w- ]*checks passed\./) || out.match(/(\d+) of (\d+) [\w- ]*checks FAILED/);
  return m ? m[0] : "";
};

console.log(bold("\nStatic suites") + dim("  — no server needed"));

{
  const { code, out } = await capture("node_modules/.bin/tsc", ["--noEmit"]);
  record("typecheck", code, code === 0 ? "" : out.split("\n").slice(0, 6).join("\n"));
}
for (const [name, script] of [
  ["docs", "scripts/check-docs.mjs"],
  ["theme + source rules", "scripts/check-theme.mjs"],
  ["client logic (dial + greeting)", "scripts/check-ui.mjs"],
]) {
  const { code, out } = await capture("node", [script]);
  record(name, code, code === 0 ? summarise(out) : out.split("\n").filter((l) => l.includes("✗")).slice(0, 8).join("\n"));
}

if (noServer) {
  console.log(dim("\nEnd-to-end suite skipped (--no-server)."));
} else {
  console.log(bold("\nEnd-to-end suite") + dim("  — against a live server"));
  const already = await alive();
  if (already) {
    console.log(dim(`  using the server already listening on ${BASE}`));
  } else {
    console.log(dim("  nothing listening — starting one"));
    if (!(await startServer())) {
      record("end-to-end", 1, "server would not start");
    }
  }

  if (await alive()) {
    if (!existsSync(join(ROOT, ".env.local"))) {
      record("end-to-end", 1, ".env.local is missing — run pnpm seed first");
    } else {
      const args = ["--env-file=.env.local", "scripts/check.mjs"];
      if (group) args.push(group);
      const { code, out } = await capture("node", args);
      record(
        `end-to-end${group ? ` (${group})` : ""}`,
        code,
        code === 0 ? summarise(out) : out.split("\n").filter((l) => l.includes("✗")).slice(0, 10).join("\n"),
      );
    }
  }

  if (keep && devServer) console.log(dim(`\n  dev server left running (--keep), log: ${devLog}`));
  else stopServer();
}

const failed = results.filter((r) => !r.ok);
console.log("\n" + "─".repeat(62));
if (failed.length === 0) {
  console.log(green(bold(`All ${results.length} suites passed.`)));
} else {
  console.log(red(bold(`${failed.length} of ${results.length} suites FAILED:`)));
  for (const f of failed) console.log(red(`  ✗ ${f.name}`));
  if (devLog) console.log(dim(`  dev server log: ${devLog}`));
}
process.exit(failed.length ? 1 : 0);
