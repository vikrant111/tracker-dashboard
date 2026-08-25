"use client";

/**
 * How the open work is spread across the ageing buckets, as one bar.
 *
 * Fills what was dead space at the bottom of the health card with the thing the
 * whole board is about, and every segment drills.
 */
import { motion } from "framer-motion";
import { AGEING_COLOR } from "@/lib/palette";
import type { Dashboard } from "@/lib/metrics";
import { useDrill } from "./drill-drawer";
import { Tooltip } from "./ui";

/**
 * How the open work is distributed across the ageing buckets, as one bar.
 * Fills what was dead space at the bottom of the card with the thing the whole
 * board is about, and every segment drills.
 */
export function AgeingSpine({ data }: { data: Dashboard }) {
  const drill = useDrill();
  const rows = data.ageing.filter((b) => b.count > 0);
  const total = rows.reduce((n, b) => n + b.count, 0);
  if (!total) return null;

  const QUERY: Record<string, Record<string, string>> = {
    "0-3 days": { activeOnly: "true", maxAgeDays: "3" },
    "4-7 days": { activeOnly: "true", minAgeDays: "3", maxAgeDays: "7" },
    "8-14 days": { activeOnly: "true", minAgeDays: "7", maxAgeDays: "14" },
    "15-30 days": { activeOnly: "true", minAgeDays: "14", maxAgeDays: "30" },
    "30+ days": { activeOnly: "true", minAgeDays: "30" },
  };

  return (
    <div className="mt-auto border-t border-[var(--hairline)] pt-4">
      <div className="mb-2.5 flex items-baseline justify-between">
        <p className="eyebrow">How long the open work has waited</p>
        <span className="font-[family-name:var(--font-mono)] text-[11px] tnum text-[var(--ink-muted)]">
          {total} open
        </span>
      </div>

      <div className="flex h-3 w-full items-stretch gap-[2px] overflow-hidden rounded-full">
        {rows.map((b, i) => (
          <Tooltip key={b.key} label={`${b.count} open item${b.count === 1 ? "" : "s"} aged ${b.key}. Click to list them.`}>
          <motion.button
            initial={{ flexGrow: 0, opacity: 0 }}
            animate={{ flexGrow: b.count, opacity: 1 }}
            transition={{ type: "spring", stiffness: 110, damping: 20, delay: 0.5 + i * 0.06 }}
            onClick={() => drill({ title: b.key, subtitle: "open items by age", query: QUERY[b.key] })}
            aria-label={`${b.key}, ${b.count} open items`}
            className="glow-sm block min-w-[6px] rounded-[3px] transition-transform duration-200 hover:scale-y-150"
            style={
              {
                background: AGEING_COLOR[b.key] ?? "var(--ink-muted)",
                "--hue": AGEING_COLOR[b.key] ?? "var(--ink-muted)",
              } as React.CSSProperties
            }
          />
          </Tooltip>
        ))}
      </div>

      <div className="mt-2.5 flex flex-wrap gap-x-3 gap-y-1">
        {rows.map((b) => (
          <button
            key={b.key}
            onClick={() => drill({ title: b.key, subtitle: "open items by age", query: QUERY[b.key] })}
            className="group inline-flex items-center gap-1.5 rounded-md px-1 py-0.5 text-[11px] transition-colors hover:bg-[var(--wash)]"
          >
            <span
              aria-hidden
              className="h-2 w-2 rounded-full"
              style={{ background: AGEING_COLOR[b.key] ?? "var(--ink-muted)" }}
            />
            <span className="text-[var(--ink-muted)] transition-colors group-hover:text-[var(--ink-2)]">{b.key}</span>
            <span className="font-[family-name:var(--font-mono)] font-semibold tnum text-[var(--ink-2)]">{b.count}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
