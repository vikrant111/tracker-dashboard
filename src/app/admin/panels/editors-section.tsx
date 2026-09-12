"use client";

/**
 * Who may correct a DevOps record after it is saved.
 *
 * Deliberately its own list rather than a role. An admin runs the instance; a
 * DevOps editor is trusted to fix a deploy date or a ticket number weeks later.
 * Plenty of people should be one and not the other, and folding them together
 * would mean handing out admin to get a date corrected.
 *
 * Admins are shown as always granted, so nobody wonders why the toggle is
 * missing for them.
 */
import { useState } from "react";
import useSWR from "swr";
import { Check, Plus, ShieldCheck } from "lucide-react";
import { SWR_OPTIONS, failureReason, fetcher } from "@/lib/swr";
import type { User } from "@/lib/types";
import { Empty, Panel, PanelHeader, Tooltip } from "@/components/ui";

export function EditorsSection({ flash }: { flash: (text: string, tone?: "ok" | "bad") => void }) {
  const { data, error, mutate } = useSWR<{ users?: User[]; error?: string }>("/api/users", fetcher, SWR_OPTIONS);
  const [busy, setBusy] = useState("");

  const failed = failureReason(error, data);
  const users = data?.users ?? [];

  const toggle = async (user: User, on: boolean) => {
    setBusy(user.email);
    try {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: user.email, devopsEditor: on }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Could not change that.");

      flash(on ? `${user.email} can now edit DevOps records.` : `${user.email} can no longer edit DevOps records.`);
      await mutate();
    } catch (err) {
      flash(err instanceof Error ? err.message : "Could not change that.", "bad");
    } finally {
      setBusy("");
    }
  };

  return (
    <Panel className="p-6">
      <PanelHeader
        eyebrow="DevOps"
        title="Who can edit records"
        icon={<ShieldCheck size={16} strokeWidth={2.2} />}
        action={
          <span className="text-xs text-[var(--ink-muted)]">
            Anyone can add a row. Only these people can change one afterwards.
          </span>
        }
      />

      {failed ? (
        <Empty title="Could not load the accounts" hint={failed} />
      ) : users.length === 0 ? (
        <Empty title="No accounts yet" hint="Add people in POD admin first." />
      ) : (
        <ul className="flex flex-wrap gap-2">
          {users.map((user) => {
            const admin = user.role === "admin";
            const on = admin || user.devopsEditor === true;
            return (
              <li key={user.email}>
                <Tooltip
                  label={
                    admin
                      ? "Admins can always edit records. There is nothing to grant."
                      : on
                        ? `Take away ${user.email}'s ability to change a saved record.`
                        : `Let ${user.email} change a record after it is saved.`
                  }
                >
                  <button
                    type="button"
                    aria-pressed={on}
                    disabled={admin || busy === user.email}
                    onClick={() => toggle(user, !on)}
                    className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs font-medium transition-colors disabled:opacity-60 ${
                      on
                        ? "border-[var(--accent-line)] bg-[var(--accent-tint)] text-[var(--accent-ink)]"
                        : "border-dashed border-[var(--hairline)] text-[var(--ink-muted)] hover:text-[var(--ink)]"
                    }`}
                  >
                    {on ? <Check size={11} aria-hidden /> : <Plus size={11} aria-hidden />}
                    {user.name || user.email}
                    {admin && <span className="text-[10px] uppercase tracking-wide">admin</span>}
                  </button>
                </Tooltip>
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}
