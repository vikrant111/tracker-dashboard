/**
 * Which Azure DevOps queries a POD board is made of.
 *
 * **This is the other file to edit.** A POD listed here reads its items from
 * Azure on every request and nothing is stored; a POD that is not listed keeps
 * reading whatever was synced into the store. Adding a board, widening a SPOC
 * list, pointing a filter at a renamed field: all of it is a change to the table
 * at the bottom of this file, and no query-building code has to move.
 *
 * Neither the organisation nor the token is here, on purpose. Both live in the
 * environment — `AZDO_ORG_URL` and `AZDO_PAT` — so standing this up against a
 * real board is a change to `.env.local` and nothing else, and tokens stay
 * where tokens live. A POD may still carry its own PAT in Admin.
 *
 * ## Finding a field's reference name
 *
 * The filters below name Azure **reference names**, not the labels on the work
 * item form. A wrong one fails loudly — Azure answers WIQL with *"TF51005: The
 * query references a field that does not exist"* and names it — rather than
 * returning the wrong items, which is the failure that would be hard to notice.
 *
 * ```bash
 * pnpm azure:probe --fields spoc      # reference names matching "spoc"
 * pnpm azure:probe --days 365 --full  # every field one board actually sends
 * ```
 */

import { BFL_IT_SPOC, DELIVERY_SPOC, POD_NAME, POD_TAG } from "./filter-values.ts";
import type { WindowMode } from "./item-filters.ts";

/** One test against a field. An empty `values` is a half-filled contract and throws. */
export type SourceClause = {
  /**
   * The field, **named the way the work item form names it** — `POD Name`,
   * `BFL IT Spoc`, `Module Name`. The reference name a query needs is looked
   * up from the project itself, so nobody has to find `Custom.PODName` by
   * hand. A reference name still works if you would rather write one.
   */
  field: string;
  values: readonly string[];
  /**
   * How to compare.
   *
   * `equals` (the default) for a field holding one value. **`contains` for a
   * field holding several** — a real POD Name reads `AMC, Investment mall,
   * Learning Centre` and Tags read `AMC_POD; App; Production`, and equality
   * against either matches nothing while looking exactly like a POD with no
   * work.
   */
  op?: "equals" | "contains";
};

export type AzureSource = {
  id: string;
  /**
   * The field carrying the POD tags. `Tags` on both of these boards, and named
   * here rather than assumed because a board could record the POD elsewhere.
   */
  tagField?: string;
  /**
   * The organisation, when it is not the one in `AZDO_ORG_URL`.
   *
   * Normally left out: the organisation and the token are the two things that
   * differ between one deployment and the next, so they live in the
   * environment and this file stays about *which work*, not *which server*.
   */
  orgUrl?: string;
  project: string;
  /**
   * Matched **exactly** by WIQL. A project whose types are called `3IN1 TASK`
   * matches none of the usual defaults and syncs only its bugs, reporting
   * success — `pnpm azure:probe` lists what a project really calls them.
   */
  workItemTypes: readonly string[];
  /** Every clause must match. */
  all?: readonly SourceClause[];
  /** At least one clause must match. */
  any?: readonly SourceClause[];
  /** Restrict to a subtree. Blank is the whole project. */
  areaPath?: string;
  /**
   * What the window means for this project. Defaults to `LIVE.windowMode`.
   *
   * `touched` is what keeps an old **open** bug on the board: `created` asks
   * only for items raised inside the window, so a two-year-old bug nobody has
   * closed simply is not fetched — and that is the item an ageing board exists
   * to show. See `WINDOW_MODES` in `item-filters.ts`.
   */
  windowMode?: WindowMode;
  /** Only where this project's field names differ from the POD's own mapping. */
  fieldMap?: { severity?: string; environment?: string; status?: string };
};

/* ----------------------------------------------------------------- sources
 *
 * The wiring: which board, which work item types, and which of the arrays
 * above identify this POD's work on it.
 *
 * Each source matches on **any** of them, because each one on its own means
 * "this is the POD's". Requiring all three would drop the POD's own bugs — a
 * real AMC_POD bug on the Agile board has module `Banners` and a Delivery SPOC
 * from another team. Change `any` to `all` to tighten it.
 */
export const AZURE_SOURCES: readonly AzureSource[] = [
  {
    id: "amc-it-requests",
    project: "3in1 IT Requests",
    /*
     * This board's work items are `3IN1 IT REQUEST`, not `Bug`. The usual
     * defaults match none of them, and a query that matches none of them
     * succeeds — it just finds nothing. `pnpm azure:probe --fields "*"` and
     * the Test button both list what a project really calls its types.
     */
    workItemTypes: ["3IN1 IT REQUEST", "Bug", "Issue", "Task", "User Story"],
    any: [
      { field: "POD Name", values: POD_NAME, op: "contains" },
      { field: "BFL IT Spoc", values: BFL_IT_SPOC },
    ],
    /*
     * This board has no Bug Status field — its state is the built-in one, and
     * its Severity reads as a plain word (`Minor`) rather than `3 - Minor`.
     * Environment is not a field at all here: it is the tag and the first
     * segment of the title, which `normalize` already falls back through.
     */
    fieldMap: { severity: "Severity", status: "System.State" },
  },
  {
    id: "amc-agile-projects",
    project: "3in1_Agile_Projects",
    workItemTypes: ["Bug", "Issue", "Task", "User Story"],
    any: [{ field: "Delivery SPOC", values: DELIVERY_SPOC }],
    /*
     * This one does have Bug Status — `Resolved`, `Closed` and the rest — and
     * its Severity reads `2 – Major`, with an en dash. Both resolve through
     * `value-map.ts`.
     */
    fieldMap: { severity: "Severity", status: "Bug Status" },
  },
];

/** The spelling a POD name is matched as: letters and digits only. */
const squash = (v: string) => String(v ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "");

/** Does `key` name this POD — as the whole of its name or id, or a word within? */
function namesPod(key: string, team: { id: string; name: string }): boolean {
  if (!squash(key)) return false;
  if ([team.id, team.name].some((v) => squash(v) === squash(key))) return true;
  /*
   * A whole word within, so the key `AMC` finds the POD called `AMC POD` —
   * which is what somebody writing the map expects. Bounded on the original
   * text rather than the squashed form, or `AMC` would also find `AMCTrading`.
   */
  const safe = key.trim().toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const bounded = new RegExp(`(^|[^a-z0-9])${safe}($|[^a-z0-9])`);
  return [team.id, team.name].some((v) => bounded.test(String(v ?? "").toLowerCase()));
}

/**
 * The Azure tags that identify this POD's work, from `POD_TAG`.
 *
 * Empty when the POD is not in the map, which is how a POD goes on reading the
 * store instead. A POD matching two keys is refused rather than guessed at:
 * silently picking one would put another POD's work on this board.
 */
export function tagsFor(team: { id: string; name: string }): string[] {
  const hits = Object.keys(POD_TAG).filter((key) => namesPod(key, team));
  if (hits.length > 1) {
    throw new Error(
      `POD "${team.name}" matches more than one entry in POD_TAG (${hits.join(", ")}). ` +
        `Make the keys distinct in src/lib/contracts/filter-values.ts.`,
    );
  }
  if (!hits.length) return [];
  const value = POD_TAG[hits[0]];
  return (Array.isArray(value) ? value : [value]).map((v) => String(v ?? "").trim()).filter(Boolean);
}

/**
 * The sources this POD reads, each carrying that POD's own tags.
 *
 * The tag clause is built here rather than written into a source, because
 * which tags apply depends on which POD is being read — and that is what lets
 * one line in `POD_TAG` put a new POD on both boards with nothing else to wire
 * up. Empty when the POD is not in the map, and that POD reads the store.
 */
export function sourcesFor(team: { id: string; name: string }): AzureSource[] {
  const tags = tagsFor(team);
  if (!tags.length) return [];
  return AZURE_SOURCES.map((source) => ({
    ...source,
    any: [{ field: source.tagField ?? "Tags", values: tags, op: "contains" as const }, ...(source.any ?? [])],
  }));
}

/** Whether any POD at all is configured to read live. */
export const hasLiveSources = AZURE_SOURCES.length > 0 && Object.keys(POD_TAG).length > 0;
