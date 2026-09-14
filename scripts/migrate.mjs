/**
 * Move every collection from one storage driver to the other.
 *
 *   pnpm migrate --to mongodb          json → MongoDB
 *   pnpm migrate --to json             MongoDB → files
 *   pnpm migrate --to mongodb --dry-run
 *   pnpm migrate --to mongodb --yes    skip the confirmation
 *
 * `DB_DRIVER` decides which store the **app** uses. Changing it does not move
 * anything, so without this the flag flip lands you on an empty database and
 * the old data is still sitting in the other one. This is the missing half.
 *
 * `--from` defaults to whichever driver is *not* the target, so the common case
 * is one flag. Both stores are opened at once — the drivers are independent
 * objects, which is what makes reading one and writing the other possible in a
 * single process.
 *
 * Everything is written through the **target store**, so it goes through the
 * same schema validation an ordinary save does. A row that will not validate is
 * reported rather than silently dropped: a migration that quietly loses rows is
 * worse than one that stops.
 */
import { createInterface } from "node:readline/promises";
import { loadEnv } from "./lib/env.mjs";

loadEnv();

const { createStore, DB_DRIVERS } = await import("../src/db/store/index.ts");

const C = process.stdout.isTTY
  ? { dim: "\x1b[2m", ok: "\x1b[32m", bad: "\x1b[31m", warn: "\x1b[33m", off: "\x1b[0m", b: "\x1b[1m" }
  : { dim: "", ok: "", bad: "", warn: "", off: "", b: "" };

const argv = process.argv.slice(2);
const flag = (name) => {
  const at = argv.indexOf(name);
  return at >= 0 ? argv[at + 1] : undefined;
};
const has = (name) => argv.includes(name);

const dryRun = has("--dry-run");
const assumeYes = has("--yes") || has("-y");
const overwrite = has("--overwrite");

const to = flag("--to");
const from = flag("--from") ?? (to === "json" ? "mongodb" : "json");

function usage(problem) {
  console.error(`\n${C.bad}${problem}${C.off}\n`);
  console.error(`  ${C.b}pnpm migrate --to mongodb${C.off}   ${C.dim}files → MongoDB${C.off}`);
  console.error(`  ${C.b}pnpm migrate --to json${C.off}      ${C.dim}MongoDB → files${C.off}`);
  console.error(`\n  ${C.dim}--from <driver>  override the source (defaults to the other one)`);
  console.error(`  --dry-run        count only     --yes  skip the question`);
  console.error(`  --overwrite      allow a target that already holds rows${C.off}\n`);
  process.exit(1);
}

if (!to) usage("Say where to migrate to: --to mongodb, or --to json.");
for (const [label, d] of [["--to", to], ["--from", from]]) {
  if (!DB_DRIVERS.includes(d)) usage(`${label} "${d}" is not a driver. Use one of: ${DB_DRIVERS.join(", ")}.`);
}
/* Reading and writing the same store would be a long way to do nothing, and
   `memory` as a target throws the data away at exit. */
if (from === to) usage(`--from and --to are both "${to}". There is nothing to move.`);
if (to === "memory") usage("`memory` lives only as long as the process. There is nothing to migrate into it.");

const source = createStore(from);
const target = createStore(to);
await source.init();
await target.init();

/* ------------------------------------------------------------------ read -- */

/** Everything, read from the source. `sync` is keyed by POD, not a collection. */
async function readAll(store) {
  const teams = await store.teams.all();
  const sync = [];
  for (const team of teams) {
    const state = await store.sync.byId(team.id);
    if (state) sync.push([team.id, state]);
  }

  return {
    items: await store.items.find({}, Date.now()),
    teams,
    users: await store.users.all(),
    repos: await store.repos.all(),
    announcements: await store.announcements.all(),
    deployments: await store.deployments.all(),
    cycles: await store.cycles.all(),
    pulls: await store.pulls.all(),
    sync,
  };
}

const data = await readAll(source);
const counts = Object.fromEntries(Object.entries(data).map(([k, v]) => [k, v.length]));
const total = Object.values(counts).reduce((n, c) => n + c, 0);

/* What is already sitting in the target, so nothing is merged by surprise. */
const existing = await readAll(target);
const existingTotal = Object.values(existing).reduce((n, v) => n + v.length, 0);

console.log(`\n${C.b}${dryRun ? "Would migrate" : "Migrating"}${C.off}  ${C.dim}${from} → ${to}${C.off}`);
console.log(`  ${C.dim}from  ${source.describe()}${C.off}`);
console.log(`  ${C.dim}to    ${target.describe()}${C.off}\n`);
for (const [name, n] of Object.entries(counts)) {
  console.log(`  ${String(n).padStart(6)}  ${name}${existing[name].length ? `  ${C.dim}(target already has ${existing[name].length})${C.off}` : ""}`);
}

if (total === 0) {
  console.log(`\n${C.warn}The source is empty.${C.off} Nothing to move.\n`);
  await source.close();
  await target.close();
  process.exit(0);
}

/*
 * A target that already holds rows is refused by default. Writing into it is an
 * upsert by id, so it *merges* — which is occasionally what somebody wants and
 * never what they expect.
 */
if (existingTotal > 0 && !overwrite && !dryRun) {
  console.error(
    `\n${C.bad}The target already holds ${existingTotal} rows.${C.off}\n\n` +
      `  Writing is an upsert by id, so this would **merge** the two rather than\n` +
      `  replace one — and a half-merged store is very hard to reason about later.\n\n` +
      `  Clear the target first, or pass --overwrite if merging is what you meant.\n`,
  );
  await source.close();
  await target.close();
  process.exit(1);
}

if (dryRun) {
  console.log(`\n${C.ok}Dry run — nothing was written.${C.off}\n`);
  await source.close();
  await target.close();
  process.exit(0);
}

/* --------------------------------------------------------------- confirm -- */

if (!assumeYes) {
  if (!process.stdin.isTTY) {
    console.error(`\n${C.bad}Refusing to migrate without a terminal to ask.${C.off} Pass --yes if you mean it.\n`);
    await source.close();
    await target.close();
    process.exit(1);
  }
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question(`\nMove ${total} rows from ${from} to ${to}? [y/N] `);
  rl.close();
  if (!/^y(es)?$/i.test(answer.trim())) {
    console.log(`\n${C.warn}Left alone.${C.off}\n`);
    await source.close();
    await target.close();
    process.exit(0);
  }
}

/* ----------------------------------------------------------------- write -- */

console.log("");
let failed = 0;

/** Write rows one at a time, so one bad row names itself instead of stopping the lot. */
async function copy(name, rows, save) {
  let done = 0;
  for (const row of rows) {
    try {
      await save(row);
      done++;
    } catch (err) {
      failed++;
      console.log(`  ${C.bad}skipped${C.off} ${name} ${C.dim}${row?.id ?? "?"} — ${err instanceof Error ? err.message : err}${C.off}`);
    }
  }
  console.log(`  ${C.ok}copied ${C.off} ${name.padEnd(14)} ${C.dim}${done} of ${rows.length}${C.off}`);
}

/*
 * PODs first, then everything that refers to them — and work items last, since
 * they are the bulk. Order is not enforced by the store, but a store that is
 * coherent at every point during the copy is one you can interrupt.
 */
await copy("teams", data.teams, (r) => target.teams.save(r));
await copy("users", data.users, (r) => target.users.save(r));
await copy("repos", data.repos, (r) => target.repos.save(r));
await copy("cycles", data.cycles, (r) => target.cycles.save(r));
await copy("deployments", data.deployments, (r) => target.deployments.save(r));
await copy("pulls", data.pulls, (r) => target.pulls.save(r));
await copy("announcements", data.announcements, (r) => target.announcements.save(r));
await copy("sync", data.sync, ([teamId, state]) => target.sync.save(teamId, state));

/* `items` has its own bulk path — one round trip per batch rather than per row. */
if (data.items.length) {
  const bad = await target.items.bulkUpsert(data.items);
  failed += bad;
  console.log(`  ${C.ok}copied ${C.off} ${"items".padEnd(14)} ${C.dim}${data.items.length - bad} of ${data.items.length}${C.off}`);
}

/* Indexes, so a fresh MongoDB is not left scanning every collection. */
await target.ensureIndexes(true);

await source.close();
await target.close();

if (failed) {
  console.error(`\n${C.bad}${failed} rows did not migrate.${C.off} The source is untouched — fix them and run it again.\n`);
  process.exit(1);
}

console.log(
  `\n${C.ok}Done.${C.off} ${C.dim}Now set DB_DRIVER=${to} and restart.${C.off}\n` +
    `  ${C.dim}The source store is left exactly as it was, so you can switch back.${C.off}\n`,
);
