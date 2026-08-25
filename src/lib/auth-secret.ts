import { randomBytes } from "node:crypto";

/**
 * The key every session token is signed with.
 *
 * This used to be `process.env.AUTH_SECRET || "dev-only-insecure-secret"`, and
 * that fallback was the worst bug in the codebase precisely because **nothing
 * about it looked broken**. Sign-in worked. Sessions worked. Every check
 * passed. But a deployment that forgot to set `AUTH_SECRET` was signing its
 * tokens with a string committed to this repository, which means anyone who
 * could read the source could mint themselves a token claiming
 * `role: "admin"` — not guess a password, not steal a session: *forge* one.
 *
 * The rule now: **in production a real secret is mandatory, and its absence
 * stops the process.** Refusing to start is a loud, cheap failure. Starting
 * with a public key is a silent, total one.
 */

/** Values that are technically set but are not secrets. */
const PLACEHOLDERS = new Set([
  "dev-only-insecure-secret",
  // What `.env.example` ships. Copying that file and not editing it is the
  // single most likely way to arrive here with a "set" but useless secret.
  "change-me-openssl-rand-base64-32",
  "changeme",
  "secret",
  "please-change-me",
]);

/** Long enough that guessing it is not the weak link. 32 bytes base64 ≈ 44. */
export const MIN_SECRET_LENGTH = 32;

export type SecretVerdict =
  | { ok: true; secret: string; generated: boolean }
  | { ok: false; reason: string };

/**
 * Decide what to sign with, given the environment.
 *
 * Pure, and separated from the module that applies it, so the checks can
 * exercise every branch — including the production ones — without setting real
 * environment variables or booting NextAuth.
 */
export function resolveAuthSecret(raw: string | undefined, isProduction: boolean): SecretVerdict {
  const secret = String(raw ?? "").trim();

  if (!secret) {
    if (isProduction) {
      return {
        ok: false,
        reason:
          "AUTH_SECRET is not set. Generate one with `openssl rand -base64 32` and set it before starting. " +
          "Without it, session tokens would be signed with a publicly known key and anyone could forge an admin session.",
      };
    }
    // Development: a fresh random key each boot. Sessions do not survive a
    // restart, which is mildly annoying and much better than a shared constant
    // that could follow the code into production.
    return { ok: true, secret: randomBytes(32).toString("base64"), generated: true };
  }

  if (PLACEHOLDERS.has(secret.toLowerCase())) {
    if (isProduction) {
      return {
        ok: false,
        reason:
          `AUTH_SECRET is still the placeholder value ("${secret}"). Generate a real one with ` +
          "`openssl rand -base64 32`. A known secret is the same as no secret.",
      };
    }
    return { ok: true, secret: randomBytes(32).toString("base64"), generated: true };
  }

  if (secret.length < MIN_SECRET_LENGTH) {
    if (isProduction) {
      return {
        ok: false,
        reason:
          `AUTH_SECRET is only ${secret.length} characters. Use at least ${MIN_SECRET_LENGTH} — ` +
          "`openssl rand -base64 32`.",
      };
    }
    // Short but deliberate, in development. Allowed, because a local secret
    // that is merely weak is not a production risk.
    return { ok: true, secret, generated: false };
  }

  return { ok: true, secret, generated: false };
}
