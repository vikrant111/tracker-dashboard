"use client";

/**
 * Clearing a period, to free space. Used by both boards.
 *
 * The most destructive control in the app, and there is no undo anywhere in it.
 * So: **it counts before it deletes**. Pick a period, see exactly how many rows
 * of each kind would go, choose which kinds, and only then confirm. The count
 * is a separate request to a separate handler — asking how much there is must
 * never be the thing that removes it.
 *
 * Each board passes its own `targets`, so neither can offer the other's data.
 */
import { AnimatePresence, motion } from "framer-motion";
import { Trash2, TriangleAlert } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { describePeriod } from "@/lib/devops/period";
import { DEVOPS_PURGE_TARGETS, type PurgeTarget } from "@/lib/devops/purge-targets";
import { Button, Panel, PanelHeader } from "@/components/ui";
import { PeriodPicker } from "./period-picker";
import { PurgeChips } from "./purge-chips";

export function PurgePanel({
  known,
  targets = DEVOPS_PURGE_TARGETS,
  scope,
  scopeControl,
  title = "Clear a period",
  flash,
  onDone,
}: {
  /** Dates that hold rows, so the calendar marks where the data is. */
  known: (string | undefined)[];
  /** What this screen may clear. */
  targets?: readonly PurgeTarget[];
  /** Narrows it to one repository or one POD. Absent means every row. */
  scope?: { repoId?: string; teamId?: string };
  /** A control for choosing that scope, shown beside the date picker. */
  scopeControl?: ReactNode;
  title?: string;
  flash: (text: string, tone?: "ok" | "bad") => void;
  onDone: () => void;
}) {
  const [period, setPeriod] = useState("");
  const [counts, setCounts] = useState<{ target: PurgeTarget; rows: number }[] | null>(null);
  const [chosen, setChosen] = useState<PurgeTarget[]>([...targets]);
  const [busy, setBusy] = useState(false);
  const [armed, setArmed] = useState(false);

  const total = (counts ?? []).filter((c) => chosen.includes(c.target)).reduce((n, c) => n + c.rows, 0);

  /*
   * A count belongs to the scope it was taken for. Changing the POD while a
   * count is on screen — worse, while the delete is armed — would show one
   * team's number above a button that removes another's. So the count is
   * dropped and the arming released the moment the scope moves.
   */
  const scopeKey = `${scope?.repoId ?? ""}|${scope?.teamId ?? ""}`;
  useEffect(() => {
    setCounts(null);
    setArmed(false);
  }, [scopeKey]);

  const look = async (next: string) => {
    setPeriod(next);
    setCounts(null);
    setArmed(false);
    if (!next) return;

    setBusy(true);
    try {
      const query = new URLSearchParams({ period: next });
      if (scope?.repoId) query.set("repoId", scope.repoId);
      if (scope?.teamId) query.set("teamId", scope.teamId);

      const res = await fetch(`/api/devops/purge?${query.toString()}`);
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Could not count that period.");
      /* Only what this screen owns; the route counts everything. */
      const counted = (body.counts ?? []) as { target: PurgeTarget; rows: number }[];
      setCounts(counted.filter((c) => targets.includes(c.target)));
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
        /* Intersected, so a stale selection cannot reach past this screen. */
        body: JSON.stringify({
          period,
          targets: chosen.filter((t) => targets.includes(t)),
          ...(scope?.repoId ? { repoId: scope.repoId } : {}),
          ...(scope?.teamId ? { teamId: scope.teamId } : {}),
        }),
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
        title={title}
        icon={<Trash2 size={16} strokeWidth={2.2} />}
        action={
          <span className="flex flex-wrap items-center gap-2">
            {scopeControl}
            <PeriodPicker value={period} onChange={look} known={known} label="Pick a period" />
          </span>
        }
      />

      {!period ? (
        <p className="text-xs text-[var(--ink-muted)]">
          Pick a year, a month, a day, or a <strong>from/to range</strong>. Nothing is removed
          until you see the count and confirm it.
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

            <PurgeChips
              counts={counts ?? []}
              chosen={chosen}
              onToggle={(target) => {
                setArmed(false);
                setChosen((c) => (c.includes(target) ? c.filter((t) => t !== target) : [...c, target]));
              }}
            />

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
