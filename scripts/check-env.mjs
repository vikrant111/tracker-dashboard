/**
 * Preflight for a machine you do not control.
 *
 *     pnpm check:env
 *
 * Answers one question — *what, specifically, is broken here* — and prints the
 * fix for each thing that is. Safe to run before `pnpm install` has finished,
 * before `.env.local` exists, and with no network at all.
 *
 * It never changes anything. Everything it suggests, you run yourself.
 */
import { execSync } from "node:child_process";
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
/* Shared with the check suite, so both agree on what a certificate error is. */
import { probe } from "./probe.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

const C = process.stdout.isTTY
  ? { ok: "\x1b[32m", bad: "\x1b[31m", warn: "\x1b[33m", dim: "\x1b[2m", off: "\x1b[0m", b: "\x1b[1m" }
  : { ok: "", bad: "", warn: "", dim: "", off: "", b: "" };

const problems = [];
let count = 0;

/** @param {"ok"|"bad"|"warn"} state */
function report(state, label, detail, fix) {
  count++;
  const mark = state === "ok" ? "ok  " : state === "bad" ? "FAIL" : "warn";
  const colour = state === "ok" ? C.ok : state === "bad" ? C.bad : C.warn;
  console.log(`  ${colour}${mark}${C.off}  ${label}${detail ? `  ${C.dim}${detail}${C.off}` : ""}`);
  if (state !== "ok" && fix) problems.push({ label, fix });
}

const section = (title) => console.log(`\n${C.b}${title}${C.off}`);

/* ------------------------------------------------------------------ env -- */

/**
 * Read `.env.local` without depending on it existing, and without `--env-file`,
 * which makes Node exit if the file is missing — unhelpful in a script whose
 * whole job is telling you what is missing.
 */
function readNamedEnv(name) {
  const path = join(ROOT, name);
  if (!existsSync(path)) return null;
  const out = {};
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (!m) continue;
    out[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
  }
  return out;
}

const fileEnv = readNamedEnv(".env.local");
const env = { ...(fileEnv ?? {}), ...process.env };

/* --------------------------------------------------------------- probes -- */


const TLS_FIX = `Node ships its own CA list and ignores the system keychain, which is why
       the browser works and the build does not. Point Node at your organisation's
       root CA:

         export NODE_EXTRA_CA_CERTS=/absolute/path/to/corporate-ca.pem

       Export it from the system trust store:
         macOS    security find-certificate -a -p /Library/Keychains/System.keychain > corp-ca.pem
         Windows  certutil -store Root > root.txt   (then export the proxy CA as Base-64 .cer)
         Linux    it is usually already in /etc/ssl/certs/ca-certificates.crt

       Ask IT for "the root CA certificate for the TLS inspection proxy" if you
       cannot find it. Add the export line to your shell profile so it persists.

       Do NOT use NODE_TLS_REJECT_UNAUTHORIZED=0. It disables certificate
       checking for every connection the process makes, including the ones
       carrying your Azure token.`;

/* ---------------------------------------------------------------- checks -- */

console.log(`\n${C.b}POD Tracker — environment check${C.off}`);

section("Runtime");
{
  const major = Number(process.versions.node.split(".")[0]);
  report(
    major >= 20 ? "ok" : "bad",
    `Node ${process.versions.node}`,
    major >= 20 ? "" : "need 20 or newer",
    "Install Node 20+ — https://nodejs.org, or `nvm install 20` if you have nvm.",
  );

  const pm = existsSync(join(ROOT, "pnpm-lock.yaml"));
  report(
    pm ? "ok" : "warn",
    "pnpm lockfile present",
    pm ? "" : "pnpm-lock.yaml missing",
    "This project uses pnpm, never npm. `corepack enable` then `pnpm install`.",
  );

  const mods = existsSync(join(ROOT, "node_modules"));
  report(
    mods ? "ok" : "bad",
    "Dependencies installed",
    mods ? "" : "node_modules missing",
    "Run `pnpm install`. If that fails on certificates, fix the CA first — see below.",
  );
}

section("Network and certificates");
{
  const extra = process.env.NODE_EXTRA_CA_CERTS;
  if (extra) {
    const there = existsSync(extra);
    report(
      there ? "ok" : "bad",
      "NODE_EXTRA_CA_CERTS",
      there ? extra : `set, but no file at ${extra}`,
      "The variable points at a file that does not exist. Fix the path, or unset it.",
    );
  } else {
    report("warn", "NODE_EXTRA_CA_CERTS", "not set", null);
  }

  const registry = await probe("https://registry.npmjs.org/next");
  report(
    registry.kind === "http" ? "ok" : "bad",
    "Package registry reachable",
    registry.kind === "http" ? `HTTP ${registry.status}` : `${registry.kind} — ${registry.detail}`,
    registry.kind === "tls"
      ? TLS_FIX
      : registry.kind === "ok"
        ? null
        : `Cannot reach registry.npmjs.org (${registry.kind}). If your organisation runs an
       internal mirror, point pnpm at it:  pnpm config set registry https://your-mirror/`,
  );

  const fonts = await probe("https://fonts.googleapis.com/css2?family=IBM+Plex+Sans&display=swap");
  const fontsOk = fonts.kind === "http" && fonts.status === 200;
  report(
    fontsOk ? "ok" : "warn",
    "Google Fonts reachable",
    fontsOk ? "HTTP 200" : `${fonts.kind}${fonts.detail ? ` — ${fonts.detail}` : ` ${fonts.status ?? ""}`}`,
    fontsOk
      ? null
      : `The build downloads fonts from here when FONT_SOURCE=google (the default),
       so this will fail the build. You do not have to fix it — build with the
       fonts already in the repository instead:

         echo 'FONT_SOURCE=local' >> .env.local

       ${fonts.kind === "tls" ? "(This is the same certificate problem as above, if you would rather fix it properly.)" : ""}`,
  );
}

section("Fonts");
{
  const source = (env.FONT_SOURCE || "google").toLowerCase();
  const known = ["google", "local", "system"].includes(source);
  report(
    known ? "ok" : "bad",
    `FONT_SOURCE = ${source}`,
    known ? "" : "unknown value",
    "Use google, local or system.",
  );

  const dir = join(ROOT, "src/fonts/files");
  const files = existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith(".woff2")) : [];
  const bytes = files.reduce((sum, f) => sum + statSync(join(dir, f)).size, 0);

  if (source === "local") {
    report(
      files.length >= 5 ? "ok" : "bad",
      "Vendored font files",
      `${files.length} files, ${(bytes / 1024).toFixed(0)} KB`,
      files.length >= 5
        ? null
        : `FONT_SOURCE=local needs the .woff2 files in src/fonts/files/.
       Run \`pnpm fonts:vendor\` on a machine that can reach Google and commit
       the result — or set FONT_SOURCE=system, which needs no files at all.`,
    );
  } else {
    report("ok", "Vendored font files", `${files.length} present (unused at FONT_SOURCE=${source})`);
  }
}

section("Database");
{
  /*
   * Only the driver that is actually configured.
   *
   * This used to probe MongoDB whatever `DB_DRIVER` said, so a perfectly
   * healthy `json` deployment was greeted with a red FAIL about a database it
   * does not use — which is exactly the kind of false alarm that teaches people
   * to ignore the tool.
   */
  const driver = (env.DB_DRIVER ?? "").trim().toLowerCase() || "json";

  if (driver !== "mongodb") {
    report("ok", `DB_DRIVER = ${driver}`, "MongoDB is not used — nothing to reach");
  } else {
  /*
   * The URI is resolved by the app's own module, not re-implemented here — a
   * check that reimplements what it checks tests only its copy. This is the
   * same `resolveMongoUri` the server calls, so a rule added there is enforced
   * here for free.
   */
  const { resolveMongoUri, redactUri } = await import("../src/db/uri.ts");
  const verdict = resolveMongoUri(env, false);

  report(
    verdict.ok ? "ok" : "bad",
    "MONGODB_URI",
    verdict.ok ? `${redactUri(verdict.uri)} → ${verdict.dbName}` : verdict.reason,
    verdict.ok
      ? null
      : `Set one URL and you are done:

         local, nothing installed   MONGODB_URI=mongodb://127.0.0.1:27017
                                    (then run \`pnpm mongo:local\` in another terminal)
         hosted, nothing installed  MONGODB_URI=mongodb+srv://USER:PASS@cluster.mongodb.net

       Atlas has a free tier that is more than this dashboard needs:
       https://www.mongodb.com/cloud/atlas/register`,
  );

  if (verdict.ok) {
    /*
     * A real connection, not a TCP poke. Authentication, the IP allowlist and
     * SRV resolution all fail *after* the socket opens, and those are the three
     * things that actually go wrong on a first setup.
     */
    let mongoose = null;
    try {
      mongoose = (await import("mongoose")).default;
    } catch {
      /* reported below */
    }

    if (!mongoose) {
      report("bad", "Reachable", "mongoose is not installed", "Run `pnpm install`.");
    } else {
      let detail = "";
      let ok = false;
      try {
        await mongoose.connect(verdict.uri, {
          dbName: verdict.dbName,
          serverSelectionTimeoutMS: 6000,
          bufferCommands: false,
        });
        await mongoose.connection.db.admin().ping();
        ok = true;
        detail = "connected";
      } catch (err) {
        detail = (err?.message ?? String(err)).slice(0, 120);
      } finally {
        await mongoose.disconnect().catch(() => {});
      }

      report(
        ok ? "ok" : "bad",
        "Reachable",
        detail,
        ok
          ? null
          : `The dashboard cannot run without the database. The usual causes, in order:

         1. Nothing is running locally     → \`pnpm mongo:local\` (no install, no Docker)
         2. Your IP is not allowed         → Atlas → Network Access → add current IP
         3. The password is not encoded    → @ : / ? # % must be percent-encoded in the URI
         4. Port 27017 is blocked          → common on a corporate network; use Atlas over
                                             a plain mongodb:// string, or run it locally

       docs/restricted-environments.md walks through all four.`,
      );
    }
  }
  } /* end: only when DB_DRIVER=mongodb */
}

section("Configuration");
{
  report(
    fileEnv ? "ok" : "bad",
    ".env.local present",
    fileEnv ? `${Object.keys(fileEnv).length} values` : "missing",
    "Copy the template:  cp .env.example .env.local",
  );

  const secret = env.AUTH_SECRET || "";
  const placeholder = /^(change|dev-only|secret|please)/i.test(secret);
  const good = secret.length >= 32 && !placeholder;
  report(
    good ? "ok" : secret ? "bad" : "warn",
    "AUTH_SECRET",
    good ? `${secret.length} characters` : secret ? "too short or a placeholder" : "not set",
    good
      ? null
      : `The app refuses to start in production without a real one. Generate it:
         openssl rand -base64 32`,
  );

  const mode = env.AUTH_MODE || "off";
  report("ok", `AUTH_MODE = ${mode}`, mode === "off" ? "local development only" : "");

  const azure = env.AZDO_ORG_URL && env.AZDO_PROJECT && env.AZDO_PAT;
  report(
    "ok",
    "Azure credentials",
    azure ? "set" : "not set — spreadsheet upload and `pnpm seed` still work",
  );
}

section("Data at rest");
{
  /*
   * The JSON driver's risk is **not** the browser. The files live on the
   * server, are not under `public/`, and no client component can reach the
   * filesystem — a reader with devtools open cannot see or change them.
   *
   * The risks that are real are git and file permissions, and both are quiet.
   */
  const driver = (env.DB_DRIVER ?? "").trim().toLowerCase() || "json";
  report("ok", `DB_DRIVER = ${driver}`, driver === "json" ? "files under DB_store/" : "");

  if (driver === "json") {
    const dir = (env.DB_STORE_DIR ?? "").trim() || join(ROOT, "DB_store");
    const inRepo = !env.DB_STORE_DIR?.trim();

    /* Anything under the project is a candidate for `git add .`. */
    let tracked = [];
    try {
      tracked = execSync("git ls-files DB_store/", { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] })
        .split("\n").filter(Boolean);
    } catch {
      /* not a git checkout, or no git — then there is nothing to leak this way */
    }

    /* Does what is tracked actually carry a secret? */
    const secrets = [];
    for (const file of tracked) {
      let text = "";
      try { text = readFileSync(join(ROOT, file), "utf8"); } catch { continue; }
      if (/"passwordHash"\s*:\s*"\$2[aby]\$/.test(text)) secrets.push(`${file} (password hashes)`);
      if (/"(token|pat)"\s*:\s*"[^"]{8,}"/.test(text)) secrets.push(`${file} (an access token)`);
    }

    report(
      secrets.length ? "bad" : tracked.length ? "warn" : "ok",
      "Store files in git",
      secrets.length ? secrets.join(", ") : tracked.length ? `${tracked.length} tracked — demo data only` : "not tracked",
      secrets.length
        ? `Those are committed, so anyone with repository access has them — including in the history.
         Before real data goes in:
           1. git rm --cached DB_store/*.json
           2. echo 'DB_store/' >> .gitignore
           3. set DB_STORE_DIR to a path OUTSIDE the repository
           4. rotate anything that was committed — a hash in git is a hash somebody can attack offline`
        : null,
    );

    report(
      inRepo ? "warn" : "ok",
      "DB_STORE_DIR",
      inRepo ? "unset — the store is inside the repository" : dir,
      "For a real deployment set DB_STORE_DIR to a path outside the checkout, so a deploy cannot overwrite it and `git add .` cannot capture it.",
    );

    /* Password hashes and tokens deserve the protection an SSH key gets. */
    let loose = [];
    try {
      for (const f of readdirSync(dir)) {
        if (!f.endsWith(".json")) continue;
        const mode = statSync(join(dir, f)).mode & 0o077;
        if (mode !== 0) loose.push(f);
      }
    } catch {
      /* no store yet — the first write creates it correctly */
    }
    report(
      loose.length ? "warn" : "ok",
      "File permissions",
      loose.length ? `${loose.length} readable by other users on this machine` : "0600 — owner only",
      "New writes are 0600 and existing files are corrected on their next write. To fix them now:  chmod 600 DB_store/*.json",
    );
  }
}

section("DevOps board");
{
  /*
   * Its own file, loaded by `src/lib/devops/config.ts` rather than by Next,
   * which reads only `.env` and `.env.local`. Reported separately so "the
   * DevOps board is misconfigured" points at one file.
   */
  const devops = readNamedEnv(".env.devopsdashboard");
  const local = readNamedEnv(".env.devopsdashboard.local");
  const set = { ...(devops ?? {}), ...(local ?? {}), ...process.env };

  report(
    devops ? "ok" : "warn",
    ".env.devopsdashboard present",
    devops ? `${Object.keys(devops).length} values` : "missing — every setting falls back to its default",
    "It is committed; restore it with `git checkout .env.devopsdashboard`.",
  );

  const mode = (set.GITHUB_MODE ?? "").trim().toLowerCase() === "live" ? "live" : "dry-run";
  report("ok", `GITHUB_MODE = ${mode}`, mode === "live" ? "freezes really lock branches" : "nothing is sent to GitHub");

  /*
   * Not having a token is normal — a repository can carry its own — so this is
   * a note, not a failure. Only ever whether one is set, never its value.
   */
  const token = (set.GITHUB_TOKEN ?? "").trim();
  report(
    "ok",
    "GITHUB_TOKEN",
    token ? "set" : "not set — each repository needs its own, or syncing and freezing will refuse",
  );

  report("ok", `DEVOPS_ACCESS = ${(set.DEVOPS_ACCESS ?? "").trim().toLowerCase() || "members"}`, "");
  report("ok", `DB_DRIVER = ${(set.DB_DRIVER ?? "").trim().toLowerCase() || "json"}`, "shared with the POD board");

  if (local?.GITHUB_TOKEN) report("ok", "Local token override", "from .env.devopsdashboard.local");
}

/* --------------------------------------------------------------- verdict -- */

console.log("\n" + "─".repeat(64));
if (!problems.length) {
  console.log(`${C.ok}All ${count} checks passed. Run \`pnpm dev\`.${C.off}\n`);
  process.exit(0);
}

console.log(`${C.bad}${problems.length} of ${count} checks need attention.${C.off}\n`);
for (const [i, p] of problems.entries()) {
  console.log(`${C.b}${i + 1}. ${p.label}${C.off}`);
  console.log(`       ${p.fix.split("\n").join("\n")}\n`);
}
console.log(`${C.dim}Full guide: docs/restricted-environments.md${C.off}\n`);
process.exit(1);
