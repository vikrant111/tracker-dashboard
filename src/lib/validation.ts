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

import { AGEING, LIMITS } from "./constants.ts";

/**
 * Deliberately loose.
 *
 * The full grammar for a valid address is notoriously baroque, and a strict
 * pattern's failure mode is rejecting somebody's real address — which is worse
 * than accepting a typo the server will reject anyway. Something, an `@`,
 * something, a dot, something.
 */
export const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const isEmail = (value: unknown): boolean => EMAIL.test(String(value ?? "").trim());

export type MemberDraft = {
  name?: string;
  email?: string;
  designation?: string;
  role?: string;
};

export type TeamDraft = {
  name?: string;
  description?: string;
  ageingThresholdDays?: number;
  members?: MemberDraft[];
};

/**
 * A POD, before it is saved.
 *
 * Blank member rows are *not* an error — the form starts with one and the save
 * path strips them. Only a row somebody has half-filled is a problem, because
 * that is a person they meant to add and would otherwise lose silently.
 */
export function validateTeam(draft: TeamDraft | null | undefined): string | null {
  if (!draft) return "Nothing to save.";

  const name = String(draft.name ?? "").trim();
  if (!name) return "Give the POD a name.";
  if (name.length > LIMITS.teamName) return `The POD name is longer than ${LIMITS.teamName} characters.`;

  const threshold = draft.ageingThresholdDays;
  if (threshold !== undefined) {
    if (!Number.isFinite(threshold) || !Number.isInteger(threshold)) {
      return "The ageing threshold must be a whole number of days.";
    }
    if (threshold < AGEING.min || threshold > AGEING.max) {
      return `The ageing threshold must be between ${AGEING.min} and ${AGEING.max} days.`;
    }
  }

  const members = Array.isArray(draft.members) ? draft.members : [];
  for (const [i, member] of members.entries()) {
    const memberName = String(member?.name ?? "").trim();
    const email = String(member?.email ?? "").trim();

    // Entirely empty is the blank row the form ships with. Skip it.
    if (!memberName && !email) continue;

    const where = `Member ${i + 1}`;
    if (!memberName) return `${where} has an email but no name. Names must match Azure Boards.`;
    if (email && !isEmail(email)) return `${where}: "${email}" is not an email address.`;
    if (memberName.length > LIMITS.personName) return `${where}'s name is too long.`;
  }

  // Two people on one email would both match the same work items.
  const emails = members
    .map((m) => String(m?.email ?? "").trim().toLowerCase())
    .filter(Boolean);
  const duplicate = emails.find((e, i) => emails.indexOf(e) !== i);
  if (duplicate) return `Two members share the email ${duplicate}.`;

  return null;
}

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
