/**
 * The spreadsheet's columns, in both directions.
 *
 * Export and import share one definition on purpose: a downloaded report has to
 * be re-uploadable with nothing lost, and a check asserts every exported header
 * maps back through `mapHeaders` to the field it came from.
 */
import type { Item } from "../types.ts";

/** Header aliases accepted by the Excel importer, lowercased and de-punctuated. */
export const COLUMN_ALIASES: Record<string, string[]> = {
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

export const canon = (h: string) => h.trim().toLowerCase().replace(/[_\-.]+/g, " ").replace(/\s+/g, " ");

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

export function parseDate(v: unknown): string | null {
  if (!v) return null;
  if (v instanceof Date) return v.toISOString();
  const d = new Date(String(v));
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}
