"use client";

/**
 * The filter box, the pager and the row of controls above a table.
 *
 * One component so both sections behave and look identical, and one row rather
 * than a stack: a repo picker, a cycle picker and a filter each taking a full
 * width of their own pushed the table itself below the fold and read as three
 * unrelated things rather than one set of controls.
 */
import { ChevronLeft, ChevronRight, Search, X } from "lucide-react";
import type { ReactNode } from "react";
import type { Page } from "@/lib/devops/table";

/**
 * The controls above a table, on one line, wrapping only when it has to.
 *
 * The count sits at the end and stays put, so "3 of 21" does not move around as
 * somebody types.
 */
export function TableBar({ children, count }: { children: ReactNode; count?: ReactNode }) {
  return (
    <div className="mb-3 flex flex-wrap items-center gap-2">
      {children}
      {count !== undefined && (
        <span className="ml-auto whitespace-nowrap text-xs tabular-nums text-[var(--ink-muted)]">{count}</span>
      )}
    </div>
  );
}

/** A labelled select that takes only the room it needs. */
export function BarSelect({
  label,
  value,
  onChange,
  children,
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
  children: ReactNode;
}) {
  return (
    <select
      aria-label={label}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      /*
       * `w-auto` matters: the base rule sets `width: 100%` on every select, and
       * without this each one takes a line of its own.
       */
      className="w-auto max-w-[16rem] rounded-lg border border-[var(--hairline)] bg-[var(--panel)] py-1.5 pl-2.5 pr-8 text-sm"
    >
      {children}
    </select>
  );
}

export function TableFilter({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (next: string) => void;
  placeholder: string;
}) {
  return (
    <div className="relative w-full min-w-[13rem] flex-1 sm:w-auto sm:max-w-[22rem]">
      <Search
        size={14}
        aria-hidden
        className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--ink-muted)]"
      />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        /* `!` because the base rule sets its own padding on every input. */
        className="w-full rounded-lg border border-[var(--hairline)] bg-[var(--panel)] !py-1.5 !pl-8 !pr-7 text-sm"
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange("")}
          aria-label="Clear the filter"
          className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-md p-0.5 text-[var(--ink-muted)] transition-colors hover:text-[var(--ink)]"
        >
          <X size={13} />
        </button>
      )}
    </div>
  );
}

export function Pager<T>({ page, onPage }: { page: Page<T>; onPage: (next: number) => void }) {
  // One page of rows needs no pager; the count is already on the bar.
  if (page.pages <= 1) return null;

  const step = (by: number) => onPage(page.page + by);

  return (
    <div className="mt-3 flex items-center justify-between gap-3 border-t border-[var(--hairline)] pt-2.5">
      <span className="text-xs tabular-nums text-[var(--ink-muted)]">
        {page.from}–{page.to} of {page.total}
      </span>

      <span className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => step(-1)}
          disabled={page.page <= 1}
          aria-label="Previous page"
          className="rounded-md p-1 text-[var(--ink-muted)] transition-colors hover:text-[var(--ink)] disabled:opacity-35"
        >
          <ChevronLeft size={15} />
        </button>

        <span className="text-xs tabular-nums text-[var(--ink-muted)]">
          {page.page} / {page.pages}
        </span>

        <button
          type="button"
          onClick={() => step(1)}
          disabled={page.page >= page.pages}
          aria-label="Next page"
          className="rounded-md p-1 text-[var(--ink-muted)] transition-colors hover:text-[var(--ink)] disabled:opacity-35"
        >
          <ChevronRight size={15} />
        </button>
      </span>
    </div>
  );
}
