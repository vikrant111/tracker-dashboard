/**
 * Keeps the knowledgebase honest about the code.
 *
 *   pnpm check:docs
 *
 * Docs rot silently — a stale hex or an undocumented module reads as fact and
 * misleads the next reader (human or Copilot) more than no docs would. This
 * checks the claims that are mechanically verifiable:
 *
 *  - every relative link resolves
 *  - every colour value quoted in the docs still exists in globals.css
 *  - every source module is mentioned somewhere
 *  - every package script is documented, and nothing still says npm
 *  - quoted check counts match what the suites actually run
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

let failures = 0;
let checks = 0;
function check(label, pass, detail = "") {
  checks++;
  if (!pass) {
    failures++;
    console.log(`  ✗ ${label}  ${detail}`);
  } else if (process.env.VERBOSE) {
    console.log(`  ✓ ${label}  ${detail}`);
  }
}
const section = (t) => console.log("\n" + t);

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === ".next" || name === ".git") continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

const all = walk(ROOT);
const docs = all.filter((f) => f.endsWith(".md") && !f.includes("node_modules"));
const docText = new Map(docs.map((f) => [f, readFileSync(f, "utf8")]));
const everyDoc = [...docText.values()].join("\n");
const css = readFileSync(join(ROOT, "src/app/globals.css"), "utf8");

section("links");
for (const [file, text] of docText) {
  for (const m of text.matchAll(/\]\(([^)]+)\)/g)) {
    const target = m[1].split("#")[0];
    if (!target || /^(https?:|mailto:)/.test(target)) continue;
    let ok = false;
    try {
      statSync(join(dirname(file), target));
      ok = true;
    } catch {
      /* missing */
    }
    check(`${relative(ROOT, file)} → ${target}`, ok);
  }
}

section("colour values quoted in docs still exist in globals.css");
// A hex in the docs should be a real token value, a documented ramp step, or a
// brand reference. Anything else is a value that moved and left the doc behind.
const RAMP = new Set(
  ["#d0e8ff", "#b2d9fe", "#93cafe", "#6bb7fd", "#38a4fd", "#1393ed", "#0f80d0", "#0c70b6",
   "#08609d", "#065085", "#04426f", "#02355b", "#012847", "#0071bb"].map((h) => h.toLowerCase()),
);
for (const [file, text] of docText) {
  for (const m of text.matchAll(/`(#[0-9a-fA-F]{6})`/g)) {
    const hex = m[1].toLowerCase();
    const known = css.toLowerCase().includes(hex) || RAMP.has(hex);
    check(`${relative(ROOT, file)} quotes ${hex}`, known, "not in globals.css or the brand ramp");
  }
}

section("every source module is mentioned somewhere");
const modules = all
  .filter((f) => /\/(src|scripts)\//.test(f) && /\.(ts|tsx|mjs)$/.test(f))
  .map((f) => f.split("/").pop().replace(/\.(ts|tsx|mjs)$/, ""));
for (const m of [...new Set(modules)]) {
  // `route` and `page` repeat across the app router; they are covered by prose.
  if (["route", "page", "next-env"].includes(m)) continue;
  check(`${m} is documented`, everyDoc.includes(m));
}

section("package scripts are documented, and this is a pnpm project");
const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));
for (const s of Object.keys(pkg.scripts)) {
  check(`pnpm ${s} is documented`, everyDoc.includes(`pnpm ${s}`));
}
check("packageManager is pinned", /^pnpm@/.test(pkg.packageManager ?? ""), pkg.packageManager);
// A stray 'npm run'/'npm install' in the docs sends someone to the wrong tool
// and produces a package-lock.json alongside the pnpm lockfile.
for (const [file, text] of docText) {
  const stray = text.match(/\bnpm (?:run|install|ci)\b/g);
  check(`${relative(ROOT, file)} says pnpm, not npm`, !stray, (stray || []).slice(0, 3).join(", "));
}

section("quoted check counts match the suites");
// Counting `check(` call sites is not possible without running them, so this
// only catches the numbers drifting apart between documents.
const e2e = [...everyDoc.matchAll(/(\d+)\s+end-to-end\s+checks/g)].map((m) => Number(m[1]));
const theme = [...everyDoc.matchAll(/(\d+)\s+(?:static|theme[- ]token|theme)\s+checks/g)].map((m) => Number(m[1]));
check("end-to-end check count is quoted consistently", new Set(e2e).size <= 1, e2e.join(", "));
check("theme check count is quoted consistently", new Set(theme).size <= 1, theme.join(", "));

section("the handover files point at things that exist");
/*
 * VS Code loads a file in .github/instructions/ only when the open file matches
 * its `applyTo` glob, and says nothing when one matches nothing at all. Every
 * glob here went stale the moment code moved into subdirectories: someone
 * editing `metrics/query.ts` or `normalize/vocabulary.ts` got no rules loaded,
 * silently. These assert against the filesystem so a future move is caught.
 */
const INSTRUCTIONS = join(ROOT, ".github/instructions");
const exists = (p) => {
  try {
    statSync(join(ROOT, p));
    return true;
  } catch {
    return false;
  }
};
/**
 * Split the list on commas that are **not** inside a brace group.
 *
 * A plain `.split(",")` tears `{session,api}` into `{session` and `api}` and
 * every pattern then fails to resolve — which is exactly how this check failed
 * the first time it ran.
 */
const splitPatterns = (applyTo) => {
  const out = [];
  let depth = 0;
  let current = "";
  for (const ch of applyTo) {
    if (ch === "{") depth++;
    else if (ch === "}") depth--;
    if (ch === "," && depth === 0) {
      out.push(current);
      current = "";
      continue;
    }
    current += ch;
  }
  return [...out, current].map((p) => p.trim()).filter(Boolean);
};

/** `src/lib/{a,b}.ts` → `src/lib/a.ts`, `src/lib/b.ts`. One level is all we use. */
const expandBraces = (pattern) => {
  const m = pattern.match(/^(.*)\{([^}]+)\}(.*)$/);
  if (!m) return [pattern];
  return m[2].split(",").map((part) => `${m[1]}${part.trim()}${m[3]}`);
};

for (const name of readdirSync(INSTRUCTIONS)) {
  const text = readFileSync(join(INSTRUCTIONS, name), "utf8");
  const applyTo = text.match(/^applyTo: "(.*)"$/m)?.[1];
  check(`${name} declares an applyTo glob`, Boolean(applyTo));
  if (!applyTo) continue;

  const patterns = splitPatterns(applyTo).flatMap(expandBraces);
  check(`${name}: applyTo parses into patterns`, patterns.length > 0);
  /*
   * A pattern with no wildcard is a literal file and must exist — that is what
   * catches a rename. One with a wildcard is checked as far as its fixed
   * prefix, so `src/lib/numbers/**` still fails once that directory is gone.
   */
  const dead = patterns.filter((p) => !exists(p.split("*")[0].replace(/\/$/, "")));
  check(`${name}: every path in applyTo exists`, dead.length === 0, dead.join(" "));
}

/*
 * The two entry files are the handover's front door. Whether their links
 * *resolve* is already covered by the "links" section above, which walks every
 * markdown file — but that check passes vacuously on a file with no links left,
 * which is what a gutted front door looks like. This is the part it cannot see.
 */
for (const entry of ["AGENTS.md", ".github/copilot-instructions.md"]) {
  const text = readFileSync(join(ROOT, entry), "utf8");
  const into = [...text.matchAll(/\]\((?:\.\.\/)?docs\/[^)]+\)/g)];
  check(`${entry} points into docs/`, into.length > 0, `${into.length} links`);
}

console.log("\n" + "─".repeat(60));
console.log(failures === 0 ? `All ${checks} doc checks passed.` : `${failures} of ${checks} doc checks FAILED.`);
process.exit(failures ? 1 : 0);
