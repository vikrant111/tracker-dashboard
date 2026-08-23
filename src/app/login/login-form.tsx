"use client";

import { motion } from "framer-motion";
import { signIn } from "next-auth/react";
import { useState } from "react";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button, PasswordField } from "@/components/ui";

export function LoginForm({
  passwordEnabled,
  entraEnabled,
}: {
  passwordEnabled: boolean;
  entraEnabled: boolean;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    const res = await signIn("credentials", { email, password, redirect: false });
    setBusy(false);
    if (res?.error) setError("That email and password did not match.");
    else window.location.href = "/";
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
      className="glass w-full max-w-sm p-8"
    >
      <div className="mb-5 flex justify-end">
        <ThemeToggle />
      </div>
      <span
        aria-hidden
        className="grid h-11 w-11 place-items-center rounded-xl bg-gradient-to-br from-[var(--accent)] to-[var(--accent-2)] font-[family-name:var(--font-display)] text-lg font-bold text-[var(--mark-ink)]"
      >
        T
      </span>
      <h1 className="mt-5 font-[family-name:var(--font-display)] text-2xl font-bold tracking-tight">POD Tracker</h1>
      <p className="mt-1.5 text-sm text-[var(--ink-muted)]">
        Ageing bugs, tickets and CRs for every POD.
      </p>

      {passwordEnabled && (
        <form onSubmit={submit} className="mt-6 flex flex-col gap-3">
          <label className="flex flex-col gap-1.5">
            <span className="eyebrow">Email</span>
            <input
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="eyebrow">Password</span>
            <PasswordField value={password} onChange={setPassword} required />
          </label>
          {error && <p className="text-sm text-[var(--danger-ink)]">{error}</p>}
          <Button type="submit" variant="primary" disabled={busy} className="mt-1 justify-center">
            {busy ? "Signing in…" : "Sign in"}
          </Button>
        </form>
      )}

      {passwordEnabled && entraEnabled && (
        <div className="my-5 flex items-center gap-3">
          <span className="h-px flex-1 bg-[var(--wash-2)]" />
          <span className="eyebrow">or</span>
          <span className="h-px flex-1 bg-[var(--wash-2)]" />
        </div>
      )}

      {entraEnabled && (
        <Button
          onClick={() => signIn("microsoft-entra-id", { callbackUrl: "/" })}
          className={`w-full justify-center ${passwordEnabled ? "" : "mt-6"}`}
        >
          Continue with Microsoft
        </Button>
      )}

      {!passwordEnabled && !entraEnabled && (
        <p className="mt-6 text-sm text-[var(--danger-ink)]">
          No sign-in method is configured. Set AUTH_MODE in .env.local.
        </p>
      )}
    </motion.div>
  );
}
