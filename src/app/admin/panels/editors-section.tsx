"use client";

/**
 * Who has been granted one capability, one account at a time.
 *
 * Deliberately a list rather than a role. An admin runs the instance; a DevOps
 * editor is trusted to fix a deploy date weeks later; somebody who may clear a
 * quarter of data is a third thing again. Plenty of people should be one and
 * not the others, and folding them together would mean handing out admin to get
 * a date corrected — or handing out a delete to get the same.
 *
 * One component, rendered once per capability, so both lists behave identically
 * and neither can grow its own idea of what granting looks like.
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

/** The account fields this can grant. Both are booleans stored per account. */
export type Grantable = "devopsEditor" | "canClearData";

export function EditorsSection({
  flash,
  field = "devopsEditor",
  eyebrow = "DevOps",
  title = "Who can edit records",
  hint = "Anyone can add a row. Only these people can change one afterwards.",
  granted = "can now edit DevOps records",
  revoked = "can no longer edit DevOps records",
  explain = {
    admin: "Admins can always edit records. There is nothing to grant.",
    on: (who: string) => `Take away ${who}'s ability to change a saved record.`,
    off: (who: string) => `Let ${who} change a record after it is saved.`,
  },
}: {
  flash: (text: string, tone?: "ok" | "bad") => void;
  field?: Grantable;
  eyebrow?: string;
  title?: string;
  hint?: string;
  granted?: string;
  revoked?: string;
  explain?: { admin: string; on: (who: string) => string; off: (who: string) => string };
}) {
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
        /* Only this field travels. `saveUser` leaves anything absent alone, so
           granting one capability cannot revoke another. */
        body: JSON.stringify({ email: user.email, [field]: on }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Could not change that.");

      flash(`${user.email} ${on ? granted : revoked}.`);
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
        eyebrow={eyebrow}
        title={title}
        icon={<ShieldCheck size={16} strokeWidth={2.2} />}
        action={
          <span className="text-xs text-[var(--ink-muted)]">{hint}</span>
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
            const on = admin || user[field] === true;
            return (
              <li key={user.email}>
                <Tooltip
                  label={admin ? explain.admin : on ? explain.on(user.email) : explain.off(user.email)}
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
