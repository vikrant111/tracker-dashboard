"use client";

/**
 * The controls above a scope sheet: download it, freeze it, add to it.
 *
 * Split from the panel to keep each file a length somebody reads in one go.
 *
 * The downloads are plain links rather than buttons that fetch. A link lets the
 * browser stream the file and name it from the response, and it keeps working
 * if the JavaScript on the page has not finished loading. They carry the
 * filter box as well as the cycle, so the file holds the rows on screen and not
 * the whole sheet.
 */
import { Download, Lock, LockOpen, Plus } from "lucide-react";
import type { Cycle } from "@/lib/devops/types";
import { cleanQuery } from "@/lib/devops/table";
import { Button, Tooltip } from "@/components/ui";

export function ScopeActions({
  cycle,
  query,
  isAdmin,
  busy,
  showAdd,
  onAdd,
  onFreeze,
}: {
  cycle: Cycle | undefined;
  /** What is in the filter box, so the download matches the screen. */
  query: string;
  isAdmin: boolean;
  busy: boolean;
  showAdd: boolean;
  onAdd: () => void;
  onFreeze: (frozen: boolean) => void;
}) {
  /* Nothing to download, freeze or add to without a cycle. */
  if (!cycle) return null;

  /** The cycle and the filter, as the export route expects them. */
  const href = (format?: string) => {
    const params = new URLSearchParams({ cycleId: cycle.id });
    const q = cleanQuery(query);
    if (q) params.set("q", q);
    if (format) params.set("format", format);
    return `/api/deployments/export?${params.toString()}`;
  };

  const filtered = cleanQuery(query) ? " Only the rows matching the filter." : "";

  return (
    <span className="flex flex-wrap items-center gap-2">
      <Tooltip label={`Download this sheet as .xlsx, with each bug's current severity and status from the POD board.${filtered}`}>
        <a href={href()} download>
          <Button>
            <Download size={14} />
            Excel
          </Button>
        </a>
      </Tooltip>

      <Tooltip label={`The same sheet as CSV, for anyone without Excel.${filtered}`}>
        <a href={href("csv")} download>
          <Button>CSV</Button>
        </a>
      </Tooltip>

      {isAdmin && (
        <Tooltip
          label={
            cycle.scope.frozen
              ? "Reopen the sheet so rows can be added again."
              : "Freeze the scope. Nobody can add, edit or remove rows for this cycle — including you, and including a pull request being moved onto it."
          }
        >
          <Button onClick={() => onFreeze(!cycle.scope.frozen)} disabled={busy}>
            {cycle.scope.frozen ? <LockOpen size={14} /> : <Lock size={14} />}
            {cycle.scope.frozen ? "Reopen scope" : "Freeze scope"}
          </Button>
        </Tooltip>
      )}

      {showAdd && !cycle.scope.frozen && (
        <Button variant="primary" onClick={onAdd}>
          <Plus size={14} />
          Add a row
        </Button>
      )}
    </span>
  );
}
