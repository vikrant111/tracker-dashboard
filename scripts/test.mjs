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
/*
 * Where the end-to-end suite points.
 *
 * Not a constant: unless somebody names a server explicitly, this run starts
 * one of its own on a free port. It used to reuse whatever was already on 3000
 * — which is normally the developer's `pnpm dev`, reading the real store. The
 * suite writes as it goes, so test repositories and pull requests ended up on
 * a live board looking exactly like something a colleague had added. Twenty
 * seconds of startup is a cheap price for never doing that again.
 */
let base = process.env.CHECK_BASE || "";
const borrowed = Boolean(process.env.CHECK_BASE);
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
function capture(cmd, args, env = {}) {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { cwd: ROOT, env: { ...process.env, ...env } });
    let out = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (out += d));
    child.on("close", (code) => resolve({ code: code ?? 1, out }));
    child.on("error", (e) => resolve({ code: 1, out: String(e) }));
  });
}

const aliveAt = async (url) => {
  try {
    await fetch(`${url}/login`, { signal: AbortSignal.timeout(2000) });
    return true;
  } catch {
    return false;
  }
};

const alive = () => aliveAt(base);

/** The first port from 3000 up that nothing is already answering on. */
async function freePort() {
  for (let port = 3000; port < 3040; port++) {
    if (!(await aliveAt(`http://localhost:${port}`))) return port;
  }
  return 0;
}

async function waitForServer(deadline) {
  while (Date.now() < deadline) {
    if (await alive()) return true;
    await new Promise((r) => setTimeout(r, 1000));
  }
  return false;
}

let devServer = null;
let devLog = null;
/*
 * The store the server we started is using. The checks plant a few rows
 * directly rather than through the API — syncing a pull request for real needs
 * a GitHub token — so they have to open the same one. Left null when we are
 * borrowing somebody else's server, whose store we do not know.
 */
let devStore = null;

async function startServer(port) {
  const scratch = mkdtempSync(join(tmpdir(), "tracker-test-"));
  devLog = join(scratch, "dev.log");
  // A raw fd, not a WriteStream — spawn needs one that is already open.
  const fd = openSync(devLog, "a");

  /*
   * A store of its own, thrown away with the temp directory.
   *
   * The suite used to run against whatever `DB_store/` the developer had, and
   * it writes as it goes: repositories, pull requests, scope rows. A run that
   * was interrupted left those behind, and they then appeared on the real
   * board as if somebody had put them there — test pull requests in a live
   * sign-off report is not a small thing to hand a team.
   *
   * Seeded first, because the checks below expect the demo PODs to exist and
   * an empty store has none. The admin bootstraps itself from `ADMIN_EMAIL`.
   */
  const store = join(scratch, "DB_store");
  devStore = store;
  const seeded = await capture("node", ["--env-file=.env.local", "scripts/seed.mjs", "--reset"], { DB_STORE_DIR: store });
  if (seeded.code !== 0) {
    console.log(red("\nCould not seed the suite's own store."));
    console.log(dim(seeded.out.split("\n").slice(-15).join("\n")));
    return false;
  }
  // `pnpm dev` would add a wrapper process that survives the kill; go direct.
  //
  // `detached` puts it in its own process group so the whole tree can be
  // signalled at once. `next dev` forks a `next-server` worker, and SIGTERM to
  // the parent alone leaves that worker holding port 3000 — after which the
  // next run silently reuses a server running last run's code, and a `pnpm
  // build` against it corrupts `.next`.
  /*
   * A build directory of its own, and this is not optional.
   *
   * Without `NEXT_DIST_DIR` this server wrote `.next` — the very directory a
   * developer's own `pnpm dev` is reading. Two servers then serve pages whose
   * chunks the other has just replaced, and the browser fails with
   * `ChunkLoadError` or `Expected clientReferenceManifest to be defined` on a
   * page that worked a minute earlier. It reads as a framework bug and is not
   * one; it cost this project three debugging sessions before anybody looked
   * here. The store was already isolated; the build directory was not.
   */
  devServer = spawn("node_modules/.bin/next", ["dev", "-p", String(port)], {
    cwd: ROOT,
    stdio: ["ignore", fd, fd],
    detached: true,
    env: { ...process.env, DB_STORE_DIR: store, NEXT_DIST_DIR: ".next-e2e", DEV_ALLOW_MULTIPLE: "1" },
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
  /*
   * Mounts components and clicks them. Every other component check reads source
   * and matches a pattern, which proves the wiring is written rather than that
   * it works — an expandable row shipped twice that opened and would not close.
   */
  ["rendered + clicked", "scripts/check-render.mjs"],
]) {
  const { code, out } = await capture("node", [script]);
  record(name, code, code === 0 ? summarise(out) : out.split("\n").filter((l) => l.includes("✗")).slice(0, 8).join("\n"));
}

/*
 * The production build, because nothing else compiles the client bundle.
 *
 * `tsc` is happy with a client component importing a server module — the types
 * are fine. Only bundling notices that the import drags mongoose, and mongoose
 * drags `net`, into a browser. That shipped broken once: the DevOps page
 * imported one shared function from a module that reaches the store, and no
 * check compiled the page, so every suite passed while `pnpm dev` refused to
 * render it.
 *
 * Roughly 20 seconds, which is worth it for the one failure mode nothing else
 * can see.
 */
{
  /*
   * Into a directory of its own. This used to write `.next`, which is the
   * directory a `pnpm dev` running in another terminal is reading — the build
   * replaced its chunks mid-session and the browser then failed with
   * `ChunkLoadError` on a page that had worked a minute earlier. It reads as a
   * code fault and is not one, so the suite no longer causes it.
   */
  const { code, out } = await capture("node_modules/.bin/next", ["build", "--no-lint"], { NEXT_DIST_DIR: ".next-check" });
  const trouble = out
    .split("\n")
    .filter((l) => /Module not found|Can't resolve|Failed to compile/.test(l))
    .slice(0, 6)
    .join("\n");
  record("production build", code, code === 0 ? "client bundle compiles" : trouble || out.split("\n").slice(-6).join("\n"));
}

if (noServer) {
  console.log(dim("\nEnd-to-end suite skipped (--no-server)."));
} else {
  console.log(bold("\nEnd-to-end suite") + dim("  — against a live server"));

  if (borrowed) {
    /*
     * Somebody named a server, so they own what happens to its data. Said out
     * loud all the same: this is the one path the isolation cannot cover.
     */
    console.log(dim(`  using the server named in CHECK_BASE: ${base}`));
    console.log(red("  ⚠ that server has its own store, and this suite writes to it."));
    if (!(await alive())) record("end-to-end", 1, `nothing is answering on ${base}`);
  } else {
    /*
     * Our own, on a port nothing else is using, reading a store of its own.
     * A `pnpm dev` on 3000 is left completely alone — it is not read from, not
     * written to, and not the thing these checks are measuring.
     */
    const port = await freePort();
    if (!port) {
      record("end-to-end", 1, "no free port between 3000 and 3039");
    } else {
      base = `http://localhost:${port}`;
      console.log(dim(`  starting a server of its own on ${port}, with its own store`));
      if (!(await startServer(port))) record("end-to-end", 1, "server would not start");
    }
  }

  if (await alive()) {
    if (!existsSync(join(ROOT, ".env.local"))) {
      record("end-to-end", 1, ".env.local is missing — run pnpm seed first");
    } else {
      const args = ["--env-file=.env.local", "scripts/check.mjs"];
      if (group) args.push(group);
      const { code, out } = await capture("node", args, {
        CHECK_BASE: base,
        ...(devStore ? { DB_STORE_DIR: devStore } : {}),
      });
      /*
       * A crash is not a failed check, and it used to be reported as neither:
       * filtering for "✗" found nothing and the suite printed a bare ✗ with no
       * detail at all. The last few lines are what says whether the checks
       * failed or the script fell over before running them.
       */
      const failedChecks = out.split("\n").filter((l) => l.includes("✗")).slice(0, 10).join("\n");
      record(
        `end-to-end${group ? ` (${group})` : ""}`,
        code,
        code === 0
          ? summarise(out)
          : failedChecks || out.split("\n").filter((l) => l.trim()).slice(-8).join("\n") || "no output at all",
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
