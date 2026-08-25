"use client";

/**
 * One person's open work, split by severity, with what they have closed behind.
 *
 * The segments sum to their open count — a useful invariant when checking a
 * change, and one the e2e suite asserts.
 */
import { motion } from "framer-motion";
import { SEVERITY_COLOR } from "@/lib/palette";
import type { AssigneeStat } from "@/lib/metrics";
import { Tooltip } from "./ui";

/** Stacked open-items bar. 2px surface gaps between segments keep the split readable without outlines. */
export function LoadBar({ person, max }: { person: AssigneeStat; max: number }) {
  const segments = person.severity.filter((s) => s.count > 0);
  const closed = person.total - person.active;

  return (
    <span className="mt-2 flex h-2.5 w-full items-stretch gap-[2px] overflow-hidden rounded-full">
      {segments.map((seg) => (
        <Tooltip key={seg.key} label={`${seg.count} open · ${seg.key} — ${person.name}`}>
        <motion.span
          initial={{ width: 0 }}
          animate={{ width: `${(seg.count / max) * 100}%` }}
          transition={{ type: "spring", stiffness: 90, damping: 18 }}
          className="glow-sm block rounded-[3px]"
          style={{
            background: SEVERITY_COLOR[seg.key] ?? "var(--ink-muted)",
            "--hue": SEVERITY_COLOR[seg.key] ?? "var(--ink-muted)",
          } as React.CSSProperties}
        />
        </Tooltip>
      ))}
      {closed > 0 && (
        <Tooltip label={`${closed} closed · ${person.name}`}>
          <motion.span
            initial={{ width: 0 }}
            animate={{ width: `${(closed / max) * 100}%` }}
            transition={{ duration: 0.7, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
            className="block rounded-[3px] bg-[var(--wash-2)]"
          />
        </Tooltip>
      )}
    </span>
  );
}

export function Legend() {
  return (
    <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-[var(--hairline)] pt-3">
      {["Critical", "Major", "Minor"].map((key) => (
        <span key={key} className="inline-flex items-center gap-1.5 text-[11px] text-[var(--ink-2)]">
          <span aria-hidden className="h-2 w-2 rounded-full" style={{ background: SEVERITY_COLOR[key] }} />
          {key}
        </span>
      ))}
      <span className="inline-flex items-center gap-1.5 text-[11px] text-[var(--ink-2)]">
        <span aria-hidden className="h-2 w-2 rounded-full bg-[var(--ink-muted)]" />
        Closed
      </span>
    </div>
  );
}
