/**
 * What a POD form must satisfy before it is worth sending.
 *
 * Split from `validation.ts` when per-severity ageing arrived: the account and
 * password rules have nothing to do with how a board reads its own clock, and
 * one file holding both had outgrown a single sitting.
 *
 * Same contract as its neighbour — **the first problem as a sentence**, or
 * `null`. And the same standing: a courtesy, not a boundary. `saveTeam` clamps
 * and `clampSeverityThresholds` cleans, because a client-side check is a
 * suggestion to anyone holding curl.
 *
 * Pure and client-safe, so `scripts/check-ui.mjs` exercises the shipped rules.
 */

import { AGEING, LIMITS } from "./constants.ts";
import { SEVERITIES } from "./types.ts";
import { isEmail } from "./validation-email.ts";

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
  /** Per-severity overrides. A key that is absent or blank means "use the POD's". */
  severityThresholdDays?: Record<string, number | undefined>;
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

  /*
   * Per-severity overrides. A **blank** one is not an error and never reaches
   * here as a number — the form drops empty fields, because blank is how an
   * admin says "use the POD's threshold". Only a value somebody actually typed
   * has to clear the bar, and it is the same bar: a Critical held to zero days
   * would mark every open critical aged the moment it was raised.
   */
  const bySeverity = draft.severityThresholdDays;
  if (bySeverity && typeof bySeverity === "object") {
    for (const [severity, value] of Object.entries(bySeverity)) {
      if (value === undefined || value === null || (value as unknown) === "") continue;
      if (!(SEVERITIES as readonly string[]).includes(severity)) return `"${severity}" is not a severity.`;
      const days = Number(value);
      if (!Number.isFinite(days) || !Number.isInteger(days)) {
        return `The ${severity} threshold must be a whole number of days.`;
      }
      if (days < AGEING.min || days > AGEING.max) {
        return `The ${severity} threshold must be between ${AGEING.min} and ${AGEING.max} days.`;
      }
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

