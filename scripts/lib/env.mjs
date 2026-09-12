/**
 * Load the project's env files without `--env-file`.
 *
 * `node --env-file=.env.local` exits if the file is missing, which is unhelpful
 * in a script whose job is to work on a fresh clone — and it takes one file,
 * while this project has two: `.env.local` for the POD board and
 * `.env.devopsdashboard` for the DevOps one.
 *
 * Values already on the process always win. A file in the repository does not
 * get to override whoever started the command.
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(fileURLToPath(new URL("../../", import.meta.url)));

/**
 * **Most specific first.** Loading is first-wins — each file fills only what is
 * still unset — so this order is what makes the git-ignored `.local` an
 * override rather than a file that never has any effect. Nothing overrides a
 * variable already on the process.
 */
const FILES = [".env.devopsdashboard.local", ".env.local", ".env.devopsdashboard"];

/** `KEY=value`, with comments, blank lines, `export` and quotes handled. */
function parse(text) {
  const out = {};
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!m) continue;

    const raw = m[2].trim();
    const quoted = /^(['"])([\s\S]*)\1$/.exec(raw);
    out[m[1]] = quoted ? quoted[2] : raw.replace(/\s+#.*$/, "").trim();
  }
  return out;
}

/** Merge every env file that exists into `process.env`. Returns the names read. */
export function loadEnv(root = ROOT) {
  const read = [];

  for (const name of FILES) {
    const path = resolve(root, name);
    if (!existsSync(path)) continue;

    try {
      for (const [key, value] of Object.entries(parse(readFileSync(path, "utf8")))) {
        if (process.env[key] === undefined) process.env[key] = value;
      }
      read.push(name);
    } catch {
      /* Unreadable is the same as absent here: every setting has a default, and
         `pnpm check:env` is what tells somebody a file is broken. */
    }
  }
  return read;
}
