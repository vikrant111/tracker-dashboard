/**
 * The join between a pull request and the scope row it was moved into.
 *
 * `movedToScope` used to be nothing but a stored flag, and a stored flag drifts.
 * A row moved by an older build carried no link back to its pull request, so
 * removing it deleted the row and left the PR marked as moved forever — off the
 * sign-off report, absent from every scope sheet, and invisible to everybody.
 *
 * So the flag is no longer believed on its own. What is true is whether a scope
 * row for that pull request exists, and that is a join anyone can recompute.
 * The stored flag is still written, because the sync path reads it, but the
 * report derives the answer and self-heals whatever it finds.
 *
 * Pure, and client-safe: the sheet's button and the API ask the same functions.
 */

/** A scope row, as much of one as this join needs. */
type Row = { pullId?: string; prUrl?: string };
/** A pull request, likewise. */
type Pull = { id?: string; url?: string };

/**
 * A pull request URL, reduced to what identifies it.
 *
 * GitHub answers to more than one spelling of the same pull request — a
 * trailing slash, `/files`, a `#discussion` anchor, http against https. Two
 * spellings of one URL must not read as two different changes.
 */
export function sameLink(a: unknown, b: unknown): boolean {
  const trim = (u: unknown) =>
    String(u ?? "")
      .trim()
      .toLowerCase()
      .replace(/^https?:\/\//, "")
      .replace(/[#?].*$/, "")
      .replace(/\/(files|commits|checks)\/?$/, "")
      .replace(/\/+$/, "");

  const left = trim(a);
  return left !== "" && left === trim(b);
}

/**
 * Is this scope row the one that pull request was moved into?
 *
 * The id first, because it is the link the move writes and a URL somebody
 * edited by hand is a link that quietly stops working. The URL second, because
 * rows written before the id existed have nothing else to match on.
 */
export function linksTo(row: Row, pr: Pull): boolean {
  if (row.pullId && pr.id) return row.pullId === pr.id;
  return sameLink(row.prUrl, pr.url);
}

/**
 * The id a scope row *should* be carrying, given the pull requests there are.
 *
 * Empty when the row already has one, or when its URL matches nothing on the
 * report — a URL someone typed into the form by hand is not a move, and must
 * not start behaving like one.
 */
export function idForRow(row: Row, pulls: Pull[]): string {
  if (row.pullId) return "";
  if (!row.prUrl) return "";
  return pulls.find((pr) => sameLink(row.prUrl, pr.url))?.id ?? "";
}

/**
 * Whether each pull request is on a scope sheet, worked out rather than
 * remembered.
 *
 * A PR whose row was removed comes back to the report; one whose row is there
 * stays off it. Either way the answer matches what somebody would see if they
 * went and looked at the sheet.
 */
export function movedPulls<T extends Pull & { movedToScope?: boolean }>(
  pulls: T[],
  rows: Row[],
): T[] {
  return pulls.map((pr) => {
    const on = rows.some((row) => linksTo(row, pr));
    return on === Boolean(pr.movedToScope) ? pr : { ...pr, movedToScope: on };
  });
}
