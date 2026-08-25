"use client";

/**
 * What goes inside a menu: a labelled group, and a row that either runs
 * something or navigates somewhere.
 */
import Link from "next/link";
import type { ReactNode } from "react";
import { useMenu } from "./menu-context";

/** A labelled group inside a menu. */
export function MenuSection({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1 py-1">
      <p className="eyebrow px-2.5 pt-1 pb-0.5">{label}</p>
      {children}
    </div>
  );
}

/**
 * One row of a menu.
 *
 * Renders as an anchor when given `href` so a download or a route change is a
 * real link — right-clickable, openable in a new tab, and streamed by the
 * browser rather than assembled in JavaScript.
 */
export function MenuItem({
  icon,
  label,
  hint,
  onClick,
  href,
  download,
  disabled,
  tone = "normal",
  busy = false,
}: {
  icon?: ReactNode;
  label: string;
  hint?: string;
  onClick?: () => void;
  href?: string;
  download?: boolean;
  disabled?: boolean;
  tone?: "normal" | "primary";
  busy?: boolean;
}) {
  const { close } = useMenu();

  const body = (
    <>
      <span
        aria-hidden
        className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg transition-colors ${
          tone === "primary"
            ? "bg-[var(--accent-tint)] text-[var(--accent-ink)]"
            : "bg-[var(--wash)] text-[var(--ink-2)] group-hover:bg-[var(--wash-2)]"
        }`}
      >
        {icon}
      </span>
      <span className="min-w-0 flex-1 text-left">
        <span className="block truncate text-sm font-medium text-[var(--ink)]">{busy ? `${label}…` : label}</span>
        {hint && <span className="block truncate text-[11px] text-[var(--ink-muted)]">{hint}</span>}
      </span>
    </>
  );

  const className =
    "group flex w-full items-center gap-2.5 rounded-xl px-2 py-1.5 text-left transition-colors hover:bg-[var(--wash)] focus-visible:bg-[var(--wash)] disabled:cursor-not-allowed disabled:opacity-45 aria-disabled:cursor-not-allowed aria-disabled:opacity-45";

  if (href && !disabled) {
    return (
      <a
        data-menuitem
        role="menuitem"
        href={href}
        download={download}
        onClick={close}
        className={className}
      >
        {body}
      </a>
    );
  }

  return (
    <button
      data-menuitem
      role="menuitem"
      type="button"
      disabled={disabled || busy}
      // An `href` item that is disabled falls through to here, so the reason it
      // cannot be used is still announced rather than the row simply vanishing.
      aria-disabled={disabled || undefined}
      onClick={() => {
        onClick?.();
        close();
      }}
      className={className}
    >
      {body}
    </button>
  );
}
