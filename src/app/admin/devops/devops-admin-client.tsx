"use client";

/**
 * The DevOps admin screen: repositories and their deployment cycles.
 *
 * Each section fetches for itself, so this file is layout and a toast and
 * nothing else.
 */
import Link from "next/link";
import { motion } from "framer-motion";
import { GitBranch, LayoutDashboard, Settings } from "lucide-react";
import { useState } from "react";
import useSWR from "swr";
import { SWR_OPTIONS, fetcher } from "@/lib/swr";
import { TIMING } from "@/lib/constants";
import type { Team } from "@/lib/types";
import { Button } from "@/components/ui";
import { ThemeToggle } from "@/components/theme-toggle";
import { ReposSection } from "@/app/admin/panels/repos-section";
import { CyclesSection } from "@/app/admin/panels/cycles-section";
import { EditorsSection } from "@/app/admin/panels/editors-section";
import { Toast } from "@/components/devops/toast";

export function DevOpsAdminClient() {
  const teamsReq = useSWR<{ teams: Team[] }>("/api/teams", fetcher, SWR_OPTIONS);
  const [toast, setToast] = useState<{ text: string; tone: "ok" | "bad" } | null>(null);

  const flash = (text: string, tone: "ok" | "bad" = "ok") => {
    setToast({ text, tone });
    setTimeout(() => setToast(null), TIMING.toastMs);
  };

  const teams = (teamsReq.data?.teams ?? []).map((t) => ({ id: t.id, name: t.name }));

  return (
    <div className="mx-auto max-w-[1400px] px-3 pb-24 sm:px-6">
      <motion.header
        initial={{ opacity: 0, y: -14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        className="glass sticky top-3 z-30 mb-4 flex flex-wrap items-center gap-2 px-3 py-2.5 shadow-[var(--glass-shadow)] sm:gap-3 sm:px-4 sm:py-3"
      >
        <span className="flex items-center gap-2.5">
          <span
            aria-hidden
            className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-[var(--accent)] to-[var(--accent-2)] text-[var(--mark-ink)] glow"
          >
            <GitBranch size={16} strokeWidth={2.4} />
          </span>
          <span className="font-[family-name:var(--font-display)] text-base font-semibold tracking-tight">
            DevOps admin
          </span>
        </span>

        <span className="ml-auto flex items-center gap-2">
          <Link href="/devops">
            <Button>
              <LayoutDashboard size={14} />
              The board
            </Button>
          </Link>
          <Link href="/admin">
            <Button>
              <Settings size={14} />
              POD admin
            </Button>
          </Link>
          <ThemeToggle />
        </span>
      </motion.header>

      <div className="flex flex-col gap-4">
        <ReposSection teams={teams} flash={flash} />
        <CyclesSection flash={flash} />
        <EditorsSection flash={flash} />
      </div>

      <Toast toast={toast} />
    </div>
  );
}
