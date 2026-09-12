/**
 * Everything the DevOps dashboard reads from the environment, in one place.
 *
 * **Server only.** It touches `node:fs`, so a client component importing it
 * would pull the filesystem into the browser bundle — the same build break this
 * project has already had with mongoose. Client code gets what it needs handed
 * down as props from a server component, exactly as `githubMode` already is.
 *
 * Two jobs:
 *
 *  1. **Load `.env.devopsdashboard`.** Next only reads `.env`, `.env.local` and
 *     friends, so this board's own file has to be loaded by somebody. Doing it
 *     here rather than in `next.config.ts` means it also works under
 *     `output: "standalone"`, where the config file is never executed.
 *  2. **Answer what is configured**, with every default coming from
 *     `constants.ts` so there is no second opinion about what "unset" means.
 *
 * Values already in `process.env` always win: a real deployment sets variables
 * on the process, and a committed file must never overwrite them.
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  DEVOPS_DEFAULTS,
  DEVOPS_ENV_FILE,
  DEVOPS_ENV_KEYS,
  DEVOPS_TABLE,
} from "./constants.ts";

/**
 * The files read, **most specific first**.
 *
 * `.local` is git-ignored and is where a developer puts a real token; the other
 * is committed and holds the shape and the safe defaults. Loading is
 * first-wins — each file fills only what is still unset — so the order is what
 * makes `.local` an override rather than a file that never has any effect.
 */
const ENV_FILES = [`${DEVOPS_ENV_FILE}.local`, DEVOPS_ENV_FILE] as const;

/**
 * A `KEY=value` file, parsed.
 *
 * Deliberately small: comments, blank lines, optional `export`, and quotes
 * stripped from the value. Anything more elaborate belongs in a real env file
 * loader, and this has to run before any dependency is guaranteed installed.
 */
function parseEnvFile(text: string): Record<string, string> {
  const out: Record<string, string> = {};

  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!match) continue;

    // A `#` only starts a comment when it is not inside quotes, which the
    // quote-stripping below would otherwise hide.
    const raw = match[2].trim();
    const quoted = /^(['"])([\s\S]*)\1$/.exec(raw);
    out[match[1]] = quoted ? quoted[2] : raw.replace(/\s+#.*$/, "").trim();
  }
  return out;
}

/* Loaded once per process. Re-reading on every request would stat two files
   per API call for a value that cannot change without a restart. */
let loaded = false;

/**
 * Merge `.env.devopsdashboard` into `process.env`, once.
 *
 * Never clobbers: a variable already set on the process was set by whoever
 * started it, and a file in the repository does not get to override an
 * operator. A missing file is not an error — every setting has a default.
 */
export function loadDevOpsEnv(cwd = process.cwd()): void {
  if (loaded) return;
  loaded = true;

  for (const name of ENV_FILES) {
    const path = resolve(cwd, name);
    if (!existsSync(path)) continue;

    try {
      for (const [key, value] of Object.entries(parseEnvFile(readFileSync(path, "utf8")))) {
        if (process.env[key] === undefined) process.env[key] = value;
      }
    } catch {
      /*
       * A file that cannot be read must not stop the server. Every value it
       * would have supplied has a default, so the board still comes up — and
       * `pnpm check:env` is the thing that tells somebody it is missing.
       */
    }
  }
}

/* Loading on import, so any server module that reads this board's settings has
   them, whatever order Next happens to evaluate modules in. */
loadDevOpsEnv();

/** The environment, with this board's file folded in. */
export const devopsEnv = (): NodeJS.ProcessEnv => {
  loadDevOpsEnv();
  return process.env;
};

/** A whole number inside a range, or the fallback. Never throws, never NaN. */
function clampedInt(value: unknown, fallback: number, min: number, max: number): number {
  const n = Number.parseInt(String(value ?? "").trim(), 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(Math.max(n, min), max);
}

/**
 * What this deployment is configured to do.
 *
 * Read through the individual helpers (`devOpsAccess`, `githubMode`,
 * `tokenFor`) where one already exists — this is the whole picture, for the
 * health endpoint, the admin screen and `pnpm check:env`.
 */
export function devopsConfig(env: NodeJS.ProcessEnv = devopsEnv()) {
  return {
    /** Which env file supplied the values, so an error can name it. */
    file: DEVOPS_ENV_FILE,
    access: (env[DEVOPS_ENV_KEYS.access] ?? "").trim().toLowerCase() || DEVOPS_DEFAULTS.access,
    githubMode: (env[DEVOPS_ENV_KEYS.githubMode] ?? "").trim().toLowerCase() || DEVOPS_DEFAULTS.githubMode,
    githubApi: (env[DEVOPS_ENV_KEYS.githubApi] ?? "").trim().replace(/\/+$/, "") || DEVOPS_DEFAULTS.githubApi,
    /** Whether a fallback token exists — never the token itself. */
    hasGithubToken: Boolean((env[DEVOPS_ENV_KEYS.githubToken] ?? "").trim()),
    syncPages: clampedInt(env[DEVOPS_ENV_KEYS.syncPages], DEVOPS_DEFAULTS.syncPages, 1, 20),
    pageSize: clampedInt(env[DEVOPS_ENV_KEYS.pageSize], DEVOPS_TABLE.pageSize, 1, DEVOPS_TABLE.maxPageSize),
    /** Shared with the POD board. Named here so one screen can show it. */
    dbDriver: (env[DEVOPS_ENV_KEYS.dbDriver] ?? "").trim().toLowerCase() || "json",
  };
}
