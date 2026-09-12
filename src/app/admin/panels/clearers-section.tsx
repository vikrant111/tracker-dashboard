"use client";

/**
 * Who may clear data by date.
 *
 * The same grant list as the DevOps editors, configured for the one capability
 * that is irreversible. It is kept apart from every other right on purpose:
 * editing a record fixes a date somebody typed wrong, while clearing a period
 * removes rows that are not coming back, and there is no backup anywhere in
 * this app. Folding the two together would hand out the delete every time you
 * meant the correction.
 *
 * It lives in POD admin rather than DevOps admin because the capability covers
 * both boards — work items and DevOps rows alike.
 */
import { EditorsSection } from "./editors-section";

export function ClearersSection({ flash }: { flash: (text: string, tone?: "ok" | "bad") => void }) {
  return (
    <EditorsSection
      flash={flash}
      field="canClearData"
      eyebrow="Housekeeping"
      title="Who can clear data"
      hint="Clearing a period cannot be undone. There is no backup."
      granted="can now clear data by date"
      revoked="can no longer clear data"
      explain={{
        admin: "Admins can always clear data. There is nothing to grant.",
        on: (who) => `Take away ${who}'s ability to clear data. This is the only irreversible act on either board.`,
        off: (who) => `Let ${who} clear data by date. It cannot be undone and there is no backup.`,
      }}
    />
  );
}
