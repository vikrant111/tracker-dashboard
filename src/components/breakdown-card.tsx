"use client";

import { motion } from "framer-motion";
import { ChevronRight, type LucideIcon } from "lucide-react";
import type { Bucket } from "@/lib/metrics";
import { colorFor } from "@/lib/palette";
import { useDrill, type DrillQuery } from "./drill-drawer";
import { Empty, Panel, PanelHeader, Tooltip } from "./ui";

type Dimension = "severity" | "environment" | "status" | "ageing";

/** Ageing buckets are ranges over `createdDate`, so they drill by day window, not by a field value. */
const AGEING_QUERY: Record<string, DrillQuery> = {
  "0-3 days": { activeOnly: "true", maxAgeDays: "3" },
  "4-7 days": { activeOnly: "true", minAgeDays: "3", maxAgeDays: "7" },
  "8-14 days": { activeOnly: "true", minAgeDays: "7", maxAgeDays: "14" },
  "15-30 days": { activeOnly: "true", minAgeDays: "14", maxAgeDays: "30" },
  "30+ days": { activeOnly: "true", minAgeDays: "30" },
};

const ORDER: Record<Dimension, string[]> = {
  severity: ["Critical", "Major", "Minor", "Unknown"],
  environment: ["IT-UAT", "BIZ-UAT", "CUG", "Production", "Unknown"],
  status: ["Open", "Commented", "For QA Validation", "Not a Bug", "Closed", "Unknown"],
  ageing: ["0-3 days", "4-7 days", "8-14 days", "15-30 days", "30+ days"],
};

export function BreakdownCard({
  dimension,
  eyebrow,
  title,
  note,
  buckets,
  delay = 0,
  icon,
  hue = "var(--accent)",
}: {
  dimension: Dimension;
  eyebrow: string;
  title: string;
  note: string;
  buckets: Bucket[];
  delay?: number;
  icon?: LucideIcon;
  hue?: string;
}) {
  const drill = useDrill();

  // Keep a stable, meaningful order rather than letting counts reshuffle rows
  // between refreshes — colour follows the entity, so the row must too.
  const byKey = new Map(buckets.map((b) => [b.key, b.count]));
  const rows = ORDER[dimension]
    .map((key) => ({ key, count: byKey.get(key) ?? 0 }))
    .filter((r) => r.count > 0);
  const total = rows.reduce((n, r) => n + r.count, 0);
  const max = Math.max(1, ...rows.map((r) => r.count));

  const Icon = icon;

  return (
    <Panel className="flex flex-col p-4 sm:p-6" delay={delay} hover hue={hue}>
      <PanelHeader
        eyebrow={eyebrow}
        title={title}
        hue={hue}
        icon={Icon ? <Icon size={16} strokeWidth={2.2} /> : undefined}
        action={
          <span
            className="glow-sm rounded-lg px-2.5 py-1 font-[family-name:var(--font-mono)] text-sm font-semibold tnum"
            style={{
              background: `color-mix(in srgb, ${hue} 15%, transparent)`,
              color: hue,
              "--hue": hue,
            } as React.CSSProperties}
          >
            {total}
          </span>
        }
      />

      {rows.length === 0 ? (
        <Empty title="Nothing to show" hint={note} />
      ) : (
        <ul className="flex flex-col gap-0.5">
          {rows.map((row, i) => {
            const color = colorFor(dimension, row.key);
            const share = total ? Math.round((row.count / total) * 100) : 0;
            return (
              <li key={row.key}>
                {/*
                 * The bar shows a share; the tooltip says what the share is
                 * *of*, which the row alone never does. "31 of 244" is the
                 * sentence a reader is trying to assemble from the two numbers
                 * at the end of the row.
                 */}
                <Tooltip label={`${row.key} — ${row.count} of ${total} (${share}%). Click to list them.`}>
                <button
                  onClick={() =>
                    drill({
                      title: row.key,
                      subtitle: title,
                      query: dimension === "ageing" ? AGEING_QUERY[row.key] : { [dimension]: row.key },
                    })
                  }
                  className="group flex w-full items-center gap-3 rounded-xl px-2.5 py-2.5 text-left transition-all duration-200 hover:bg-[var(--wash)] hover:translate-x-0.5"
                >
                  <span
                    aria-hidden
                    className="glow-sm h-2.5 w-2.5 shrink-0 rounded-full transition-transform duration-200 group-hover:scale-125"
                    style={{ background: color, "--hue": color } as React.CSSProperties}
                  />
                  <span className="w-[7.5rem] shrink-0 truncate text-sm font-medium text-[var(--ink-2)] transition-colors group-hover:text-[var(--ink)]">
                    {row.key}
                  </span>

                  <span className="relative h-3 flex-1 overflow-hidden rounded-full bg-[var(--wash-2)]">
                    <motion.span
                      initial={{ width: 0 }}
                      whileInView={{ width: `${(row.count / max) * 100}%` }}
                      viewport={{ once: true }}
                      transition={{ type: "spring", stiffness: 90, damping: 18, delay: i * 0.07 }}
                      className="glow-sm block h-full rounded-full"
                      style={{
                        background: `linear-gradient(90deg, color-mix(in srgb, ${color} 72%, transparent), ${color})`,
                        "--hue": color,
                      } as React.CSSProperties}
                    />
                  </span>

                  <span className="w-9 shrink-0 text-right font-[family-name:var(--font-mono)] text-[11px] tnum text-[var(--ink-muted)]">
                    {share}%
                  </span>
                  <span
                    className="lit w-10 shrink-0 text-right font-[family-name:var(--font-mono)] text-sm font-semibold tnum"
                    style={{ "--hue": color } as React.CSSProperties}
                  >
                    {row.count}
                  </span>
                  <ChevronRight
                    size={14}
                    className="shrink-0 text-[var(--ink-muted)] transition-all duration-200 group-hover:translate-x-0.5 group-hover:text-[var(--ink-2)]"
                  />
                </button>
                </Tooltip>
              </li>
            );
          })}
        </ul>
      )}
      <p className="mt-auto border-t border-[var(--hairline)] pt-3 text-xs text-[var(--ink-muted)]">
        <span className="mt-4 block">{note}</span>
      </p>
    </Panel>
  );
}
