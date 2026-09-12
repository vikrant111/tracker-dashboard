"use client";

/**
 * Moving between the two boards.
 *
 * They answer different questions — the POD board is "how much is outstanding",
 * this one is "can I push right now" — so this is a switch between places, not
 * a filter. It reads as a segmented control for that reason, with the current
 * board pressed rather than merely highlighted.
 *
 * Who sees it is decided on the server (`canSeeDevOps`) and passed in. A member
 * who is not allowed on the DevOps board never receives the control, rather
 * than receiving one that answers 403.
 */
import Link from "next/link";
import { motion } from "framer-motion";
import { GitBranch, LayoutDashboard } from "lucide-react";
import { Tooltip } from "@/components/ui";

const BOARDS = [
  {
    href: "/",
    label: "PODs",
    Icon: LayoutDashboard,
    hint: "Ageing bugs, tickets and CRs across every POD",
  },
  {
    href: "/devops",
    label: "DevOps",
    Icon: GitBranch,
    hint: "Branch freezes, releases and deployment records",
  },
] as const;

export function BoardSwitch({ current }: { current: "/" | "/devops" }) {
  return (
    <div
      role="group"
      aria-label="Switch board"
      className="inline-flex items-center gap-0.5 rounded-xl border border-[var(--hairline)] bg-[var(--wash)] p-0.5"
    >
      {BOARDS.map(({ href, label, Icon, hint }) => {
        const on = href === current;
        return (
          <Tooltip key={href} label={hint}>
            <Link
              href={href}
              aria-current={on ? "page" : undefined}
              className={`relative inline-flex items-center gap-1.5 rounded-[10px] px-2.5 py-1.5 text-xs font-semibold transition-colors ${
                on ? "text-[var(--accent-ink)]" : "text-[var(--ink-muted)] hover:text-[var(--ink)]"
              }`}
            >
              {/*
               * One pill that slides between the two, rather than a background
               * appearing and disappearing. `layoutId` is what makes the move
               * continuous, and it is the same trick the kind filter uses.
               */}
              {on && (
                <motion.span
                  layoutId="board-switch-pill"
                  className="absolute inset-0 rounded-[10px] bg-[var(--panel)] shadow-sm"
                  transition={{ type: "spring", stiffness: 420, damping: 34 }}
                />
              )}
              <Icon size={13} aria-hidden className="relative" />
              <span className="relative">{label}</span>
            </Link>
          </Tooltip>
        );
      })}
    </div>
  );
}
