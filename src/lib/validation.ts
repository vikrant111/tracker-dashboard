/**
 * What a form must satisfy before it is worth sending.
 *
 * Each function returns **the first problem as a sentence to show the reader**,
 * or `null` when there is nothing wrong. One message at a time on purpose: a
 * list of six complaints above a form is read as noise, and the reader fixes
 * them one at a time anyway.
 *
 * These are a courtesy, not a security boundary. Everything here is enforced
 * again server-side — `saveTeam` clamps and truncates, `saveUser` validates the
 * role — because a client-side check is a suggestion to anyone holding curl.
 *
 * Pure and client-safe, so `scripts/check-ui.mjs` exercises the shipped rules
 * rather than a copy of them.
 */

import { LIMITS } from "./constants.ts";

/* The POD form's rules live next door — same contract, re-exported so every
 * existing `@/lib/validation` import is unchanged. */
export { validateTeam, type MemberDraft, type TeamDraft } from "./validation-team.ts";
export { EMAIL, isEmail } from "./validation-email.ts";

import { isEmail } from "./validation-email.ts";

export type UserDraft = {
  email?: string;
  name?: string;
  password?: string;
  role?: string;
};

/** Minimum password length. Short enough to be usable, long enough to mean it. */
export const MIN_PASSWORD = 8;

/**
 * A dashboard account, before it is created.
 *
 * A blank password is **valid and meaningful**: it is how an SSO user is
 * created, and they get their password from the identity provider on first
 * sign-in. Only a password somebody actually typed has to clear the bar.
 */
export function validateUser(draft: UserDraft | null | undefined, existingEmails: string[] = []): string | null {
  if (!draft) return "Nothing to save.";

  const email = String(draft.email ?? "").trim();
  if (!email) return "An email address is required.";
  if (!isEmail(email)) return `"${email}" is not an email address.`;
  if (email.length > LIMITS.email) return "That email address is too long.";

  if (existingEmails.some((e) => String(e ?? "").trim().toLowerCase() === email.toLowerCase())) {
    return `${email} already has access.`;
  }

  const password = String(draft.password ?? "");
  if (password && password.length < MIN_PASSWORD) {
    return `The password must be at least ${MIN_PASSWORD} characters, or blank for single sign-on.`;
  }

  const role = String(draft.role ?? "");
  if (role && role !== "admin" && role !== "member") return "Pick a role.";

  return null;
}

/**
 * A password change, before it is sent.
 *
 * The server re-checks every one of these — this exists so the reader is told
 * what is wrong before a round trip, not because the client is trusted.
 *
 * `current` is only checked for presence here. Whether it is *right* is a
 * question only the server can answer, and deliberately so: the answer lives
 * behind a bcrypt compare, and a client that could pre-check it would be an
 * oracle for guessing.
 */
export function validatePasswordChange(draft: {
  current?: string;
  next?: string;
  confirm?: string;
} | null | undefined): string | null {
  if (!draft) return "Nothing to change.";

  const current = String(draft.current ?? "");
  const next = String(draft.next ?? "");
  const confirm = String(draft.confirm ?? "");

  if (!current) return "Enter your current password.";
  if (!next) return "Enter a new password.";
  if (next.length < MIN_PASSWORD) return `The new password must be at least ${MIN_PASSWORD} characters.`;
  if (next.length > LIMITS.password) return "That password is too long.";
  // Compared before the confirmation, so retyping a password that was never
  // going to be accepted is not the thing the reader is told about first.
  if (next === current) return "The new password is the same as the current one.";
  if (confirm !== next) return "The two new passwords do not match.";

  return null;
}

/**
 * An admin setting somebody else's password.
 *
 * No current password: the whole point is that the account holder has lost
 * theirs and cannot supply it. That is exactly why the route behind this is
 * admin-only — the check that matters is on the caller, not on the input.
 */
export function validatePasswordReset(draft: { email?: string; next?: string } | null | undefined): string | null {
  if (!draft) return "Nothing to change.";

  const email = String(draft.email ?? "").trim();
  if (!email) return "Pick whose password to change.";
  if (!isEmail(email)) return `"${email}" is not an email address.`;

  const next = String(draft.next ?? "");
  if (!next) return "Enter a new password.";
  if (next.length < MIN_PASSWORD) return `The password must be at least ${MIN_PASSWORD} characters.`;
  if (next.length > LIMITS.password) return "That password is too long.";

  return null;
}
