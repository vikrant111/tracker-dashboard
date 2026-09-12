"use client";

/**
 * Clearing a period, to free space.
 *
 * The most destructive control in the app, and there is no undo anywhere in it.
 * So: **it counts before it deletes**. Pick a period, see exactly how many rows
 * of each kind would go, choose which kinds, and only then confirm.
 *
 * The count is a separate request to a separate handler. Asking how much there
 * is must never be the thing that removes it.
 */
import { AnimatePresence, motion } from "framer-motion";
import { Trash2, TriangleAlert } from "lucide-react";
import { useState } from "react";
import { describePeriod } from "@/lib/devops/period";
import { PURGE_TARGETS, type PurgeTarget } from "@/lib/devops/purge-targets";
import { Button, Panel, PanelHeader, Tooltip } from "@/components/ui";
import { PeriodPicker } from "./period-picker";

const WHAT: Record<PurgeTarget, string> = {
  deployments: "Scope sheet rows",
  pulls: "Pull request records",
  announcements: "Announcements",
};

export function PurgePanel({
  known,
  flash,
  onDone,
}: {
  /** Dates that hold rows, so the calendar marks where the data is. */
  known: (string | undefined)[];
  flash: (text: string, tone?: "ok" | "bad") => void;
  onDone: () => void;
}) {
  const [period, setPeriod] = useState("");
  const [counts, setCounts] = useState<{ target: PurgeTarget; rows: number }[] | null>(null);
  const [chosen, setChosen] = useState<PurgeTarget[]>([...PURGE_TARGETS]);
  const [busy, setBusy] = useState(false);
  const [armed, setArmed] = useState(false);

  const total = (counts ?? []).filter((c) => chosen.includes(c.target)).reduce((n, c) => n + c.rows, 0);

  const look = async (next: string) => {
    setPeriod(next);
    setCounts(null);
    setArmed(false);
    if (!next) return;

    setBusy(true);
    try {
      const res = await fetch(`/api/devops/purge?period=${encodeURIComponent(next)}`);
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Could not count that period.");
      setCounts(body.counts ?? []);
    } catch (err) {
      flash(err instanceof Error ? err.message : "Could not count that period.", "bad");
    } finally {
      setBusy(false);
    }
  };

  const purge = async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/devops/purge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ period, targets: chosen }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Could not clear that period.");

      const removed = (body.removed ?? []).reduce((n: number, r: { rows: number }) => n + r.rows, 0);
      flash(`Cleared ${removed} row${removed === 1 ? "" : "s"} from ${body.describes}.`);
      setCounts(null);
      setArmed(false);
      onDone();
    } catch (err) {
      flash(err instanceof Error ? err.message : "Could not clear that period.", "bad");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Panel className="p-4 sm:p-6" delay={0.2}>
      <PanelHeader
        eyebrow="Housekeeping"
        title="Clear a period"
        icon={<Trash2 size={16} strokeWidth={2.2} />}
        action={<PeriodPicker value={period} onChange={look} known={known} label="Pick a period" />}
      />

      {!period ? (
        <p className="text-xs text-[var(--ink-muted)]">
          Pick a year, a month or a day. Nothing is removed until you see the count and confirm it.
        </p>
      ) : (
        <AnimatePresence mode="wait">
          <motion.div
            key={period}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="flex flex-col gap-3"
          >
            <p className="text-sm">
              <span className="text-[var(--ink-muted)]">In </span>
              <span className="font-medium">{describePeriod(period)}</span>
              {busy && <span className="text-[var(--ink-muted)]"> — counting…</span>}
            </p>

            <div className="flex flex-wrap gap-2">
              {(counts ?? []).map(({ target, rows }) => {
                const on = chosen.includes(target);
                return (
                  <Tooltip key={target} label={rows === 0 ? "Nothing here for this period." : `${rows} will be removed.`}>
                    <button
                      type="button"
                      aria-pressed={on}
                      disabled={rows === 0}
                      onClick={() => {
                        setArmed(false);
                        setChosen((c) => (on ? c.filter((t) => t !== target) : [...c, target]));
                      }}
                      className={`rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors disabled:opacity-40 ${
                        on && rows > 0
                          ? "border-[var(--accent-line)] bg-[var(--accent-tint)] text-[var(--accent-ink)]"
                          : "border-dashed border-[var(--hairline)] text-[var(--ink-muted)]"
                      }`}
                    >
                      {WHAT[target]} · {rows}
                    </button>
                  </Tooltip>
                );
              })}
            </div>

            {counts && total > 0 && (
              <span className="flex flex-wrap items-center gap-2">
                <Button
                  variant="primary"
                  disabled={busy}
                  onClick={() => (armed ? purge() : setArmed(true))}
                >
                  <TriangleAlert size={13} />
                  {armed ? `Yes — delete ${total} row${total === 1 ? "" : "s"}` : `Clear ${total} row${total === 1 ? "" : "s"}`}
                </Button>
                {armed && (
                  <>
                    <Button onClick={() => setArmed(false)}>Cancel</Button>
                    <span className="text-xs text-[var(--st-critical-ink)]">
                      This cannot be undone. There is no backup.
                    </span>
                  </>
                )}
              </span>
            )}

            {counts && total === 0 && (
              <p className="text-xs text-[var(--ink-muted)]">Nothing to clear in {describePeriod(period)}.</p>
            )}
          </motion.div>
        </AnimatePresence>
      )}
    </Panel>
  );
}
