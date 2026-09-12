/**
 * Remove seeded data, one board at a time.
 *
 *     pnpm delete pod-seed        work items, PODs and their sync watermarks
 *     pnpm delete devops-seed     repos, cycles, scope rows, PRs, announcements
 *     pnpm delete all             both
 *
 *     pnpm delete pod-seed --yes  skip the confirmation (for CI and scripts)
 *     pnpm delete pod-seed --dry-run   count what would go, delete nothing
 *
 * **Accounts are never touched.** Deleting the admin is how somebody locks
 * themselves out of an instance they are in the middle of setting up, and it is
 * not what "delete the seeded data" means to anybody.
 *
 * Goes through the same store the app does, so it works on whichever driver
 * `DB_DRIVER` selects — files under `DB_store/` by default, a real cluster with
 * `DB_DRIVER=mongodb`. Nothing here knows what a JSON file is.
 *
 * There is no undo. So: it counts first, prints what it found, and asks.
 */
import { createInterface } from "node:readline/promises";
import { loadEnv } from "./lib/env.mjs";

loadEnv();

const { getStore } = await import("../src/db/store/index.ts");

const C = process.stdout.isTTY
  ? { dim: "\x1b[2m", ok: "\x1b[32m", bad: "\x1b[31m", warn: "\x1b[33m", off: "\x1b[0m", b: "\x1b[1m" }
  : { dim: "", ok: "", bad: "", warn: "", off: "", b: "" };

/**
 * What each target covers.
 *
 * Split by board rather than by collection, because that is how somebody thinks
 * about it: "clear the DevOps demo" is one decision, not five.
 */
const TARGETS = {
  "pod-seed": {
    label: "POD board demo data",
    /* `sync` is in the list because a stale watermark makes the next sync think
       it has already imported everything, and the board comes back empty. */
    collections: ["items", "teams", "sync"],
  },
  "devops-seed": {
    label: "DevOps board data",
    collections: ["deployments", "pulls", "cycles", "repos", "announcements"],
  },
};

const argv = process.argv.slice(2);
const flags = new Set(argv.filter((a) => a.startsWith("--")));
const asked = argv.filter((a) => !a.startsWith("--"));

const dryRun = flags.has("--dry-run");
const assumeYes = flags.has("--yes") || flags.has("-y");

function usage(problem) {
  console.error(`\n${C.bad}${problem}${C.off}\n`);
  console.error(`  ${C.b}pnpm delete pod-seed${C.off}      ${C.dim}${TARGETS["pod-seed"].label}${C.off}`);
  console.error(`  ${C.b}pnpm delete devops-seed${C.off}   ${C.dim}${TARGETS["devops-seed"].label}${C.off}`);
  console.error(`  ${C.b}pnpm delete all${C.off}           ${C.dim}both${C.off}`);
  console.error(`\n  ${C.dim}--dry-run  count only     --yes  skip the confirmation${C.off}\n`);
  process.exit(1);
}

if (asked.length === 0) usage("Say what to delete.");

const names = asked.includes("all") ? Object.keys(TARGETS) : asked;
for (const name of names) if (!TARGETS[name]) usage(`"${name}" is not something this can delete.`);

const wanted = [...new Set(names.flatMap((n) => TARGETS[n].collections))];

const store = getStore();
await store.init();

/* ------------------------------------------------------------------ count */

/**
 * How many rows each collection holds.
 *
 * `items` and `sync` are not keyed collections, so they are counted their own
 * way — `items` has a `count()`, and a sync watermark exists per POD.
 */
async function countOf(name) {
  if (name === "items") return store.items.count();
  if (name === "sync") return (await store.teams.all()).length;
  return store[name].count();
}

const counts = [];
for (const name of wanted) {
  try {
    counts.push({ name, rows: await countOf(name) });
  } catch (err) {
    // A collection that cannot be read is reported, not fatal: the others can
    // still be cleared, and "everything failed" would hide which one broke.
    counts.push({ name, rows: 0, error: err instanceof Error ? err.message : String(err) });
  }
}

const total = counts.reduce((n, c) => n + c.rows, 0);

console.log(`\n${C.b}${dryRun ? "Would delete" : "About to delete"}${C.off} ${C.dim}${store.describe()}${C.off}\n`);
for (const { name, rows, error } of counts) {
  const detail = error ? `${C.bad}could not read: ${error}${C.off}` : `${rows} ${rows === 1 ? "row" : "rows"}`;
  console.log(`  ${name.padEnd(14)} ${detail}`);
}
console.log(`\n  ${C.dim}Accounts are never touched.${C.off}`);

if (total === 0) {
  console.log(`\n${C.ok}Nothing to delete.${C.off}\n`);
  await store.close();
  process.exit(0);
}

if (dryRun) {
  console.log(`\n${C.ok}Dry run — nothing was deleted.${C.off}\n`);
  await store.close();
  process.exit(0);
}

/* ---------------------------------------------------------------- confirm */

/*
 * Irreversible, and there is no undo anywhere in this app. On a terminal it
 * asks; anywhere else it refuses unless `--yes` was passed, because a script
 * that silently deletes when nobody is watching is the version of this that
 * ends badly.
 */
if (!assumeYes) {
  if (!process.stdin.isTTY) {
    console.error(`\n${C.bad}Refusing to delete without a terminal to ask.${C.off} Pass --yes if you mean it.\n`);
    await store.close();
    process.exit(1);
  }

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question(`\nDelete ${total} ${total === 1 ? "row" : "rows"}? This cannot be undone. [y/N] `);
  rl.close();

  if (!/^y(es)?$/i.test(answer.trim())) {
    console.log(`\n${C.warn}Left alone.${C.off}\n`);
    await store.close();
    process.exit(0);
  }
}

/* ----------------------------------------------------------------- delete */

/** Every row of a keyed collection, one at a time, so one bad row is not fatal. */
async function clearKeyed(collection) {
  let gone = 0;
  for (const row of await collection.all()) {
    await collection.remove(row.id);
    gone++;
  }
  return gone;
}

async function clear(name) {
  if (name === "items") {
    /*
     * By POD, which is the delete the store already has — and it is the one
     * that keeps the Mongo driver to a handful of queries rather than one per
     * work item.
     */
    let gone = 0;
    for (const team of await store.teams.all()) gone += await store.items.deleteByTeam(team.id);

    // Anything left belongs to a POD that is already gone. Read once and drop
    // by id, so an orphan cannot survive a clear and reappear on the next board.
    for (const item of await store.items.find({}, Date.now())) {
      await store.items.deleteById(item.id ?? item._id);
      gone++;
    }
    return gone;
  }

  if (name === "sync") {
    /*
     * The watermark is per POD and the store has no remove for it, so it is
     * reset rather than deleted: a blank `lastChangedDate` makes the next sync
     * a first run, which is exactly what a cleared board needs.
     */
    let reset = 0;
    for (const team of await store.teams.all()) {
      await store.sync.save(team.id, { teamId: team.id, lastChangedDate: "", lastRunAt: "", lastResult: "" });
      reset++;
    }
    return reset;
  }

  return clearKeyed(store[name]);
}

console.log("");
let failed = 0;

/*
 * `items` and `sync` both read PODs, so they have to run before `teams` empties
 * it. Ordering the work rather than the list keeps the target definitions
 * readable — they say what a board is, not what order to delete it in.
 */
const ORDER = ["items", "sync", "deployments", "pulls", "cycles", "announcements", "repos", "teams"];
const ordered = [...wanted].sort((a, b) => ORDER.indexOf(a) - ORDER.indexOf(b));

for (const name of ordered) {
  try {
    const gone = await clear(name);
    console.log(`  ${C.ok}cleared${C.off}  ${name.padEnd(14)} ${C.dim}${gone} ${gone === 1 ? "row" : "rows"}${C.off}`);
  } catch (err) {
    failed++;
    console.log(`  ${C.bad}failed ${C.off}  ${name.padEnd(14)} ${C.dim}${err instanceof Error ? err.message : err}${C.off}`);
  }
}

await store.close();

if (failed) {
  console.error(`\n${C.bad}${failed} collection${failed === 1 ? "" : "s"} could not be cleared.${C.off}\n`);
  process.exit(1);
}

console.log(`\n${C.ok}Done.${C.off} ${C.dim}\`pnpm seed\` puts the demo data back.${C.off}\n`);
