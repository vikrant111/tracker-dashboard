"use client";

/**
 * The surfaces everything else sits on: a glass panel, its header, and the
 * placeholder shown when there is nothing to put in it.
 */
import { motion, useReducedMotion } from "framer-motion";
import type { ReactNode } from "react";

export function Panel({
  children,
  className = "",
  delay = 0,
  hover = false,
  /** Tints the panel's corner bloom. Chrome only — never a data encoding. */
  hue,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
  hover?: boolean;
  hue?: string;
}) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 26, scale: 0.985 }}
      whileInView={{ opacity: 1, y: 0, scale: 1 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ type: "spring", stiffness: 210, damping: 26, delay }}
      className={`glass sheen ${hover ? "glass-hover" : ""} relative overflow-hidden ${className}`}
    >
      {hue && (
        <span
          aria-hidden
          className="bloom -top-28 -right-24 h-80 w-80"
          style={{ "--hue": hue, "--bloom-delay": `${(delay * 4).toFixed(2)}s` } as React.CSSProperties}
        />
      )}
      {children}
    </motion.section>
  );
}

export function PanelHeader({
  eyebrow,
  title,
  action,
  icon,
  hue = "var(--accent)",
}: {
  eyebrow: string;
  title: string;
  action?: ReactNode;
  icon?: ReactNode;
  hue?: string;
}) {
  /*
   * Stacked until there is room for a row.
   *
   * It was a `flex-wrap` row with the title on `flex-1 min-w-0`, which lets the
   * title box shrink to nothing while its text — having no `overflow: hidden` —
   * keeps its own size and spills out. The buttons then painted straight over
   * the eyebrow and the heading. That does not read as a layout which ran out
   * of room; it reads as broken.
   *
   * Below `sm` the two are separate rows, so neither can take the other's
   * space. Above it they sit side by side as before.
   */
  return (
    <header className="mb-5 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between sm:gap-x-4">
      <div className="flex min-w-0 flex-1 items-start gap-3">
        {icon && (
          <span
            className="glow-sm mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl"
            style={{
              background: `color-mix(in srgb, ${hue} 18%, transparent)`,
              color: hue,
              "--hue": hue,
            } as React.CSSProperties}
          >
            {icon}
          </span>
        )}
        <div className="min-w-0">
          <p className="eyebrow" style={{ color: hue }}>
            {eyebrow}
          </p>
          {/* min-w-0 above plus wrapping here: without both, a long title in a
              flex row collapses to one word per line on a narrow screen. */}
          <h2 className="mt-1 font-[family-name:var(--font-display)] text-base leading-snug font-semibold tracking-tight text-pretty sm:text-lg">
            {title}
          </h2>
        </div>
      </div>
      {/*
        * The action wraps within itself rather than pushing the title over.
        * `min-w-0` so a long row of buttons wraps instead of overflowing the
        * panel, which is the same failure one step further along.
        */}
      {action && <div className="flex min-w-0 flex-wrap items-center gap-2 sm:justify-end">{action}</div>}
    </header>
  );
}

export function Empty({ title, hint }: { title: string; hint: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-1.5 px-6 py-14 text-center">
      <p className="font-[family-name:var(--font-display)] text-base font-semibold">{title}</p>
      <p className="max-w-sm text-sm text-[var(--ink-muted)]">{hint}</p>
    </div>
  );
}
