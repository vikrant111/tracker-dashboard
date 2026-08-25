import { SESSION } from "./constants.ts";

/**
 * When a session stops being valid.
 *
 * Its own module, and pure, because these are the rules most worth testing and
 * least convenient to test through NextAuth: every branch here is reachable
 * with three numbers and no running server.
 *
 * Two clocks, because one is not enough:
 *
 * - **Idle** is renewed by activity. It protects the machine somebody walked
 *   away from.
 * - **Absolute** is not renewed by anything. It protects against a token that
 *   was stolen and is being used steadily — which the idle clock alone would
 *   keep alive indefinitely.
 */

export type TokenClaims = {
  /** When this session first signed in, epoch ms. */
  signedInAt?: unknown;
  /** When the account's password last changed at issue time, epoch ms. */
  passwordAt?: unknown;
};

export type SessionCheck = {
  valid: boolean;
  /** Why it was refused — for the log, never for the reader. */
  reason?: "expired-absolute" | "password-changed" | "no-account" | "malformed";
};

const finite = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

/**
 * Whether a session may continue.
 *
 * `passwordChangedAt` is the account's current stamp; `claims.passwordAt` is
 * what it was when this token was issued. A token older than the stamp was
 * issued before the password changed, so it belongs to whoever knew the *old*
 * password — which is exactly who a password change is meant to lock out.
 */
export function checkSession(
  claims: TokenClaims | null | undefined,
  accountExists: boolean,
  passwordChangedAt: string | null | undefined,
  now = Date.now(),
): SessionCheck {
  // A deleted account keeps no session. The role would fall back to "member"
  // and every request would 403, but the reader would still see a signed-in
  // shell — which is a confusing way to be told you no longer have an account.
  if (!accountExists) return { valid: false, reason: "no-account" };

  const signedInAt = finite(claims?.signedInAt);
  // A token with no sign-in time predates this policy, or was tampered with.
  // Neither is a reason to trust it indefinitely.
  if (signedInAt === null) return { valid: false, reason: "malformed" };

  // A clock that ran backwards, or a token stamped in the future.
  if (signedInAt > now + 60_000) return { valid: false, reason: "malformed" };

  if (now - signedInAt > SESSION.absoluteSeconds * 1000) {
    return { valid: false, reason: "expired-absolute" };
  }

  if (passwordChangedAt) {
    const changed = Date.parse(passwordChangedAt);
    if (Number.isFinite(changed)) {
      const issued = finite(claims?.passwordAt);
      /*
       * A token issued before the change is refused. A token with no stamp at
       * all is *also* refused when the account has one — it was issued before
       * this field existed, which is to say before the password changed.
       */
      if (issued === null || issued < changed) {
        return { valid: false, reason: "password-changed" };
      }
    }
  }

  return { valid: true };
}

/** Seconds until the absolute deadline, floored at zero. */
export function secondsRemaining(claims: TokenClaims | null | undefined, now = Date.now()): number {
  const signedInAt = finite(claims?.signedInAt);
  if (signedInAt === null) return 0;
  const left = SESSION.absoluteSeconds * 1000 - (now - signedInAt);
  return left > 0 ? Math.floor(left / 1000) : 0;
}
