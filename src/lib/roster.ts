/**
 * Folding a POD's roster into the leaderboard.
 *
 * The leaderboard is built by aggregating **work items**, so it can only ever
 * show people who already have one. Onboard a POD of five and the dashboard
 * shows nothing — which is exactly what happened, and it reads as "adding
 * members didn't work" rather than "nobody has any bugs yet".
 *
 * A person with zero open items is information: it is the difference between
 * *not on this team* and *carrying nothing right now*. So the roster is merged
 * in, and members with no items appear at zero and fill in as items arrive.
 *
 * Pure and client-safe, so `scripts/check-ui.mjs` exercises the shipped code.
 */

export type RosterPerson = {
  name: string;
  email?: string;
  designation?: string;
};

export type Ranked = {
  name: string;
  email: string;
  total: number;
  active: number;
  critical: number;
  aged: number;
  avgAgeDays: number;
  severity: { key: string; count: number }[];
  /** Filled in from the roster when the person is on one. */
  designation?: string;
  /** True when this row came from the roster and has no work items at all. */
  onRosterOnly?: boolean;
};

const key = (s: string | undefined) => String(s ?? "").trim().toLowerCase();

/**
 * Match a roster entry to an aggregated row.
 *
 * Email first — it is the only identifier both sides genuinely share. Azure
 * gives a display name, and a spreadsheet gives whatever the author typed, so
 * name matching is a fallback and deliberately exact-after-normalising: fuzzy
 * matching here would silently merge two different people's bug counts.
 */
function findMatch(rows: Ranked[], person: RosterPerson): Ranked | undefined {
  const email = key(person.email);
  if (email) {
    const byEmail = rows.find((r) => key(r.email) === email);
    if (byEmail) return byEmail;
  }
  const name = key(person.name);
  if (!name) return undefined;
  return rows.find((r) => key(r.name) === name);
}

/** A person on the roster who has nothing assigned. Zeroes, not absence. */
function zeroRow(person: RosterPerson): Ranked {
  return {
    name: String(person.name ?? "").trim(),
    email: String(person.email ?? "").trim(),
    total: 0,
    active: 0,
    critical: 0,
    aged: 0,
    avgAgeDays: 0,
    severity: [],
    ...(person.designation ? { designation: person.designation } : {}),
    onRosterOnly: true,
  };
}

/**
 * The leaderboard, with the roster folded in.
 *
 * Aggregated rows keep their ranking and order — the roster never reshuffles
 * who is carrying the most. Members with no items are appended alphabetically
 * after them, because a zero has no rank to earn.
 *
 * Anyone on the roster who *does* have items keeps their aggregated row and
 * gains their designation from it; they are not duplicated.
 */
export function mergeRoster(assignees: Ranked[], roster: RosterPerson[]): Ranked[] {
  const rows = Array.isArray(assignees) ? assignees.map((a) => ({ ...a })) : [];
  const people = Array.isArray(roster) ? roster : [];

  const extras: Ranked[] = [];
  const seen = new Set<string>();

  // No cap here: `cleanMembers` already bounds a roster at write time, and
  // re-enforcing a storage rule inside a display function is how the two drift.
  for (const person of people) {
    const name = String(person?.name ?? "").trim();
    const email = String(person?.email ?? "").trim();
    // A roster row with neither is a blank line in the admin form, not a person.
    if (!name && !email) continue;

    // Guard against the same person listed twice across two PODs.
    const dedupe = key(email) || key(name);
    if (seen.has(dedupe)) continue;
    seen.add(dedupe);

    const match = findMatch(rows, person);
    if (match) {
      if (person.designation && !match.designation) match.designation = person.designation;
      continue;
    }
    extras.push(zeroRow({ ...person, name: name || email }));
  }

  extras.sort((a, b) => a.name.localeCompare(b.name));
  return [...rows, ...extras];
}
