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
import { kindOf, norm, parseTags, resolve, resolveEnvironment } from "./normalize/vocabulary.ts";
import { COLUMN_ALIASES, canon, parseDate } from "./normalize/columns.ts";

export { EXPORT_COLUMNS, mapHeaders, pickDataSheet, toRow } from "./normalize/columns.ts";

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
