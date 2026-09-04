/**
 * Never leave the instance with nobody who can administer it.
 *
 * Demoting the last admin is a one-way door: the moment the change lands, every
 * admin route answers "Admins only." — including the one that would put the
 * role back. The only way out is editing the store by hand, which on a
 * production database means somebody with shell access and a good afternoon.
 *
 * Pure and its own module, so the rule is exercised directly rather than by
 * locking a real instance out to see whether it complains.
 */

export type Account = { email: string; role: string };

/** How many admins remain if `email` stops being one. */
export function adminsAfter(users: Account[], email: string): number {
  const target = email.trim().toLowerCase();
  return users.filter((u) => u.role === "admin" && u.email.trim().toLowerCase() !== target).length;
}

/**
 * May this account stop being an admin — by demotion or deletion?
 *
 * Returns a sentence when it may not, so the caller has nothing to phrase.
 * Deliberately counts *other* admins rather than trusting a total: demoting
 * somebody who is already a member must never be blocked, however few admins
 * there are.
 */
export function refuseIfLastAdmin(
  users: Account[],
  email: string,
  action: "demote" | "delete",
): string | null {
  const target = email.trim().toLowerCase();
  const isAdmin = users.some((u) => u.role === "admin" && u.email.trim().toLowerCase() === target);
  if (!isAdmin) return null;
  if (adminsAfter(users, email) > 0) return null;

  return action === "demote"
    ? "This is the only admin. Make somebody else an admin first, or there would be nobody left who can."
    : "This is the only admin. Make somebody else an admin first — deleting this account would leave nobody who can administer the instance.";
}
