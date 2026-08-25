"use client";

/**
 * Adding somebody to the dashboard.
 *
 * A blank password is deliberate and meaningful: it is how an SSO account is
 * created, and they get their password from the identity provider on first
 * sign-in.
 */
import { UserPlus, X } from "lucide-react";
import { Button, PasswordField } from "@/components/ui";
import type { Team } from "@/lib/types";

export function AddPersonForm({
  form,
  setForm,
  teams,
  busy,
  onAdd,
}: {
  form: { email: string; name: string; password: string; role: string; teamIds: string[] };
  setForm: (form: { email: string; name: string; password: string; role: string; teamIds: string[] }) => void;
  teams: Team[];
  busy: boolean;
  onAdd: () => void;
}) {
  return (
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
        <Button variant="primary" disabled={busy || !form.email.trim()} onClick={onAdd}>
          <UserPlus size={14} />
          {busy ? "Adding…" : "Add"}
        </Button>
      </div>
  );
}
