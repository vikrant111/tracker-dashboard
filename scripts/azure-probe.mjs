/**
 * What is Azure actually sending us?
 *
 *     pnpm azure:probe                 counts, timings, field shape
 *     pnpm azure:probe --full          plus one whole work item, values included
 *     pnpm azure:probe --days 90       widen the window (default 30)
 *     pnpm azure:probe --team amc-pod  one POD (default: every connected one)
 *     pnpm azure:probe --fields spoc   reference names matching "spoc", then stop
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
import { credsFor, fetchWorkItems, isConnectable, queryChangedIds, resolveCreds } from "../src/lib/azure.ts";
import { sourcesFor } from "../src/lib/contracts/azure-sources.ts";
import { ALLOWED, LIVE, allows } from "../src/lib/contracts/item-filters.ts";
import { buildSourceWiql } from "../src/lib/live/wiql.ts";
import { satisfiesSource, valuesOf } from "../src/lib/live/verify.ts";
import { queryIds, fetchByIds } from "../src/lib/azure.ts";
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
const FIELDS = flag("fields", null);

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

/**
 * Reference names, searched.
 *
 * The one thing you cannot guess and cannot see on the work item form. The
 * filters in `src/lib/contracts/azure-sources.ts` name these exactly, and a
 * wrong one fails the whole query — so this exists to be run before writing
 * one, not after it breaks.
 */
async function fields(team, needle) {
  const projects = sourcesFor(team).map((x) => x.project);
  if (!projects.length) projects.push(resolveCreds(team).project);
  const term = String(needle).toLowerCase();

  for (const project of projects) {
    const c = credsFor(team, { project });
    const res = await fetch(`${c.orgUrl}/${encodeURIComponent(project)}/_apis/wit/fields?api-version=7.1`, {
      headers: { Authorization: `Basic ${Buffer.from(`:${c.pat}`).toString("base64")}` },
    });
    if (!res.ok) {
      say(`\n${project}: could not list fields (${res.status})`);
      continue;
    }
    const all = (await res.json()).value ?? [];
    const hits = all.filter(
      (f) => `${f.name} ${f.referenceName}`.toLowerCase().includes(term) || term === "*",
    );
    say(`\n${project} — ${hits.length} of ${all.length} fields match "${needle}"`);
    const w = Math.max(10, ...hits.map((f) => String(f.name).length));
    for (const f of hits.sort((a, b) => a.referenceName.localeCompare(b.referenceName))) {
      say(`   ${String(f.name).padEnd(w)}  ${f.referenceName}`);
    }
  }
}

/**
 * What a **live** POD's dashboard will actually contain.
 *
 * The one question the contract cannot answer on its own: the field names are
 * a guess until a real org confirms them, and the allowlists only matter once
 * you can see how many items they drop. Printed per source, because a POD made
 * of two projects can have one of them silently matching nothing.
 */
async function probeLive(team) {
  const since = new Date(Date.now() - LIVE.windowDays * 86_400_000).toISOString();

  for (const source of sourcesFor(team)) {
    say(`\n${"─".repeat(72)}`);
    say(`POD "${team.name}"  →  ${source.orgUrl}/${source.project}   [live source ${source.id}]`);
    const query = buildSourceWiql(source, since);
    say(`\n  WIQL (last ${LIVE.windowDays} days, mode "${source.windowMode ?? LIVE.windowMode}")\n   ${query}`);

    const c = credsFor(team, { orgUrl: source.orgUrl, project: source.project });
    let ids = [];
    try {
      ids = await queryIds(c, query);
    } catch (err) {
      say(`\n  failed: ${err.message}`);
      say(`  If that names a field, fix it in src/lib/contracts/azure-sources.ts`);
      say(`  — "pnpm azure:probe --fields <word>" lists the real reference names.`);
      continue;
    }
    say(`\n  ${ids.length} ids`);
    if (!ids.length) continue;

    const take = ids.slice(0, LIMIT);
    const items = await fetchByIds(c, take);

    /*
     * Did Azure return anything the contract did not actually ask for? The
     * query carries the filters, but Azure matches an identity field
     * generously, so this is where a mismatch becomes visible rather than
     * being taken on trust.
     */
    const offFilter = items.filter((wi) => !satisfiesSource(wi.fields ?? {}, source));
    say(`\n  Filter check (src/lib/contracts/azure-sources.ts, verifyFilters=${LIVE.verifyFilters})`);
    say(`     ${items.length - offFilter.length} carry a filter value, ${offFilter.length} do not`);
    for (const wi of offFilter.slice(0, 8)) {
      const held = [...(source.all ?? []), ...(source.any ?? [])]
        .map((cl) => `${cl.field}=${JSON.stringify(valuesOf(wi.fields?.[cl.field]))}`)
        .join("  ");
      say(`       #${wi.id}  ${held}`);
    }
    if (offFilter.length > 8) say(`       … and ${offFilter.length - 8} more`);
    if (offFilter.length) say(`     Those are dropped before they reach the board.`);

    const view = {
      ...team,
      azure: { ...team.azure, orgUrl: source.orgUrl, project: source.project, areaPath: source.areaPath ?? "", workItemTypes: [...source.workItemTypes] },
      fieldMap: { ...team.fieldMap, ...(source.fieldMap ?? {}) },
    };
    const mapped = items.filter((wi) => satisfiesSource(wi.fields ?? {}, source)).map((wi) => fromAzure(wi, view));
    const tally = (pick) => {
      const t = new Map();
      for (const m of mapped) t.set(pick(m), (t.get(pick(m)) ?? 0) + 1);
      return [...t.entries()].sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k}:${n}`).join("  ");
    };
    say(`\n  After normalize() — ${mapped.length} of ${ids.length} hydrated`);
    say(`     severity     ${tally((m) => m.severity)}`);
    say(`     environment  ${tally((m) => m.environment)}`);
    say(`     status       ${tally((m) => m.status)}`);

    /*
     * What the allowlists drop. A big number here is not a bug — it is the
     * filter doing its job — but it is the number to look at when the board
     * seems empty, and the only place it is visible.
     */
    const dropped = mapped.filter(
      (m) => !(allows("severity", m.severity) && allows("environment", m.environment) && allows("status", m.status)),
    );
    say(`\n  Allowlists (src/lib/contracts/item-filters.ts, dropOutside=${ALLOWED.dropOutside})`);
    say(`     ${mapped.length - dropped.length} kept, ${dropped.length} dropped`);
    if (!ALLOWED.dropOutside && !dropped.length) {
      say(`     Nothing is dropped for its wording while dropOutside is off —`);
      say(`     every value that maps gets its own section on the board.`);
    }
    for (const m of dropped.slice(0, 8)) {
      const why = [
        allows("severity", m.severity) ? null : `severity=${m.severity}`,
        allows("environment", m.environment) ? null : `environment=${m.environment}`,
        allows("status", m.status) ? null : `status=${m.status}`,
      ].filter(Boolean);
      say(`       #${m.workItemId}  ${why.join("  ")}`);
    }
    if (dropped.length > 8) say(`       … and ${dropped.length - 8} more`);
  }
}

async function main() {
  await connectToDatabase();
  const teams = (await findAllTeams()).filter((t) => (ONLY ? t.id === ONLY : true));
  /* A live POD may carry no project of its own — its projects are in the contract. */
  const connected = teams.filter((t) => isConnectable(t) || (resolveCreds(t).pat && sourcesFor(t).length));

  if (FIELDS) {
    for (const team of connected) await fields(team, FIELDS);
    return;
  }

  if (!connected.length) {
    say("No POD has an Azure connection.");
    say("Set AZDO_ORG_URL / AZDO_PROJECT / AZDO_PAT, or configure a POD in Admin → Azure Boards.");
    return;
  }
  for (const team of connected) {
    /* A live POD's items never come from its own project, so probing that would
       describe a board nobody sees. Probe what the contract actually asks for. */
    if (sourcesFor(team).length) await probeLive(team);
    else await probe(team);
  }
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
