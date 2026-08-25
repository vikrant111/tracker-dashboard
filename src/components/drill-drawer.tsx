"use client";

import { AnimatePresence, motion } from "framer-motion";
import { ArrowUpRight, X } from "lucide-react";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import useSWR from "swr";
import { SEVERITY_COLOR, ageTint } from "@/lib/palette";
import { SWR_OPTIONS, fetcher } from "@/lib/swr";
import type { ListedItem } from "@/lib/metrics";
import { DrillFilterBar, EMPTY_FILTERS, activeFilterCount, toQuery, type DrillFilters } from "./drill-filters";
import { Empty } from "./ui";

export type DrillQuery = Record<string, string>;

type DrillRequest = { title: string; subtitle?: string; query: DrillQuery };
import { useDebounced } from "./use-debounced";

const DrillContext = createContext<(req: DrillRequest) => void>(() => {});

export const useDrill = () => useContext(DrillContext);

const PAGE = 200;

/**
 * One drawer serves every expandable surface: tiles, severity rows, status rows,
 * environments, leaderboard rows. They all describe themselves as a query, and
 * the drawer lets the reader narrow it further from there.
 */
export function DrillProvider({
  baseQuery,
  assignees = [],
  children,
}: {
  baseQuery: DrillQuery;
  assignees?: string[];
  children: ReactNode;
}) {
  const [request, setRequest] = useState<DrillRequest | null>(null);
  const [filters, setFilters] = useState<DrillFilters>(EMPTY_FILTERS);

  const open = useCallback((req: DrillRequest) => {
    // Each drill starts clean — carrying filters across would silently hide rows.
    setFilters(EMPTY_FILTERS);
    setRequest(req);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setRequest(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const debouncedSearch = useDebounced(filters.search);

  const url = useMemo(() => {
    if (!request) return null;
    const params = new URLSearchParams({
      ...baseQuery,
      ...request.query,
      ...toQuery({ ...filters, search: debouncedSearch }),
      limit: String(PAGE),
    });
    return `/api/items?${params}`;
  }, [request, baseQuery, filters, debouncedSearch]);

  // Same policy as the dashboard: an open drawer must not sit on pre-sync data
  // while the tile behind it has already moved on.
  const { data, isLoading } = useSWR<{ items?: ListedItem[]; total?: number; error?: string }>(
    url,
    fetcher,
    SWR_OPTIONS,
  );

  const items = data?.items ?? [];
  const total = data?.total ?? items.length;
  const narrowed = activeFilterCount(filters) > 0;

  return (
    <DrillContext.Provider value={open}>
      {children}
      <AnimatePresence>
        {request && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setRequest(null)}
              className="fixed inset-0 z-40 bg-[var(--scrim)] backdrop-blur-[3px]"
            />
            <motion.aside
              role="dialog"
              aria-label={request.title}
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", stiffness: 320, damping: 34 }}
              className="fixed top-0 right-0 z-50 flex h-full w-full max-w-[640px] flex-col border-l border-[var(--glass-border)] bg-[var(--panel)]/80 shadow-[var(--glass-shadow)] backdrop-blur-3xl backdrop-saturate-150"
            >
              <header className="flex items-start justify-between gap-4 px-6 pt-5 pb-4">
                <div>
                  <p className="eyebrow">Work items</p>
                  <h2 className="mt-1 font-[family-name:var(--font-display)] text-xl font-semibold tracking-tight">
                    {request.title}
                  </h2>
                  <p className="mt-1 text-sm text-[var(--ink-muted)]">
                    <CountLine isLoading={isLoading} shown={items.length} total={total} narrowed={narrowed} />
                    {request.subtitle ? ` · ${request.subtitle}` : ""}
                  </p>
                </div>
                <button
                  onClick={() => setRequest(null)}
                  aria-label="Close"
                  className="rounded-lg p-2 text-[var(--ink-muted)] transition-colors hover:bg-[var(--wash-2)] hover:text-[var(--ink)]"
                >
                  <X size={18} />
                </button>
              </header>

              <DrillFilterBar
                filters={filters}
                onChange={setFilters}
                pinned={request.query}
                assignees={assignees}
              />

              <div className="flex-1 overflow-y-auto px-3 py-3">
                {data?.error && <Empty title="Could not load items" hint={data.error} />}
                {!isLoading && !data?.error && items.length === 0 && (
                  <Empty
                    title="Nothing matches"
                    hint={
                      narrowed
                        ? "No work items match these filters. Clear one to widen the list."
                        : "No work items match this slice right now."
                    }
                  />
                )}
                <ul className="flex flex-col gap-1.5">
                  {items.map((item, i) => (
                    <motion.li
                      key={item.id}
                      initial={{ opacity: 0, x: 14 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: Math.min(i * 0.015, 0.3), duration: 0.28 }}
                    >
                      <a
                        href={item.url}
                        target="_blank"
                        rel="noreferrer"
                        className="group relative block overflow-hidden rounded-xl border border-transparent px-3 py-3 transition-all duration-200 hover:translate-x-0.5 hover:border-[var(--hairline)] hover:bg-[var(--wash)]"
                      >
                        <span
                          aria-hidden
                          className="glow-sm absolute top-2 bottom-2 left-0 w-[3px] rounded-full opacity-0 transition-opacity duration-200 group-hover:opacity-100"
                          style={{
                            background: SEVERITY_COLOR[item.severity],
                            "--hue": SEVERITY_COLOR[item.severity],
                          } as React.CSSProperties}
                        />
                        <div className="flex items-baseline gap-2.5">
                          <span className="font-[family-name:var(--font-mono)] text-xs text-[var(--ink-muted)] tnum">
                            #{item.workItemId}
                          </span>
                          <span className="flex-1 text-sm leading-snug text-[var(--ink)]">{item.title}</span>
                          <ArrowUpRight
                            size={14}
                            className="mt-0.5 shrink-0 text-[var(--ink-muted)] opacity-0 transition-opacity group-hover:opacity-100"
                          />
                        </div>
                        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[var(--ink-muted)]">
                          <span className="inline-flex items-center gap-1.5">
                            <span
                              aria-hidden
                              className="glow-sm inline-block h-2 w-2 rounded-full"
                              style={{
                                background: SEVERITY_COLOR[item.severity],
                                "--hue": SEVERITY_COLOR[item.severity],
                              } as React.CSSProperties}
                            />
                            {item.severity}
                          </span>
                          <span>{item.status}</span>
                          <span>{item.environment}</span>
                          <span>{item.assignee}</span>
                          <span
                            className="ml-auto font-[family-name:var(--font-mono)] tnum"
                            style={{ color: item.isActive ? ageTint(item.ageDays) : "var(--ink-muted)" }}
                          >
                            {item.ageDays}d {item.isActive ? "open" : "to close"}
                          </span>
                        </div>
                      </a>
                    </motion.li>
                  ))}
                </ul>

                {total > items.length && (
                  <p className="px-3 py-4 text-center text-xs text-[var(--ink-muted)]">
                    Showing the first {items.length} of {total} in this order. Filter to narrow it down.
                  </p>
                )}
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </DrillContext.Provider>
  );
}

function CountLine({
  isLoading,
  shown,
  total,
  narrowed,
}: {
  isLoading: boolean;
  shown: number;
  total: number;
  narrowed: boolean;
}) {
  if (isLoading && shown === 0) return <>Loading…</>;
  const noun = `item${total === 1 ? "" : "s"}`;
  if (shown < total) return <>{`${shown} of ${total} ${noun}`}</>;
  return <>{`${total} ${noun}${narrowed ? " after filtering" : ""}`}</>;
}
