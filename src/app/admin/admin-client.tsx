"use client";

import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, Plug, Plus, RefreshCw, Trash2, UserPlus, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import useSWR from "swr";
import { ParallaxBackdrop } from "@/components/parallax-backdrop";
import { ThemeToggle } from "@/components/theme-toggle";
import { SWR_OPTIONS, fetcher } from "@/lib/swr";
import { Button, Empty, Panel, PanelHeader, PasswordField } from "@/components/ui";
import type { Member, Team, User } from "@/lib/types";
import { TIMING } from "@/lib/constants";
import { validateTeam, validateUser } from "@/lib/validation";

const BLANK_MEMBER: Member = { name: "", email: "", designation: "", role: "member" };

const blankTeam = (): Team => ({
  id: "",
  name: "",
  description: "",
  members: [{ ...BLANK_MEMBER, role: "lead" }],
  azure: { orgUrl: "", project: "", pat: "", areaPath: "", workItemTypes: ["Bug", "Issue", "Task", "User Story"] },
  fieldMap: {
    severity: "Microsoft.VSTS.Common.Severity",
    environment: "Custom.Environment",
    status: "System.State",
  },
  valueMap: { severity: {}, environment: {}, status: {} },
  ageingThresholdDays: 7,
  createdAt: "",
});

export function AdminClient({ adminEmail }: { adminEmail: string }) {
  const teamsReq = useSWR<{ teams: Team[] }>("/api/teams", fetcher, SWR_OPTIONS);
  const usersReq = useSWR<{ users: (User & { hasPassword: boolean })[] }>("/api/users", fetcher, SWR_OPTIONS);

  const [draft, setDraft] = useState<Team | null>(null);
  const [busy, setBusy] = useState("");
  const [toast, setToast] = useState<{ text: string; tone: "ok" | "bad" } | null>(null);

  const teams = teamsReq.data?.teams ?? [];
  const flash = (text: string, tone: "ok" | "bad" = "ok") => {
    setToast({ text, tone });
    setTimeout(() => setToast(null), TIMING.toastMs);
  };

  const patch = (change: Partial<Team>) => setDraft((d) => (d ? { ...d, ...change } : d));
  const patchAzure = (change: Partial<Team["azure"]>) =>
    setDraft((d) => (d ? { ...d, azure: { ...d.azure, ...change } } : d));

  /**
   * Whether the draft differs from what is stored.
   *
   * A new POD counts as dirty the moment it is given a name — before that it is
   * an empty form, and closing an empty form should not ask you anything.
   */
  const saved = draft?.id ? teams.find((t) => t.id === draft.id) : undefined;
  const dirty = draft ? JSON.stringify(draft) !== JSON.stringify(saved ?? blankTeam()) : false;

  /**
   * Two-step confirmation for anything that throws work away.
   *
   * A single click that deletes a POD *and every work item under it* is not a
   * button, it is a trap. The second click has to be deliberate, and the arming
   * lapses on its own so a stray first click cannot sit there waiting to fire.
   */
  const [armed, setArmed] = useState<string | null>(null);
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(null), TIMING.confirmMs);
    return () => clearTimeout(t);
  }, [armed]);

  const confirmThen = (key: string, run: () => void) => {
    if (armed === key) {
      setArmed(null);
      run();
      return;
    }
    setArmed(key);
  };

  /** Close the editor, asking first only if there is something to lose. */
  const closeDraft = () => {
    if (!dirty) return setDraft(null);
    confirmThen("discard", () => {
      setDraft(null);
      flash("Discarded unsaved changes.");
    });
  };

  const saveTeam = async () => {
    // Checked before the request, so a half-filled member row is named rather
    // than silently dropped on the way to the server.
    const problem = validateTeam(draft);
    if (problem) return flash(problem, "bad");

    const creating = !draft?.id;
    setBusy("save");
    try {
      const res = await fetch("/api/teams", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...draft, members: draft!.members.filter((m) => m.name.trim() || m.email.trim()) }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Could not save that POD.");

      flash(creating ? `Created ${body.team.name}.` : `Saved ${body.team.name}.`);
      // The saved POD, not the draft: ids, slugs and defaults are the server's
      // to assign, and the editor should show what was actually stored. On
      // failure the draft is left exactly as typed — see the catch.
      setDraft(body.team);
      await teamsReq.mutate();
    } catch (err) {
      flash(err instanceof Error ? err.message : "Could not save.", "bad");
    } finally {
      setBusy("");
    }
  };

  const testConnection = async () => {
    if (!draft?.id) return flash("Save the POD before testing.", "bad");
    setBusy("test");
    const res = await fetch(`/api/teams/${draft.id}/test`, { method: "POST" }).then((r) => r.json());
    setBusy("");
    flash(res.ok ? `Connected to ${res.project}.` : res.error, res.ok ? "ok" : "bad");
  };

  const syncTeam = async (full: boolean) => {
    if (!draft?.id) return;
    setBusy("sync");
    const res = await fetch("/api/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ teamId: draft.id, full }),
    }).then((r) => r.json());
    setBusy("");
    const result = res.results?.[0];
    flash(result?.error ?? `Imported ${result?.imported ?? 0} work items.`, result?.error ? "bad" : "ok");
  };

  const removeTeam = async (team: Team) => {
    setBusy(`del-${team.id}`);
    await fetch(`/api/teams/${team.id}`, { method: "DELETE" });
    setBusy("");
    if (draft?.id === team.id) setDraft(null);
    flash(`Deleted ${team.name} and its work items.`);
    await teamsReq.mutate();
  };

  return (
    <>
      <ParallaxBackdrop />
      <div className="mx-auto flex max-w-[1400px] flex-col gap-4 px-4 py-6 pb-24 sm:px-6">
        <header className="flex flex-wrap items-center gap-3">
          <Link href="/">
            <Button>
              <ArrowLeft size={15} />
              Dashboard
            </Button>
          </Link>
          <div>
            <p className="eyebrow">Admin</p>
            <h1 className="font-[family-name:var(--font-display)] text-2xl font-bold tracking-tight">
              PODs and access
            </h1>
          </div>
          <div className="ml-auto flex items-center gap-3">
            <ThemeToggle />
            <Button variant="primary" onClick={() => setDraft(blankTeam())}>
              <Plus size={15} />
              New POD
            </Button>
          </div>
        </header>

        <div className="grid gap-4 lg:grid-cols-[minmax(0,320px)_minmax(0,1fr)]">
          <Panel className="p-5">
            <PanelHeader eyebrow={`${teams.length} onboarded`} title="PODs" />
            {teams.length === 0 ? (
              <Empty title="No PODs yet" hint="Create one — for example AMC POD — then add its five members." />
            ) : (
              <ul className="flex flex-col gap-1">
                {teams.map((team) => (
                  <li key={team.id} className="flex items-center gap-1">
                    <button
                      onClick={() => setDraft(team)}
                      className={`flex-1 rounded-lg px-3 py-2.5 text-left transition-colors ${
                        draft?.id === team.id ? "bg-[var(--wash-2)]" : "hover:bg-[var(--wash)]"
                      }`}
                    >
                      <span className="block text-sm font-medium">{team.name}</span>
                      <span className="block text-xs text-[var(--ink-muted)]">
                        {team.members.length} member{team.members.length === 1 ? "" : "s"}
                        {team.azure.project ? ` · ${team.azure.project}` : " · not connected"}
                      </span>
                    </button>
                    {/*
                     * Deleting a POD takes every work item under it. Two clicks,
                     * and the armed state says plainly what the second one does.
                     */}
                    <button
                      onClick={() => confirmThen(`del-${team.id}`, () => removeTeam(team))}
                      disabled={busy === `del-${team.id}`}
                      title={
                        armed === `del-${team.id}`
                          ? `Click again to delete ${team.name} and its work items`
                          : `Delete ${team.name}`
                      }
                      className={`shrink-0 rounded-lg px-2 py-2 text-xs font-medium transition-colors ${
                        armed === `del-${team.id}`
                          ? "bg-[var(--danger-tint-2)] text-[var(--danger-ink)]"
                          : "text-[var(--ink-muted)] hover:bg-[var(--danger-tint)] hover:text-[var(--danger-ink)]"
                      }`}
                    >
                      {armed === `del-${team.id}` ? "Sure?" : <Trash2 size={14} />}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          {draft ? (
            <div className="flex flex-col gap-4">
              <Panel className="p-6">
                <PanelHeader
                  eyebrow={draft.id ? `POD id ${draft.id}` : "New POD"}
                  title={draft.name || "Name this POD"}
                  action={
                    <span className="flex flex-wrap items-center gap-2">
                      {/* Cancel first, so the destructive-ish option is not the
                          one under the thumb. */}
                      <Button onClick={closeDraft} disabled={busy === "save"}>
                        <X size={14} />
                        {armed === "discard" ? "Discard changes?" : "Cancel"}
                      </Button>
                      <Button variant="primary" onClick={saveTeam} disabled={busy === "save" || !dirty}>
                        {busy === "save" ? "Saving…" : dirty ? "Save POD" : "Saved"}
                      </Button>
                    </span>
                  }
                />

                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="POD name" hint="Shown across the dashboard, e.g. AMC POD">
                    <input value={draft.name} onChange={(e) => patch({ name: e.target.value })} placeholder="AMC POD" />
                  </Field>
                  <Field label="Ageing threshold" hint="Days before an open item counts as aged">
                    <input
                      type="number"
                      min={1}
                      value={draft.ageingThresholdDays}
                      onChange={(e) => patch({ ageingThresholdDays: Number(e.target.value) })}
                    />
                  </Field>
                  <Field label="Description" hint="Optional — what this POD owns" className="sm:col-span-2">
                    <input
                      value={draft.description}
                      onChange={(e) => patch({ description: e.target.value })}
                      placeholder="Asset management console"
                    />
                  </Field>
                </div>
              </Panel>

              <Panel className="p-6">
                <PanelHeader
                  eyebrow={`${draft.members.length} people`}
                  title="Team members"
                  action={
                    <Button onClick={() => patch({ members: [...draft.members, { ...BLANK_MEMBER }] })}>
                      <Plus size={14} />
                      Add member
                    </Button>
                  }
                />
                <p className="-mt-3 mb-4 text-xs text-[var(--ink-muted)]">
                  Name must match the Azure Boards display name so work items map to the right person. Email is used
                  when you grant them dashboard access below.
                </p>

                <div className="flex flex-col gap-2">
                  {draft.members.map((member, i) => (
                    <div key={i} className="grid gap-2 sm:grid-cols-[1.1fr_1.2fr_1fr_auto_auto]">
                      <input
                        value={member.name}
                        placeholder="Full name"
                        onChange={(e) => updateMember(draft, setDraft, i, { name: e.target.value })}
                      />
                      <input
                        value={member.email}
                        placeholder="email@company.com"
                        onChange={(e) => updateMember(draft, setDraft, i, { email: e.target.value })}
                      />
                      <input
                        value={member.designation}
                        placeholder="Designation"
                        onChange={(e) => updateMember(draft, setDraft, i, { designation: e.target.value })}
                      />
                      <select
                        value={member.role}
                        onChange={(e) =>
                          updateMember(draft, setDraft, i, { role: e.target.value as Member["role"] })
                        }
                        className="!w-auto"
                      >
                        <option value="member">Member</option>
                        <option value="lead">Lead</option>
                      </select>
                      <button
                        onClick={() => patch({ members: draft.members.filter((_, j) => j !== i) })}
                        title="Remove member"
                        className="rounded-lg p-2 text-[var(--ink-muted)] transition-colors hover:bg-[var(--danger-tint)] hover:text-[var(--danger-ink)]"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              </Panel>

              <Panel className="p-6">
                <PanelHeader
                  eyebrow="Azure Boards"
                  title="Connection and field mapping"
                  action={
                    <div className="flex gap-2">
                      <Button onClick={testConnection} disabled={busy === "test"}>
                        <Plug size={14} />
                        {busy === "test" ? "Testing…" : "Test"}
                      </Button>
                      <Button onClick={() => syncTeam(false)} disabled={busy === "sync"}>
                        <RefreshCw size={14} className={busy === "sync" ? "animate-spin" : ""} />
                        Sync
                      </Button>
                      <Button onClick={() => syncTeam(true)} disabled={busy === "sync"} title="Re-import everything">
                        Full resync
                      </Button>
                    </div>
                  }
                />

                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Organisation URL" hint="Blank falls back to AZDO_ORG_URL">
                    <input
                      value={draft.azure.orgUrl}
                      onChange={(e) => patchAzure({ orgUrl: e.target.value })}
                      placeholder="https://dev.azure.com/my-org"
                    />
                  </Field>
                  <Field label="Project" hint="Blank falls back to AZDO_PROJECT">
                    <input
                      value={draft.azure.project}
                      onChange={(e) => patchAzure({ project: e.target.value })}
                      placeholder="Payments"
                    />
                  </Field>
                  <Field label="Personal access token" hint="Needs Work Items (Read). Blank falls back to AZDO_PAT.">
                    <PasswordField
                      value={draft.azure.pat}
                      onChange={(pat) => patchAzure({ pat })}
                      autoComplete="off"
                      placeholder="••••••••"
                    />
                  </Field>
                  <Field label="Area path" hint="Scopes this POD's items, and routes webhooks to it">
                    <input
                      value={draft.azure.areaPath}
                      onChange={(e) => patchAzure({ areaPath: e.target.value })}
                      placeholder="Payments\\AMC"
                    />
                  </Field>
                  <Field label="Work item types" hint="Comma separated" className="sm:col-span-2">
                    <input
                      value={draft.azure.workItemTypes.join(", ")}
                      onChange={(e) =>
                        patchAzure({
                          workItemTypes: e.target.value
                            .split(",")
                            .map((s) => s.trim())
                            .filter(Boolean),
                        })
                      }
                    />
                  </Field>
                </div>

                <h3 className="mt-6 mb-1 text-sm font-semibold">Field mapping</h3>
                <p className="mb-3 text-xs text-[var(--ink-muted)]">
                  Reference names of the fields carrying each dimension on your board. Environment also falls back to
                  tags and then area path when the field is missing.
                </p>
                <div className="grid gap-4 sm:grid-cols-3">
                  {(["severity", "environment", "status"] as const).map((key) => (
                    <Field key={key} label={key} hint="">
                      <input
                        value={draft.fieldMap[key]}
                        onChange={(e) => patch({ fieldMap: { ...draft.fieldMap, [key]: e.target.value } })}
                      />
                    </Field>
                  ))}
                </div>

                <h3 className="mt-6 mb-1 text-sm font-semibold">Live updates</h3>
                <p className="text-xs leading-relaxed text-[var(--ink-muted)]">
                  The server polls Azure on the interval set by SYNC_POLL_SECONDS. For instant updates, add a Service
                  Hook in Azure DevOps (Project settings → Service hooks → Web Hooks) for
                  <em> work item created, updated and deleted</em>, pointing at
                  <code className="mx-1 rounded bg-[var(--wash-2)] px-1.5 py-0.5 font-[family-name:var(--font-mono)] text-[11px]">
                    {typeof window !== "undefined" ? window.location.origin : ""}/api/webhooks/azure?token=AZDO_WEBHOOK_TOKEN
                  </code>
                </p>
              </Panel>
            </div>
          ) : (
            <Panel className="grid place-items-center p-6">
              <Empty
                title="Pick a POD, or create one"
                hint="Each POD gets its own Azure connection, member list and ageing threshold. Members only see the PODs you assign them to."
              />
            </Panel>
          )}
        </div>

        <UsersPanel
          users={usersReq.data?.users ?? []}
          teams={teams}
          adminEmail={adminEmail}
          onChanged={() => usersReq.mutate()}
          flash={flash}
        />
      </div>

      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 24 }}
            role="status"
            className="glass fixed bottom-6 left-1/2 z-50 max-w-[90vw] -translate-x-1/2 px-4 py-3 text-sm"
            style={{ borderColor: toast.tone === "bad" ? "var(--danger)" : "var(--st-good)" }}
          >
            {toast.text}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

function updateMember(
  draft: Team,
  setDraft: (t: Team) => void,
  index: number,
  change: Partial<Member>,
) {
  setDraft({
    ...draft,
    members: draft.members.map((m, i) => (i === index ? { ...m, ...change } : m)),
  });
}

function Field({
  label,
  hint,
  children,
  className = "",
}: {
  label: string;
  hint: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={`flex flex-col gap-1.5 ${className}`}>
      <span className="eyebrow">{label}</span>
      {children}
      {hint && <span className="text-xs text-[var(--ink-muted)]">{hint}</span>}
    </label>
  );
}

function UsersPanel({
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
        Admins see every POD. Members see only the PODs ticked against their name. Leave the password blank for
        single sign-on users — they are created on first sign-in.
      </p>

      <div className="mb-6 grid gap-2 sm:grid-cols-[1.3fr_1fr_1fr_auto_auto]">
        <input
          placeholder="email@company.com"
          value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })}
        />
        <input placeholder="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        <PasswordField
          value={form.password}
          onChange={(password) => setForm({ ...form, password })}
          autoComplete="new-password"
          placeholder="Password"
        />
        <select
          value={form.role}
          onChange={(e) => setForm({ ...form, role: e.target.value })}
          className="!w-auto"
        >
          <option value="member">Member</option>
          <option value="admin">Admin</option>
        </select>
        {/* A way out of a half-filled form, shown only when there is something
            to clear — an always-on Cancel next to an empty form is noise. */}
        {(form.email || form.name || form.password) && (
          <Button onClick={() => setForm({ email: "", name: "", password: "", role: "member", teamIds: [] })}>
            <X size={14} />
            Clear
          </Button>
        )}
        {/*
         * Enabled whenever there is an email to judge. It used to require an
         * "@" before it would even light up, which meant the reader got no
         * explanation at all — a dead button and no idea why.
         */}
        <Button variant="primary" disabled={busy || !form.email.trim()} onClick={addUser}>
          <UserPlus size={14} />
          {busy ? "Adding…" : "Add"}
        </Button>
      </div>

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
                <tr key={user.id} className="border-b border-[var(--hairline)] last:border-0">
                  <td className="py-3">
                    <span className="block font-medium">{user.name}</span>
                    <span className="block text-xs text-[var(--ink-muted)]">{user.email}</span>
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
                      <div className="flex flex-wrap gap-1.5">
                        {teams.map((team) => {
                          const on = user.teamIds.includes(team.id);
                          return (
                            <button
                              key={team.id}
                              onClick={() =>
                                save(
                                  {
                                    email: user.email,
                                    teamIds: on
                                      ? user.teamIds.filter((id) => id !== team.id)
                                      : [...user.teamIds, team.id],
                                  },
                                  `${on ? "Removed" : "Granted"} ${team.name}.`,
                                )
                              }
                              className={`rounded-md px-2 py-1 text-xs transition-colors ${
                                on
                                  ? "bg-[var(--accent-tint)] text-[var(--accent-ink)]"
                                  : "bg-[var(--wash)] text-[var(--ink-muted)] hover:bg-[var(--wash-2)]"
                              }`}
                            >
                              {team.name}
                            </button>
                          );
                        })}
                        {teams.length === 0 && (
                          <span className="text-xs text-[var(--ink-muted)]">Create a POD first</span>
                        )}
                      </div>
                    )}
                  </td>
                  <td className="py-3 text-right">
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
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}
