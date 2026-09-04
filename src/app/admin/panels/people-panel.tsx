"use client";

/**
 * Who can sign in, what they may see, and their passwords.
 *
 * Split out of `admin-client` because it shares nothing with the POD editor
 * beyond sitting on the same page — different data, different routes, and the
 * only reason they were one file was that they were written on the same day.
 */
import { KeyRound, Trash2, UserPlus, X } from "lucide-react";
import { Fragment, useState } from "react";
import { Button, Empty, Panel, PanelHeader, PasswordField } from "@/components/ui";
import type { Team, User } from "@/lib/types";
import { TIMING } from "@/lib/constants";
import { MIN_PASSWORD, validateUser, validatePasswordReset } from "@/lib/validation";
import { AddPersonForm } from "./add-person-form";
import { PodAccess } from "./pod-access";
import { useResetPassword } from "./use-reset-password";
import { passwordActionLabel } from "@/lib/password-policy";

export function UsersPanel({
  users,
  teams,
  adminEmail,
  onChanged,
  flash,
}: {
  users: (User & { hasPassword: boolean })[];
  teams: Team[];
  adminEmail: string;
  onChanged: () => void;
  flash: (text: string, tone?: "ok" | "bad") => void;
}) {
  const [form, setForm] = useState({ email: "", name: "", password: "", role: "member", teamIds: [] as string[] });
  const [busy, setBusy] = useState(false);

  /**
   * Returns whether it saved.
   *
   * It used to return `undefined` either way, and the caller cleared the form in
   * a `.then()` — so a rejected account still wiped everything the reader had
   * typed while a red toast flashed past. Losing the input is a worse punishment
   * for a typo than the typo.
   */
  const save = async (payload: object, message: string): Promise<boolean> => {
    setBusy(true);
    try {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        flash(body.error || "Could not save that account.", "bad");
        return false;
      }
      flash(message);
      onChanged();
      return true;
    } catch {
      // A dropped connection is not a rejected form: keep what they typed.
      flash("Could not reach the server. Nothing was saved.", "bad");
      return false;
    } finally {
      setBusy(false);
    }
  };

  /**
   * Whose password is being set, and what to.
   *
   * One row open at a time: two half-typed passwords on screen at once is a way
   * to set the right password on the wrong person.
   */
  const [resetting, setResetting] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState("");

  /**
   * Set somebody else's password, because they have lost theirs.
   *
   * There is no email reset in this product, so the alternative is deleting the
   * account and recreating it — which drops their role and every POD they could
   * see. This keeps all of that and changes only the hash.
   */
  const resetPassword = useResetPassword({ flash, setBusy, setNewPassword, setResetting, newPassword });

  /** Check first, then send. A round trip to be told the email is blank is rude. */
  const addUser = async () => {
    const problem = validateUser(form, users.map((u) => u.email));
    if (problem) return flash(problem, "bad");

    const saved = await save(form, `Added ${form.email.trim()}.`);
    // Only on success. This is the whole bug: the form used to clear either way.
    if (saved) setForm({ email: "", name: "", password: "", role: "member", teamIds: [] });
  };

  return (
    <Panel className="p-6">
      <PanelHeader eyebrow={`${users.length} with access`} title="Dashboard access" />
      <p className="-mt-3 mb-5 text-xs text-[var(--ink-muted)]">
        Admins see every POD. For a member, click a POD to grant or revoke it — ticked means they can see it. Leave the password blank for
        single sign-on users — they are created on first sign-in.
      </p>

      <AddPersonForm form={form} setForm={setForm} teams={teams} busy={busy} onAdd={addUser} />

      {users.length === 0 ? (
        <Empty title="No accounts yet" hint="Run pnpm seed to create the first admin, or add one above." />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[620px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-[var(--hairline)] text-left">
                <th className="eyebrow pb-2 font-normal">Person</th>
                <th className="eyebrow pb-2 pl-4 font-normal">Role</th>
                <th className="eyebrow pb-2 pl-4 font-normal">PODs they can see</th>
                <th className="pb-2" />
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <Fragment key={user.id}>
                <tr className="border-b border-[var(--hairline)] last:border-0">
                  <td className="py-3">
                    <span className="block font-medium">{user.name}</span>
                    <span className="block text-xs text-[var(--ink-muted)]">{user.email}</span>
                    {/*
                      * Why this person cannot sign in, said on the row rather
                      * than discovered when they try. An account created with
                      * the password left blank looks exactly like a working one.
                      */}
                    {!user.hasPassword && (
                      <span className="mt-1 inline-flex items-center gap-1 rounded-md border border-dashed border-[var(--hairline)] px-1.5 py-0.5 text-[11px] text-[var(--ink-muted)]">
                        No password — cannot sign in yet
                      </span>
                    )}
                  </td>
                  <td className="py-3 pl-4">
                    <select
                      value={user.role}
                      onChange={(e) => save({ email: user.email, role: e.target.value }, "Role updated.")}
                      className="!w-auto !py-1 text-xs"
                    >
                      <option value="member">Member</option>
                      <option value="admin">Admin</option>
                    </select>
                  </td>
                  <td className="py-3 pl-4">
                    {user.role === "admin" ? (
                      <span className="text-xs text-[var(--ink-muted)]">All PODs</span>
                    ) : (
                      <PodAccess
                        teams={teams}
                        granted={user.teamIds}
                        busy={busy}
                        onToggle={(teamId, next) =>
                          save(
                            { email: user.email, teamIds: next },
                            `${next.includes(teamId) ? "Granted" : "Revoked"} ${
                              teams.find((t) => t.id === teamId)?.name ?? "POD"
                            }.`,
                          )
                        }
                        onAll={() =>
                          save({ email: user.email, teamIds: teams.map((t) => t.id) }, "Granted every POD.")
                        }
                        onNone={() => save({ email: user.email, teamIds: [] }, "Revoked every POD.")}
                      />
                    )}
                  </td>
                  <td className="py-3 text-right">
                    <span className="flex items-center justify-end gap-1">
                      {(
                        <button
                          onClick={() => {
                            setResetting(resetting === user.email ? null : user.email);
                            setNewPassword("");
                          }}
                          title={`${passwordActionLabel(user.hasPassword)} for ${user.email}`}
                          aria-expanded={resetting === user.email}
                          className={`rounded-lg p-2 transition-colors ${
                            resetting === user.email
                              ? "bg-[var(--accent-tint)] text-[var(--accent-ink)]"
                              : "text-[var(--ink-muted)] hover:bg-[var(--wash-2)] hover:text-[var(--ink)]"
                          }`}
                        >
                          <KeyRound size={14} />
                        </button>
                      )}
                      {user.email !== adminEmail && (
                        <button
                          onClick={async () => {
                            await fetch(`/api/users?email=${encodeURIComponent(user.email)}`, { method: "DELETE" });
                            flash(`Removed ${user.email}.`);
                            onChanged();
                          }}
                          title={`Remove ${user.email}`}
                          className="rounded-lg p-2 text-[var(--ink-muted)] transition-colors hover:bg-[var(--danger-tint)] hover:text-[var(--danger-ink)]"
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </span>
                  </td>
                </tr>
                {resetting === user.email && (
                  <tr>
                    <td colSpan={4} className="pb-3">
                      <div className="flex flex-wrap items-center gap-2 rounded-xl bg-[var(--wash)] p-3">
                        <span className="text-xs text-[var(--ink-2)]">
                          New password for <strong className="font-semibold">{user.email}</strong>
                        </span>
                        <span className="w-52">
                          <PasswordField
                            value={newPassword}
                            onChange={setNewPassword}
                            autoComplete="new-password"
                            placeholder={`At least ${MIN_PASSWORD} characters`}
                            onEnter={() => resetPassword(user.email)}
                          />
                        </span>
                        <Button variant="primary" onClick={() => resetPassword(user.email)} disabled={busy}>
                          Set it
                        </Button>
                        <Button onClick={() => setResetting(null)} disabled={busy}>
                          Cancel
                        </Button>
                        {/*
                          * Said out loud because it is the part an admin can
                          * forget: this does not notify anybody. Somebody has to
                          * tell that person what their password now is.
                          */}
                        <span className="text-xs text-[var(--ink-muted)]">
                          They are not notified — tell them yourself.
                        </span>
                      </div>
                    </td>
                  </tr>
                )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}
