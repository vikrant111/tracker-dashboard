/**
 * Taking a row back off the scope sheet.
 *
 * A row that came from a pull request is not simply deleted: the pull request
 * has to hear about it. It goes back to the sign-off report so it can be moved
 * again, and it carries the remark explaining why — otherwise the person who
 * moved it sees it reappear with no idea whether to fix something or pull the
 * code out of the release branch.
 *
 * Pure, so the rule is checked without a store.
 */

/** How much explanation is enough to be worth reading. */
export const MIN_REMARKS = 4;

/**
 * `null` when the removal may go ahead, otherwise why not.
 *
 * A remark is required only for a row that came from a pull request. A row
 * somebody typed in by hand has nobody waiting to hear about it, and demanding
 * a sentence to delete a typo is friction with no reader.
 */
export function refuseRemoval(
  row: { pullId?: string } | null | undefined,
  remarks: unknown,
): string | null {
  if (!row?.pullId) return null;

  const said = String(remarks ?? "").trim();
  if (said.length < MIN_REMARKS) {
    return "Say why you are taking this off the sheet. It goes back to the sign-off report and whoever moved it will read this.";
  }
  return null;
}

/** The pull request, handed back to the report with the remark attached. */
export function returnedPull<T extends object>(
  pr: T,
  by: string,
  remarks: unknown,
  at: string,
): T & { movedToScope: boolean; returned: { at: string; by: string; remarks: string } } {
  return {
    ...pr,
    // Back on the report, and movable again once whatever was wrong is fixed.
    movedToScope: false,
    returned: { at, by, remarks: String(remarks ?? "").trim().slice(0, 1000) },
  };
}
