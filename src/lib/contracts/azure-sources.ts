/**
 * Which Azure DevOps queries a POD board is made of.
 *
 * **This is the other file to edit.** A POD listed here reads its items from
 * Azure on every request and nothing is stored; a POD that is not listed keeps
 * reading whatever was synced into the store. Adding a board, widening a SPOC
 * list, pointing a filter at a renamed field: all of it is a change to the table
 * at the bottom of this file, and no query-building code has to move.
 *
 * Credentials are **not** here, on purpose. The PAT is read from the POD in
 * Admin, or from `AZDO_PAT` — tokens stay where tokens live.
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

import type { WindowMode } from "./item-filters.ts";

/** One `field IN (values)` test. An empty `values` makes the clause match nothing. */
export type SourceClause = {
  /** Azure reference name, e.g. `Custom.PODName`. */
  field: string;
  values: readonly string[];
};

export type AzureSource = {
  id: string;
  /**
   * The PODs this source feeds, by id **or** name, compared case-insensitively.
   * Both are accepted because an id is a slug of a name somebody can rename.
   */
  pods: readonly string[];
  orgUrl: string;
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

/**
 * The AMC POD, which is two projects rather than one.
 *
 * `3in1 IT Requests` is matched on **either** the POD field or the IT SPOC,
 * because a request raised against the POD and a request assigned to its SPOC
 * are both the POD's work. `3in1_Agile_Projects` is matched on **both** the
 * delivery SPOC and the module, because that project carries every module and
 * the SPOC alone would pull in the others.
 */
export const AZURE_SOURCES: readonly AzureSource[] = [
  {
    id: "amc-it-requests",
    pods: ["amc-pod", "AMC POD"],
    orgUrl: "https://dev.azure.com/BFLDevOpsOrg",
    project: "3in1 IT Requests",
    workItemTypes: ["Bug", "Issue", "Task", "User Story"],
    any: [
      { field: "Custom.PODName", values: ["AMC POD"] },
      {
        field: "Custom.BFLITSpoc",
        values: ["Aravind I", "Aravind.i@bajajfinserv.in", "vikrant.tiwari2@bajajfinserv.in"],
      },
    ],
    fieldMap: { status: "Custom.BugStatus", environment: "Custom.BugEnvironment" },
  },
  {
    id: "amc-agile-projects",
    pods: ["amc-pod", "AMC POD"],
    orgUrl: "https://dev.azure.com/BFLDevOpsOrg",
    project: "3in1_Agile_Projects",
    workItemTypes: ["Bug", "Issue", "Task", "User Story"],
    all: [
      {
        field: "Custom.DeliverySPOC",
        values: ["Aravind.i@bajajfinserv.in", "vikrant.tiwari2@bajajfinserv.in"],
      },
      { field: "Custom.ModuleName", values: ["AMC"] },
    ],
    fieldMap: { status: "Custom.BugStatus", environment: "Custom.BugEnvironment" },
  },
];

/**
 * The sources a POD reads, or an empty list when it has none and should keep
 * reading the store.
 */
export function sourcesFor(team: { id: string; name: string }): AzureSource[] {
  const wanted = [team.id, team.name].map((v) => String(v ?? "").trim().toLowerCase()).filter(Boolean);
  if (!wanted.length) return [];
  return AZURE_SOURCES.filter((s) =>
    s.pods.some((p) => wanted.includes(String(p).trim().toLowerCase())),
  );
}

/** Whether any POD at all is configured to read live. */
export const hasLiveSources = AZURE_SOURCES.length > 0;
