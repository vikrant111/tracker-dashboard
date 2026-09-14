"use client";

/**
 * The POD column of a row, on either table.
 *
 * A name when the row says which POD it is for — which is the normal case, and
 * a count of one would be worse in every way. A **count** only when the row
 * predates the field and the best that can be said is "one of the
 * repository's": that used to render as every name joined with commas, which on
 * a repo with five teams is a paragraph in a column somebody is scanning.
 *
 * The rule lives in `lib/devops/pods.ts`, so the scope sheet and the sign-off
 * report cannot answer the same question differently.
 */
import { podCell } from "@/lib/devops/pods";
import { PodsModal } from "./pods-modal";

export function PodCell({
  teamId,
  pods,
  repoName,
}: {
  /** The POD this row says it is for, when it says. */
  teamId: string | undefined;
  /** The PODs its repository has. */
  pods: { id: string; name: string }[];
  /** For the dialog's title, when there is one to open. */
  repoName: string;
}) {
  const cell = podCell(teamId, pods);

  if (cell.kind === "own") return <>{cell.name}</>;

  /* Greyed, because it is an inference about an old row rather than something
     that row actually says. */
  if (cell.kind === "none") return <span className="text-[var(--ink-muted)]">Not linked</span>;

  return (
    <span className="text-[var(--ink-muted)]" title={`This row predates the POD field. It belongs to one of ${repoName}'s PODs.`}>
      <PodsModal repoName={repoName} pods={cell.pods} compact />
    </span>
  );
}
