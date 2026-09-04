/**
 * What is Azure actually sending us?
 *
 *     pnpm azure:probe                 counts, timings, field shape
 *     pnpm azure:probe --full          plus one whole work item, values included
 *     pnpm azure:probe --days 90       widen the window (default 30)
 *     pnpm azure:probe --team amc-pod  one POD (default: every connected one)
 *
 * Reads only. It never writes a document, never advances a watermark, and
 * never touches the dashboard's data — so it is safe to point at production
 * when you are trying to work out why a field is empty.
 *
 * The reason this exists rather than "turn on the debug env var and wait": a
 * sync only fetches what *changed* since its watermark, which on a settled
 * board is nothing at all. This asks for a fixed window regardless.
 */
import { connectToDatabase, disconnectFromDatabase } from "../src/db/connect.ts";
import { findAllTeams } from "../src/controllers/teams.controller.ts";
import { fetchWorkItems, isConnectable, queryChangedIds, resolveCreds } from "../src/lib/azure.ts";
import { redact } from "../src/lib/azure-debug.ts";
import { fromAzure } from "../src/lib/normalize.ts";

const args = process.argv.slice(2);
const flag = (name, fallback = null) => {
  const at = args.indexOf(`--${name}`);
  return at === -1 ? fallback : (args[at + 1] ?? true);
};
const DAYS = Number(flag("days", 30)) || 30;
const FULL = args.includes("--full");
const ONLY = flag("team", null);
const LIMIT = Number(flag("limit", 200)) || 200;

/*
 * The probe does its own printing rather than setting AZDO_DEBUG, so the two
 * cannot disagree about what "full" means. `redact` is still applied — it is
 * the one thing that must hold whatever this file does.
 */
const say = (line = "") => console.log(redact(String(line)));

const typeOf = (v) => (v === null ? "null" : Array.isArray(v) ? `array[${v.length}]` : typeof v);

async function probe(team) {
  const { orgUrl, project } = resolveCreds(team);
  say(`\n${"─".repeat(72)}`);
  say(`POD "${team.name}"  →  ${orgUrl}/${project}`);
  say(`  area path: ${team.azure.areaPath || "(none — the whole project)"}`);
  say(`  types:     ${(team.azure.workItemTypes ?? []).join(", ") || "(defaults)"}`);

  const since = new Date(Date.now() - DAYS * 86_400_000).toISOString();
  say(`\n  1. WIQL — ids changed in the last ${DAYS} days`);

  let ids = [];
  const t0 = performance.now();
  try {
    ids = await queryChangedIds(team, since);
  } catch (err) {
    say(`     failed: ${err.message}`);
    return;
  }
  say(`     ${ids.length} ids in ${Math.round(performance.now() - t0)}ms`);
  if (!ids.length) {
    say(`     Nothing changed in that window. Try --days 365.`);
    return;
  }

  const take = ids.slice(0, LIMIT);
  say(`\n  2. workitemsbatch — hydrating ${take.length}${ids.length > LIMIT ? ` of ${ids.length} (--limit)` : ""}`);
  const t1 = performance.now();
  const items = await fetchWorkItems(team, take);
  say(`     ${items.length} work items in ${Math.round(performance.now() - t1)}ms`);

  const bytes = Buffer.byteLength(JSON.stringify(items));
  say(`     ${(bytes / 1024).toFixed(1)} KB  (~${Math.round(bytes / Math.max(1, items.length))} bytes each)`);

  /* ---- the shape ----------------------------------------------------- */
  const seen = new Map();
  for (const item of items) {
    for (const [key, value] of Object.entries(item.fields ?? {})) {
      const e = seen.get(key) ?? { count: 0, types: new Set(), sample: value };
      e.count++;
      e.types.add(typeOf(value));
      if (e.sample === undefined || e.sample === null) e.sample = value;
      seen.set(key, e);
    }
  }
  const rows = [...seen.entries()].sort((a, b) => b[1].count - a[1].count || a[0].localeCompare(b[0]));
  const w = Math.min(48, Math.max(...rows.map(([k]) => k.length)));

  say(`\n  3. Field shape — ${rows.length} distinct fields across ${items.length} items`);
  say(`     ${"field".padEnd(w)}  ${"type".padEnd(12)}  fill   example`);
  for (const [key, { count, types, sample }] of rows) {
    const pct = `${Math.round((count / items.length) * 100)}%`.padStart(4);
    const example = String(
      sample && typeof sample === "object" ? (sample.displayName ?? JSON.stringify(sample)) : sample,
    ).replace(/\s+/g, " ").slice(0, 34);
    say(`     ${key.padEnd(w)}  ${[...types].join("|").padEnd(12)}  ${pct}   ${example}`);
  }

  /*
   * The fields that are not on everything. This is the number that decides
   * whether a field can carry a filter: `environment` turned out to be missing
   * from most boards, which is why it falls back to tags and the area path.
   */
  const partial = rows.filter(([, v]) => v.count < items.length);
  if (partial.length) {
    say(`\n     ${partial.length} field(s) are NOT on every item:`);
    for (const [key, v] of partial.slice(0, 12)) {
      say(`       ${key.padEnd(w)}  on ${v.count}/${items.length}`);
    }
    say(`     A filter built on one of these covers only the items that have it.`);
  }

  /* ---- what we make of it -------------------------------------------- */
  say(`\n  4. After normalize() — what the dashboard actually stores`);
  const mapped = items.map((wi) => fromAzure(wi, team));
  const tally = (pick) => {
    const t = new Map();
    for (const m of mapped) t.set(pick(m), (t.get(pick(m)) ?? 0) + 1);
    return [...t.entries()].sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k}:${n}`).join("  ");
  };
  say(`     severity     ${tally((m) => m.severity)}`);
  say(`     environment  ${tally((m) => m.environment)}`);
  say(`     status       ${tally((m) => m.status)}`);
  say(`     kind         ${tally((m) => m.kind)}`);
  const unknowns = mapped.filter((m) => m.severity === "Unknown").length;
  if (unknowns) {
    say(`\n     ${unknowns}/${mapped.length} came out with severity Unknown — add that board's`);
    say(`     wording to the POD's value map, or to src/lib/value-map.ts.`);
  }

  if (FULL) {
    say(`\n  5. One whole work item (--full: real values follow)`);
    say(JSON.stringify(items[0], null, 2));
    say(`\n     …and what it becomes:`);
    say(JSON.stringify(mapped[0], null, 2));
  } else {
    say(`\n     Run with --full to print one whole work item, before and after.`);
  }
}

async function main() {
  await connectToDatabase();
  const teams = (await findAllTeams()).filter((t) => (ONLY ? t.id === ONLY : true));
  const connected = teams.filter(isConnectable);

  if (!connected.length) {
    say("No POD has an Azure connection.");
    say("Set AZDO_ORG_URL / AZDO_PROJECT / AZDO_PAT, or configure a POD in Admin → Azure Boards.");
    return;
  }
  for (const team of connected) await probe(team);
  say(`\n${"─".repeat(72)}`);
  say("Read-only: nothing was imported, and no watermark moved.");
}

main()
  .then(() => disconnectFromDatabase())
  .catch(async (err) => {
    console.error(redact(err?.message ?? String(err)));
    await disconnectFromDatabase().catch(() => {});
    process.exit(1);
  });
