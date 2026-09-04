/**
 * Whether a user may see a POD.
 *
 * Its own module, and pure, so the check suite can exercise it directly. It
 * lived in `session.ts`, which imports the whole auth stack — so the only way
 * to test this one line was through a running server with a deliberately
 * corrupted record written straight into the database, which is both slow and
 * driver-specific.
 */

export type TeamAccess = { role: string; teamIds: unknown };

/**
 * **`Array.isArray` is the guard, and it is not decoration.**
 *
 * A `teamIds` stored as a bare string survives `.includes(teamId)` as a
 * *substring* test — so a user holding `"amc-pod-archive"` would be granted
 * `amc-pod`, a POD nobody assigned them. `saveUser` coerces to an array on the
 * write path, but that does nothing for records already stored, or written by
 * an older version, or edited by hand in a JSON file. This is the layer that
 * holds for those.
 */
export function canSeeTeam(user: TeamAccess, teamId: string): boolean {
  if (user.role === "admin") return true;
  return Array.isArray(user.teamIds) && user.teamIds.includes(teamId);
}
