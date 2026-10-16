/**
 * Turning the label on an Azure work item into the reference name a query needs.
 *
 * The form says **POD Name**; WIQL wants `Custom.PODName`. Nobody can read the
 * second off the screen, and a wrong guess fails the whole query — so the
 * contract names fields the way the board does and this asks the project what
 * they are really called.
 *
 * That is the difference between "fill in four reference names you cannot see"
 * and "it works once a PAT is set", which is the whole point of letting the
 * environment be the only thing an operator edits.
 *
 * Answers are cached per project for the life of the process: the field list of
 * a project changes about once a year, and this would otherwise be an extra
 * round trip behind every board load.
 */
import { AzureError, type AzureCreds } from "../azure.ts";
import { AZURE } from "../constants.ts";

type Field = { name?: string; referenceName?: string };

/*
 * Stashed on `globalThis`, like the live cache and the store: Next re-evaluates
 * modules on hot reload, and a fresh module would mean re-asking Azure for the
 * field list on every edit.
 */
const KEY = Symbol.for("pod-tracker.azure-fields");
type Cached = Map<string, Promise<Map<string, string>>>;
const g = globalThis as typeof globalThis & { [KEY]?: Cached };
const cache: Cached = (g[KEY] ??= new Map());

/** The spelling two names are compared as: letters and digits only. */
const key = (v: string) => String(v ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "");

/**
 * Already a reference name?
 *
 * `Custom.PODName` and `System.Tags` have a dot and no spaces; `POD Name` has a
 * space and no dot. Anything that looks like a reference name is passed through
 * untouched, so a contract can still name one directly when a project has two
 * fields sharing a label.
 */
export const looksLikeReference = (field: string) =>
  /^[A-Za-z][\w]*(\.[\w]+)+$/.test(String(field ?? "").trim());

/** Every field this project has, by its squashed label **and** reference name. */
async function fieldsFor(creds: AzureCreds, fetchJson: Fetcher): Promise<Map<string, string>> {
  const cacheKey = `${creds.orgUrl}/${creds.project}`;
  const hit = cache.get(cacheKey);
  if (hit) return hit;

  const run = fetchJson(
    `${creds.orgUrl}/${encodeURIComponent(creds.project)}/_apis/wit/fields?api-version=${AZURE.apiVersion}`,
    creds.pat,
  )
    .then((res) => {
      const out = new Map<string, string>();
      for (const f of (res as { value?: Field[] })?.value ?? []) {
        const ref = String(f?.referenceName ?? "").trim();
        if (!ref) continue;
        /*
         * The reference name is registered too, so a contract may use either —
         * and `setIfAbsent` order matters: a label must never overwrite a real
         * reference name that happens to squash to the same thing.
         */
        if (f?.name) out.set(key(String(f.name)), ref);
        out.set(key(ref), ref);
      }
      return out;
    })
    .catch((err) => {
      /* A failure must not be cached, or one bad moment poisons the process. */
      cache.delete(cacheKey);
      throw err;
    });

  cache.set(cacheKey, run);
  return run;
}

/** What `fieldsFor` needs from the Azure client, so the resolver can be tested. */
type Fetcher = (url: string, pat: string) => Promise<unknown>;

/**
 * Resolve every field a source filters on, in one pass.
 *
 * Returns a map from whatever the contract wrote to the reference name to put
 * in the query. An unknown label throws, naming the closest things the project
 * does have — a filter on a field that does not exist would otherwise fail as
 * Azure's `TF51005`, which names the field but not the alternatives.
 */
export async function resolveFields(
  creds: AzureCreds,
  wanted: readonly string[],
  fetchJson: Fetcher,
): Promise<Map<string, string>> {
  const asked = [...new Set(wanted.map((f) => String(f ?? "").trim()).filter(Boolean))];
  const out = new Map<string, string>();

  const direct = asked.filter((f) => looksLikeReference(f));
  for (const f of direct) out.set(f, f);

  const byLabel = asked.filter((f) => !looksLikeReference(f));
  if (!byLabel.length) return out;

  const known = await fieldsFor(creds, fetchJson);
  const missing: string[] = [];
  for (const label of byLabel) {
    const ref = known.get(key(label));
    if (ref) out.set(label, ref);
    else missing.push(label);
  }

  if (missing.length) {
    const near = (label: string) => {
      const k = key(label);
      const hits = [...known.keys()].filter((n) => n.includes(k) || k.includes(n)).slice(0, 4);
      return hits.length ? ` — did you mean ${hits.map((n) => known.get(n)).join(", ")}?` : "";
    };
    throw new AzureError(
      `${creds.project} has no field called ${missing.map((m) => `"${m}"`).join(", ")}${near(missing[0])} ` +
        `Fix the field name in src/lib/contracts/azure-sources.ts, or run "pnpm azure:probe --fields <word>".`,
    );
  }
  return out;
}

/** For the checks, and for a project whose fields were renamed mid-session. */
export const forgetFields = () => cache.clear();
