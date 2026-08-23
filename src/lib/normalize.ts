import {
  DEFAULT_VALUE_MAP,
  ENVIRONMENTS,
  SEVERITIES,
  STATUSES,
  TERMINAL_STATUSES,
  type Environment,
  type Item,
  type Kind,
  type Severity,
  type Status,
  type Team,
  type ValueMap,
} from "./types.ts";

const norm = (v: unknown) => String(v ?? "").trim().toLowerCase();

/**
 * Resolve a raw board value into our vocabulary: the team's own overrides win,
 * then the shipped defaults, then a substring pass so "3 - Medium (UI)" and
 * "Deployed to Prod" still land somewhere useful.
 */
function resolve<T extends string>(
  raw: unknown,
  overrides: Record<string, string> | undefined,
  defaults: Record<string, string>,
  allowed: readonly T[],
  fallback: T,
): T {
  const key = norm(raw);
  if (!key) return fallback;

  const table = { ...defaults, ...lowerKeys(overrides) };
  const exact = table[key];
  if (exact && allowed.includes(exact as T)) return exact as T;

  const direct = allowed.find((a) => norm(a) === key);
  if (direct) return direct;

  // Longest matching key first, so "not a bug" beats "bug" and "biz-uat" beats "uat".
  const partial = Object.keys(table)
    .sort((a, b) => b.length - a.length)
    .find((k) => key.includes(k));
  if (partial && allowed.includes(table[partial] as T)) return table[partial] as T;

  return fallback;
}

function lowerKeys(obj: Record<string, string> | undefined): Record<string, string> {
  if (!obj) return {};
  return Object.fromEntries(Object.entries(obj).map(([k, v]) => [norm(k), v]));
}

function kindOf(workItemType: string, tags: string[]): Kind {
  const t = norm(workItemType);
  if (t.includes("bug") || t.includes("defect")) return "bug";
  if (tags.some((tag) => norm(tag).includes("cr")) || t.includes("change request")) return "cr";
  return "ticket";
}

function parseTags(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.map(String).map((s) => s.trim()).filter(Boolean);
  return String(raw ?? "")
    .split(/[;,]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Environment is the field most boards do not have. Fall back to tags, then to
 * the area path, before giving up — those are where teams actually put it.
 */
function resolveEnvironment(
  fieldValue: unknown,
  tags: string[],
  areaPath: string,
  valueMap: ValueMap,
): Environment {
  const fromField = resolve(fieldValue, valueMap?.environment, DEFAULT_VALUE_MAP.environment, ENVIRONMENTS, "Unknown");
  if (fromField !== "Unknown") return fromField;

  for (const tag of tags) {
    const fromTag = resolve(tag, valueMap?.environment, DEFAULT_VALUE_MAP.environment, ENVIRONMENTS, "Unknown");
    if (fromTag !== "Unknown") return fromTag;
  }

  return resolve(areaPath, valueMap?.environment, DEFAULT_VALUE_MAP.environment, ENVIRONMENTS, "Unknown");
}

type AzureWorkItem = {
  id: number;
  fields: Record<string, unknown>;
  _links?: { html?: { href?: string } };
};

export function fromAzure(wi: AzureWorkItem, team: Team): Item {
  const f = wi.fields;
  const get = (ref: string) => (ref ? f[ref] : undefined);

  const assignedTo = f["System.AssignedTo"] as { displayName?: string; uniqueName?: string } | undefined;
  const tags = parseTags(f["System.Tags"]);
  const type = String(f["System.WorkItemType"] ?? "Bug");
  const state = String(f["System.State"] ?? "");
  const areaPath = String(f["System.AreaPath"] ?? "");

  const status = resolve(
    get(team.fieldMap.status) ?? state,
    team.valueMap?.status,
    DEFAULT_VALUE_MAP.status,
    STATUSES,
    "Unknown",
  );
  const severity = resolve(
    get(team.fieldMap.severity),
    team.valueMap?.severity,
    DEFAULT_VALUE_MAP.severity,
    SEVERITIES,
    "Unknown",
  );
  const environment = resolveEnvironment(get(team.fieldMap.environment), tags, areaPath, team.valueMap);

  // Only ClosedDate — ResolvedDate is set while an item is still waiting on QA,
  // and counting that as closed would overstate the closure trend.
  const closedDate = f["Microsoft.VSTS.Common.ClosedDate"] as string | undefined;
  const createdDate = String(f["System.CreatedDate"] ?? new Date().toISOString());

  return {
    id: `${team.id}:${wi.id}`,
    workItemId: String(wi.id),
    teamId: team.id,
    source: "azure",
    kind: kindOf(type, tags),
    type,
    title: String(f["System.Title"] ?? `Work item ${wi.id}`),
    url: wi._links?.html?.href || `${team.azure.orgUrl}/${team.azure.project}/_workitems/edit/${wi.id}`,
    assignee: assignedTo?.displayName || "Unassigned",
    assigneeEmail: assignedTo?.uniqueName || "",
    severity,
    environment,
    status,
    state,
    priority: f["Microsoft.VSTS.Common.Priority"] == null ? null : Number(f["Microsoft.VSTS.Common.Priority"]),
    tags,
    createdDate,
    changedDate: String(f["System.ChangedDate"] ?? createdDate),
    closedDate: closedDate ?? null,
    // A close date is decisive: it beats whatever the status text happens to say.
    isActive: !TERMINAL_STATUSES.includes(status) && !closedDate,
  };
}

/** Header aliases accepted by the Excel importer, lowercased and de-punctuated. */
const COLUMN_ALIASES: Record<string, string[]> = {
  workItemId: ["id", "work item id", "workitemid", "bug id", "ticket id", "key"],
  title: ["title", "summary", "subject", "name"],
  url: ["url", "link", "work item url", "browse url"],
  assignee: ["assignee", "assigned to", "owner", "developer"],
  assigneeEmail: ["assignee email", "email", "assigned to email"],
  severity: ["severity", "sev", "criticality"],
  environment: ["environment", "env", "raised in", "found in"],
  status: ["status", "state", "bug status"],
  type: ["type", "work item type", "issue type"],
  priority: ["priority", "prio"],
  tags: ["tags", "labels"],
  createdDate: ["created date", "created", "created on", "raised on", "reported date"],
  closedDate: ["closed date", "closed", "resolved date", "closed on"],
};

/**
 * The sheet the exporter writes, in order.
 *
 * Every header here is deliberately drawn from `COLUMN_ALIASES` above, so a
 * downloaded report can be re-uploaded with nothing lost or mis-mapped. That is
 * the whole contract of the download button: it is not a report *about* the
 * board, it is the board in the shape the importer already understands.
 *
 * A check asserts each of these round-trips through `mapHeaders` back to the
 * field it came from — so adding a column here without teaching the importer
 * about it fails the suite rather than silently exporting a column that would
 * be ignored on the way back in.
 */
export const EXPORT_COLUMNS: { field: string; header: string; width: number }[] = [
  { field: "workItemId", header: "Work Item ID", width: 14 },
  { field: "title", header: "Title", width: 60 },
  { field: "type", header: "Type", width: 14 },
  { field: "assignee", header: "Assignee", width: 22 },
  { field: "assigneeEmail", header: "Assignee Email", width: 28 },
  { field: "severity", header: "Severity", width: 12 },
  { field: "environment", header: "Environment", width: 14 },
  { field: "status", header: "Status", width: 18 },
  { field: "priority", header: "Priority", width: 10 },
  { field: "tags", header: "Tags", width: 24 },
  { field: "createdDate", header: "Created Date", width: 14 },
  { field: "closedDate", header: "Closed Date", width: 14 },
  { field: "url", header: "URL", width: 46 },
];

/** One row of the export, in `EXPORT_COLUMNS` order. */
export function toRow(item: Item): (string | number | Date | null)[] {
  const date = (iso: string | null | undefined) => {
    if (!iso) return null;
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? null : d;
  };
  const value: Record<string, string | number | Date | null> = {
    workItemId: item.workItemId,
    title: item.title,
    type: item.type,
    assignee: item.assignee,
    assigneeEmail: item.assigneeEmail,
    severity: item.severity,
    environment: item.environment,
    status: item.status,
    priority: item.priority ?? null,
    // Semicolons, because the parser splits on `;` or `,` and a comma inside a
    // CSV cell is the one separator that will not survive the round trip.
    tags: item.tags.join("; "),
    createdDate: date(item.createdDate),
    closedDate: date(item.closedDate),
    url: item.url,
  };
  return EXPORT_COLUMNS.map((c) => value[c.field] ?? null);
}

const canon = (h: string) => h.trim().toLowerCase().replace(/[_\-.]+/g, " ").replace(/\s+/g, " ");

/**
 * Which tab in the workbook actually holds the data.
 *
 * Taking the first sheet is wrong more often than it looks. People keep a
 * "Notes" or "Instructions" tab in front of the export, Numbers exports a
 * cover sheet, and a chart sheet parses as an empty one. Any of those made the
 * upload fail on a workbook whose data was sitting one tab over.
 *
 * The data sheet is the first one with a **Title column**, because that is the
 * one column the importer cannot do without — so "can I read this tab" and "is
 * this the tab" are the same question.
 */
export function pickDataSheet(
  sheets: { name: string; headers: string[] }[],
): { index: number; name: string; columns: Record<number, string> } | null {
  const all = Array.isArray(sheets) ? sheets : [];
  for (const [index, sheet] of all.entries()) {
    const columns = mapHeaders(Array.isArray(sheet?.headers) ? sheet.headers : []);
    if (Object.values(columns).includes("title")) {
      return { index, name: String(sheet?.name ?? `Sheet ${index + 1}`), columns };
    }
  }
  return null;
}

/** Map a sheet's header row onto our field names. Unknown columns are ignored. */
export function mapHeaders(headers: string[]): Record<number, string> {
  const out: Record<number, string> = {};
  headers.forEach((header, i) => {
    const h = canon(String(header ?? ""));
    if (!h) return;
    for (const [field, aliases] of Object.entries(COLUMN_ALIASES)) {
      if (aliases.includes(h)) {
        out[i] = field;
        return;
      }
    }
  });
  return out;
}

function parseDate(v: unknown): string | null {
  if (!v) return null;
  if (v instanceof Date) return v.toISOString();
  const d = new Date(String(v));
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export function fromRow(row: Record<string, unknown>, team: Team, rowIndex: number): Item | null {
  const title = String(row.title ?? "").trim();
  if (!title) return null;

  const workItemId = String(row.workItemId ?? `row-${rowIndex}`).trim();
  const tags = parseTags(row.tags);
  const type = String(row.type ?? "Bug");

  const status = resolve(row.status, team.valueMap?.status, DEFAULT_VALUE_MAP.status, STATUSES, "Unknown");
  const severity = resolve(row.severity, team.valueMap?.severity, DEFAULT_VALUE_MAP.severity, SEVERITIES, "Unknown");
  const environment = resolveEnvironment(row.environment, tags, "", team.valueMap);
  const createdDate = parseDate(row.createdDate) ?? new Date().toISOString();
  const closedDate = parseDate(row.closedDate);

  return {
    id: `${team.id}:xlsx:${workItemId}`,
    workItemId,
    teamId: team.id,
    source: "excel",
    kind: kindOf(type, tags),
    type,
    title,
    url: String(row.url ?? "") || `#${workItemId}`,
    assignee: String(row.assignee ?? "").trim() || "Unassigned",
    assigneeEmail: String(row.assigneeEmail ?? "").trim(),
    severity,
    environment,
    status,
    state: String(row.status ?? ""),
    priority: row.priority == null || row.priority === "" ? null : Number(row.priority),
    tags,
    createdDate,
    changedDate: new Date().toISOString(),
    closedDate,
    // A close date is decisive: it beats whatever the status text happens to say.
    isActive: !TERMINAL_STATUSES.includes(status) && !closedDate,
  };
}
