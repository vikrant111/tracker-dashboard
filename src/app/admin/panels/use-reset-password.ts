"use client";

import { TIMING } from "@/lib/constants";
import { validatePasswordReset } from "@/lib/validation";

/**
 * An admin setting somebody else's password.
 *
 * There is no email reset in this product, so without this a forgotten password
 * is unrecoverable — the alternative being to delete the account and recreate
 * it, which drops the role and every POD that person could see.
 */
export function useResetPassword({
  flash,
  setBusy,
  setNewPassword,
  setResetting,
  newPassword,
}: {
  flash: (text: string, tone?: "ok" | "bad") => void;
  setBusy: (busy: boolean) => void;
  setNewPassword: (value: string) => void;
  setResetting: (email: string | null) => void;
  newPassword: string;
}) {
  return async (email: string) => {
    const problem = validatePasswordReset({ email, next: newPassword });
    if (problem) return flash(problem, "bad");

    setBusy(true);
    try {
      const res = await fetch("/api/users/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, next: newPassword }),
      });
      const json = await res.json().catch(() => null);

      if (!res.ok) {
        flash(json?.error ?? "Could not change that password.", "bad");
        return;
      }

      // Cleared on success only, so a rejected password is still there to fix.
      setNewPassword("");
      setResetting(null);
      if (json?.self) {
        // Their own token was just invalidated along with everyone else's, so
        // the next request would 401 with no explanation. Say so, then go.
        flash("Your password is changed. Signing you out everywhere…");
        setTimeout(() => (window.location.href = "/login"), TIMING.confirmMs / 2);
        return;
      }
      flash(`Password set for ${email}. They are signed out everywhere and are not notified — tell them yourself.`);
    } catch {
      flash("Could not reach the server. Nothing was changed.", "bad");
    } finally {
      setBusy(false);
    }
  };

}
