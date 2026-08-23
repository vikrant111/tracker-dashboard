"use client";

import { X } from "lucide-react";
import { ENVIRONMENTS, SEVERITIES, STATUSES } from "@/lib/types";

export type DrillFilters = {
  search: string;
  severity: string;
  status: string;
  environment: string;
  assignee: string;
  /** "" = any, "open" = still open, "closed" = done. */
  state: "" | "open" | "closed";
  sort: "oldest" | "newest" | "severity";
};

export const EMPTY_FILTERS: DrillFilters = {
  search: "",
  severity: "",
  status: "",
  environment: "",
  assignee: "",
  state: "",
  sort: "oldest",
};

export const activeFilterCount = (f: DrillFilters) =>
  (["search", "severity", "status", "environment", "assignee", "state"] as const).filter((k) => f[k]).length;

/** Turn the drawer's own filters into query params for /api/items. */
export function toQuery(f: DrillFilters): Record<string, string> {
  const q: Record<string, string> = { sort: f.sort };
  if (f.search.trim()) q.search = f.search.trim();
  if (f.severity) q.severity = f.severity;
  if (f.status) q.status = f.status;
  if (f.environment) q.environment = f.environment;
  if (f.assignee) q.assignee = f.assignee;
  if (f.state === "open") q.activeOnly = "true";
  if (f.state === "closed") q.closedOnly = "true";
  return q;
}

/**
 * A dimension already pinned by the drill itself (clicking "Critical" pins
 * severity) is shown as a locked chip rather than a select — letting it be
 * changed would contradict the panel the drawer was opened from.
 */
export function DrillFilterBar({
  filters,
  onChange,
  pinned,
  assignees,
}: {
  filters: DrillFilters;
  onChange: (next: DrillFilters) => void;
  pinned: Record<string, string>;
  assignees: string[];
}) {
  const set = (change: Partial<DrillFilters>) => onChange({ ...filters, ...change });
  const count = activeFilterCount(filters);

  const selects = [
    { key: "severity" as const, label: "Severity", options: [...SEVERITIES] },
    { key: "status" as const, label: "Status", options: [...STATUSES] },
    { key: "environment" as const, label: "Environment", options: [...ENVIRONMENTS] },
    { key: "assignee" as const, label: "Assignee", options: assignees },
  ];

  return (
    <div className="flex flex-col gap-2.5 border-b border-[var(--hairline)] px-6 py-3.5">
      <div className="flex items-center gap-2">
        <input
          value={filters.search}
          onChange={(e) => set({ search: e.target.value })}
          placeholder="Filter by title, id or assignee…"
          aria-label="Filter these items"
          className="!py-1.5 text-sm"
        />
        {count > 0 && (
          <button
            onClick={() => onChange({ ...EMPTY_FILTERS, sort: filters.sort })}
            className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-[var(--hairline)] bg-[var(--wash)] px-2.5 py-1.5 text-xs text-[var(--ink-2)] transition-colors hover:bg-[var(--wash-2)]"
          >
            <X size={12} />
            Clear {count}
          </button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {selects.map(({ key, label, options }) =>
          pinned[key] ? (
            <span
              key={key}
              title={`${label} is fixed by the panel you opened`}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--accent-line)] bg-[var(--accent-tint)] px-2.5 py-1 text-xs text-[var(--accent-ink)]"
            >
              {pinned[key]}
            </span>
          ) : (
            <select
              key={key}
              value={filters[key]}
              onChange={(e) => set({ [key]: e.target.value } as Partial<DrillFilters>)}
              aria-label={label}
              className={`!w-auto !py-1 text-xs ${filters[key] ? "!border-[var(--accent-line)] !bg-[var(--accent-tint)]" : ""}`}
            >
              <option value="">{label}: any</option>
              {options.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
          ),
        )}

        {/* agedOnly implies open, so it pins the state too — offering "closed only"
            alongside it would build a query that can only ever return nothing. */}
        {pinned.activeOnly || pinned.agedOnly ? (
          <span className="inline-flex items-center rounded-lg border border-[var(--accent-line)] bg-[var(--accent-tint)] px-2.5 py-1 text-xs text-[var(--accent-ink)]">
            {pinned.agedOnly ? "Aged and open" : "Open only"}
          </span>
        ) : (
          <select
            value={filters.state}
            onChange={(e) => set({ state: e.target.value as DrillFilters["state"] })}
            aria-label="Open or closed"
            className={`!w-auto !py-1 text-xs ${filters.state ? "!border-[var(--accent-line)] !bg-[var(--accent-tint)]" : ""}`}
          >
            <option value="">Open and closed</option>
            <option value="open">Open only</option>
            <option value="closed">Closed only</option>
          </select>
        )}

        <select
          value={filters.sort}
          onChange={(e) => set({ sort: e.target.value as DrillFilters["sort"] })}
          aria-label="Sort order"
          className="!ml-auto !w-auto !py-1 text-xs"
        >
          <option value="oldest">Oldest first</option>
          <option value="newest">Newest first</option>
          <option value="severity">Most severe first</option>
        </select>
      </div>
    </div>
  );
}
