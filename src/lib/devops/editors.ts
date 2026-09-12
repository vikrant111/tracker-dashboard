/**
 * Who may correct a DevOps record that already exists.
 *
 * Three different rights, and keeping them apart is the point:
 *
 *  - **read** the board — everyone signed in (see `access.ts`)
 *  - **add** a scope row — everyone, because the person who shipped a change is
 *    the one who knows what it was, and a sheet only some people can fill is a
 *    sheet nobody fills
 *  - **edit** an existing row — only people an admin has chosen, because a
 *    record is evidence once it is written and a quiet correction by anyone
 *    passing is how evidence stops being worth anything
 *
 * Admins always count as editors, so it never has to be granted to them.
 *
 * Pure, so the rule is checked without a session.
 */

export type EditorSubject = {
  role?: unknown;
  devopsEditor?: unknown;
  canClearData?: unknown;
} | null | undefined;

/** May this person change a record that already exists? */
export const canEditRecords = (user: EditorSubject): boolean =>
  user?.role === "admin" || user?.devopsEditor === true;

/**
 * The sentence shown when they may not.
 *
 * Names what to do about it. "Forbidden" tells somebody they are stuck; naming
 * the person who can grant it tells them who to ask.
 */
export const refuseEdit = (): string =>
  "Only people an admin has made a DevOps editor can change a record after it is saved. Ask an admin to add you.";

/**
 * May this person **clear data by date**?
 *
 * A fourth right, kept apart from the other three for the same reason they are
 * kept apart from each other: this one is the only irreversible act on either
 * board. Editing a record fixes a date somebody typed wrong; clearing a period
 * removes rows that are not coming back, and there is no backup anywhere in
 * this app.
 *
 * So it is **not** implied by being a DevOps editor. Somebody trusted to
 * correct a deploy date is not automatically somebody who should be able to
 * delete a quarter, and folding the two together would hand out the second
 * every time you meant the first.
 *
 * Admins always. Everybody else only when an admin has said so, one account at
 * a time.
 */
export const canClearData = (user: EditorSubject): boolean =>
  user?.role === "admin" || user?.canClearData === true;

/** The sentence shown when they may not. Names who can grant it. */
export const refuseClear = (): string =>
  "Clearing data is limited to admins and the accounts they allow. Ask an admin to grant it.";
