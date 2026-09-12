"use client";

/**
 * How many PODs are registered on a repository, and which ones.
 *
 * The count is the thing people scan for — "is this repo one team's or five?" —
 * and the names are the follow-up question, so the count is a button and the
 * names are behind it. Putting five chips in the bar wrapped the controls onto
 * a second line for a fact most readers only want the shape of.
 *
 * A native `<dialog>`, opened with `showModal()`. It brings the focus trap, the
 * Escape key, the backdrop and the inertness of everything behind it — all four
 * of which this would otherwise have had to reimplement, and three of which are
 * the kind of thing that gets reimplemented slightly wrong.
 */
import { Users, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui";

export function PodsModal({
  repoName,
  pods,
}: {
  /** The repository the PODs belong to, for the title. */
  repoName: string;
  /** The PODs registered on it. */
  pods: { id: string; name: string }[];
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);

  const list = Array.isArray(pods) ? pods : [];
  const count = list.length;

  /*
   * `showModal()` rather than the `open` attribute: only the method gives the
   * top layer, the `::backdrop`, the focus trap and Escape. React cannot set it
   * declaratively, so the state drives the call.
   */
  useEffect(() => {
    const el = dialog.current;
    if (!el) return;

    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  return (
    <>
      <Button
        onClick={() => setOpen(true)}
        disabled={count === 0}
        title={
          count === 0
            ? "No POD is linked to this repository yet. An admin links them in DevOps admin."
            : `Show the ${count} ${count === 1 ? "POD" : "PODs"} registered on ${repoName}`
        }
        aria-haspopup="dialog"
      >
        <Users size={14} />
        {count} {count === 1 ? "POD" : "PODs"}
      </Button>

      <dialog
        ref={dialog}
        /* Escape and a click on the backdrop both close it, and both have to go
           through state or the next `showModal()` never fires. */
        onClose={() => setOpen(false)}
        onClick={(e) => { if (e.target === dialog.current) setOpen(false); }}
        aria-label={`PODs registered on ${repoName}`}
        /* `--scrim` rather than a black at some opacity: the drawer behind the
           POD board already uses it, and it is themed for both palettes. */
        className="glass m-auto w-[min(30rem,calc(100vw-2rem))] rounded-2xl p-0 text-[var(--ink)] backdrop:bg-[var(--scrim)] backdrop:backdrop-blur-[3px]"
      >
        <div className="flex items-start gap-3 border-b border-[var(--hairline)] px-4 py-3">
          <span>
            <span className="eyebrow">Registered on {repoName}</span>
            <h2 className="font-[family-name:var(--font-display)] text-base font-semibold tracking-tight">
              {count} {count === 1 ? "POD" : "PODs"}
            </h2>
          </span>

          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Close"
            className="ml-auto rounded-md p-1 text-[var(--ink-muted)] transition-colors hover:text-[var(--ink)]"
          >
            <X size={16} />
          </button>
        </div>

        <div className="flex flex-wrap gap-2 px-4 py-4">
          {list.map((pod) => (
            <span
              key={pod.id}
              className="rounded-lg border border-[var(--hairline)] bg-[var(--wash)] px-2.5 py-1 text-xs font-medium"
            >
              {pod.name}
            </span>
          ))}
        </div>

        <p className="border-t border-[var(--hairline)] px-4 py-3 text-xs text-[var(--ink-muted)]">
          A row on this sheet belongs to one of these. An admin changes the list in
          DevOps admin → Repositories.
        </p>
      </dialog>
    </>
  );
}
