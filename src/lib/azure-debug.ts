/**
 * Seeing what Azure actually sends back.
 *
 *     AZDO_DEBUG=summary   counts, timings, and the shape of the fields
 *     AZDO_DEBUG=full      the above, plus one whole work item
 *
 * Off by default, and deliberately not a boolean: `summary` is safe to leave on
 * — it prints counts and field *names* — while `full` prints real titles and
 * real people's names, which is fine on a laptop and not fine in a shared log.
 *
 * **The PAT is never printed.** Not the header, not the URL, not on an error.
 * Everything here takes already-parsed responses rather than the request, so
 * there is nothing to leak; `redact()` is the belt to that pair of braces.
 */
import { AZDO_DEBUG_MODES, type AzdoDebugMode } from "./constants/azure-debug.ts";

export function debugMode(env: NodeJS.ProcessEnv = process.env): AzdoDebugMode {
  const raw = (env.AZDO_DEBUG ?? "").trim().toLowerCase();
  /* `1` and `true` are what people type; treat them as the safe level. */
  if (raw === "1" || raw === "true" || raw === "on") return "summary";
  return (AZDO_DEBUG_MODES as readonly string[]).includes(raw) ? (raw as AzdoDebugMode) : "off";
}

export const debugOn = (env?: NodeJS.ProcessEnv) => debugMode(env) !== "off";

/**
 * Anything that looks like a credential, removed.
 *
 * Nothing here is *given* a PAT, so this guards the case where somebody later
 * passes a URL or an error body through — a base64 Basic header, a `pat=` query
 * parameter, or Azure's own token fields.
 */
export function redact(text: string): string {
  return text
    .replace(/Basic\s+[A-Za-z0-9+/=]+/gi, "Basic ***")
    .replace(/(pat|token|password|secret)=([^&\s"']+)/gi, "$1=***")
    .replace(/"(access_token|password|pat)"\s*:\s*"[^"]*"/gi, '"$1":"***"');
}

const log = (line: string) => console.info(redact(`[azure] ${line}`));

/** One WIQL round trip: what was asked for, how much came back, how long it took. */
export function logWiql(input: { project: string; types: string[]; since: string; ids: number[]; ms: number }) {
  if (!debugOn()) return;
  log(
    `WIQL  project=${input.project}  types=[${input.types.join(", ")}]  since=${input.since}` +
      `  → ${input.ids.length} ids in ${Math.round(input.ms)}ms`,
  );
  if (input.ids.length) {
    const head = input.ids.slice(0, 8).join(", ");
    log(`      ids: ${head}${input.ids.length > 8 ? ` … (+${input.ids.length - 8} more)` : ""}`);
  }
}

/** One `workitemsbatch` chunk. Azure caps these at 200, so a big sync is several. */
export function logBatch(input: { chunk: number; chunks: number; requested: number; received: number; ms: number }) {
  if (!debugOn()) return;
  log(
    `batch ${input.chunk}/${input.chunks}  requested=${input.requested}  received=${input.received}` +
      `  in ${Math.round(input.ms)}ms`,
  );
}

/** A JSON value, described rather than printed. */
function typeOf(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return `array[${value.length}]`;
  return typeof value;
}

/**
 * The **shape** of what came back: every field, its type, and how often it is
 * actually populated across the batch.
 *
 * This is the part worth having before adding a filter. A field present on 8%
 * of items is not one to build a dimension on, and no amount of reading one
 * sample tells you that — which is exactly how `environment` turned out to be
 * missing from most boards and had to fall back to tags and the area path.
 */
export function logStructure(items: { id: number; fields: Record<string, unknown> }[]) {
  if (!debugOn() || !items.length) return;

  const seen = new Map<string, { count: number; types: Set<string>; sample: unknown }>();
  for (const item of items) {
    for (const [key, value] of Object.entries(item.fields ?? {})) {
      const entry = seen.get(key) ?? { count: 0, types: new Set<string>(), sample: value };
      entry.count++;
      entry.types.add(typeOf(value));
      seen.set(key, entry);
    }
  }

  const rows = [...seen.entries()].sort((a, b) => b[1].count - a[1].count || a[0].localeCompare(b[0]));
  const width = Math.min(52, Math.max(...rows.map(([k]) => k.length)));

  log(`structure of ${items.length} work item${items.length === 1 ? "" : "s"} — ${rows.length} distinct fields:`);
  for (const [key, { count, types }] of rows) {
    const pct = Math.round((count / items.length) * 100);
    console.info(
      redact(
        `[azure]   ${key.padEnd(width)}  ${[...types].join("|").padEnd(14)}  ${String(pct).padStart(3)}%  (${count}/${items.length})`,
      ),
    );
  }

  /*
   * A field on only some items is the interesting case: it is where a filter
   * silently covers half a board. Called out rather than left to be spotted in
   * a long list.
   */
  const partial = rows.filter(([, v]) => v.count < items.length);
  if (partial.length) {
    log(`${partial.length} field(s) are not on every item — a filter built on one of these will be partial.`);
  }
}

/**
 * One whole work item, values included. `AZDO_DEBUG=full` only.
 *
 * Separate level because this prints real titles and real names. Useful on a
 * laptop while wiring up a new field; not something to leave on in a deployment
 * whose logs somebody else can read.
 */
export function logSample(item: { id: number; fields: Record<string, unknown> } | undefined) {
  if (debugMode() !== "full" || !item) return;
  log(`sample work item ${item.id} (AZDO_DEBUG=full — real values follow):`);
  console.info(redact(JSON.stringify(item, null, 2)));
}
