"use client";

import { motion } from "framer-motion";
import { Activity, AlertOctagon, Hourglass, Layers, Server, type LucideIcon } from "lucide-react";
import type { Dashboard } from "@/lib/metrics";
import { STATUS } from "@/lib/palette";
import { useDrill, type DrillQuery } from "./drill-drawer";
import { CountUp, Tooltip } from "./ui";

type Tile = {
  label: string;
  value: number;
  decimals?: number;
  unit?: string;
  note: string;
  query: DrillQuery;
  Icon: LucideIcon;
  /** Chrome accent for the tile — not a data encoding. */
  hue: string;
  /** Share of the tile's own bar, 0..1. Gives each number a shape, not just a digit. */
  fill: number;
  /** Overrides the drawer subtitle when the tile's number is not an item count. */
  drawerSubtitle?: string;
};

/**
 * The five headline numbers. Each is a button, because every one of them is a
 * question the reader immediately wants the item list for.
 */
export function StatRail({ data }: { data: Dashboard }) {
  const drill = useDrill();
  const t = data.totals;
  const pctActive = t.total ? t.active / t.total : 0;
  // This tile counts distinct environments, not items, so its drawer would
  // otherwise show 360 under a tile reading "5". Naming them keeps it honest.
  const envNames = data.environment.filter((b) => b.count > 0).map((b) => b.key);

  const tiles: Tile[] = [
    {
      label: "Total",
      value: t.total,
      note: "every bug, ticket and CR in scope",
      query: {},
      Icon: Layers,
      hue: "var(--series-1)",
      fill: 1,
    },
    {
      label: "Active",
      value: t.active,
      note: `${Math.round(pctActive * 100)}% of the board still open`,
      query: { activeOnly: "true" },
      Icon: Activity,
      hue: "var(--accent-2)",
      fill: pctActive,
    },
    {
      label: "Average ageing",
      value: t.avgAgeDays,
      decimals: 1,
      unit: "d",
      note: "mean days open, across active items",
      query: { activeOnly: "true" },
      Icon: Hourglass,
      hue: t.avgAgeDays >= data.thresholdDays * 2 ? STATUS.serious : STATUS.warning,
      fill: Math.min(1, t.avgAgeDays / (data.thresholdDays * 4)),
    },
    {
      label: "Critical aged",
      value: t.criticalAged,
      note: `critical and open past ${data.thresholdDays} days`,
      query: { severity: "Critical", agedOnly: "true" },
      Icon: AlertOctagon,
      hue: t.criticalAged > 0 ? STATUS.critical : STATUS.good,
      fill: Math.min(1, t.criticalAged / 10),
    },
    {
      label: "Environments",
      value: t.environments,
      note: envNames.join(" · ") || "no environments yet",
      query: {},
      Icon: Server,
      hue: "var(--series-3)",
      fill: Math.min(1, t.environments / 5),
      // Alone among the tiles, this number is a cardinality rather than an item
      // count, so the drawer is labelled to say what it is actually listing.
      drawerSubtitle: `all items across ${t.environments} environment${t.environments === 1 ? "" : "s"}`,
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
      {tiles.map((tile, i) => (
        /*
         * The note under the tile is already on screen; the tooltip adds what
         * clicking does. A number that opens a list should say so before it is
         * clicked, not after.
         */
        <Tooltip key={tile.label} label={`${tile.label}: ${tile.note}. Click to list them.`}>
        <motion.button
          initial={{ opacity: 0, y: 22, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ delay: 0.05 * i, type: "spring", stiffness: 260, damping: 24 }}
          whileHover={{ y: -5 }}
          whileTap={{ scale: 0.985 }}
          onClick={() => drill({ title: tile.label, subtitle: tile.drawerSubtitle ?? tile.note, query: tile.query })}
          className="glass glass-hover group relative overflow-hidden p-4 text-left sm:p-5"
        >
          {/* Tinted bloom in the corner, so each tile carries its own colour. */}
          <span
            aria-hidden
            className="bloom -top-20 -right-20 h-56 w-56"
            style={{ "--hue": tile.hue, "--bloom-delay": `${(i * 0.9).toFixed(2)}s` } as React.CSSProperties}
          />

          <span className="flex items-center justify-between">
            <span className="eyebrow">{tile.label}</span>
            <span
              className="glow-sm grid h-8 w-8 place-items-center rounded-xl transition-transform duration-300 group-hover:scale-110"
              style={{
                background: `color-mix(in srgb, ${tile.hue} 18%, transparent)`,
                color: tile.hue,
                "--hue": tile.hue,
              } as React.CSSProperties}
            >
              <tile.Icon size={14} strokeWidth={2.2} />
            </span>
          </span>

          <span className="mt-3 flex items-baseline gap-0.5">
            <CountUp
              value={tile.value}
              decimals={tile.decimals ?? 0}
              className="lit font-[family-name:var(--font-display)] text-[2.6rem] leading-none font-bold tracking-tight"
              style={{ "--hue": tile.hue } as React.CSSProperties}
            />
            {tile.unit && (
              <span
                className="font-[family-name:var(--font-display)] text-xl font-semibold"
                style={{ color: tile.hue, opacity: 0.65 }}
              >
                {tile.unit}
              </span>
            )}
          </span>

          {/* Gives the figure a shape as well as a value. */}
          <span aria-hidden className="mt-3 block h-1 w-full overflow-hidden rounded-full bg-[var(--wash-2)]">
            <motion.span
              className="glow-sm block h-full rounded-full"
              style={{ background: tile.hue, "--hue": tile.hue } as React.CSSProperties}
              initial={{ width: 0 }}
              animate={{ width: `${Math.max(4, tile.fill * 100)}%` }}
              transition={{ delay: 0.2 + i * 0.05, duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
            />
          </span>

          <span className="mt-2.5 block text-xs leading-snug text-[var(--ink-2)]">{tile.note}</span>

          <span
            className="mt-2 flex items-center gap-1 text-[11px] font-medium opacity-0 transition-opacity duration-200 group-hover:opacity-100"
            style={{ color: tile.hue }}
          >
            View items →
          </span>
        </motion.button>
        </Tooltip>
      ))}
    </div>
  );
}
