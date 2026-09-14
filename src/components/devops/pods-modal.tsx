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
import { useScrollLock } from "@/components/use-scroll-lock";
import { Button } from "@/components/ui";

export function PodsModal({
  repoName,
  pods,
  compact = false,
}: {
  /** The repository the PODs belong to, for the title. */
  repoName: string;
  /** The PODs registered on it. */
  pods: { id: string; name: string }[];
  /** In a table cell the trigger is a count, not a button-sized control. */
  compact?: boolean;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);

  /* A modal dialog takes the top layer but does not stop the page scrolling
     behind it. See `use-scroll-lock`. */
  useScrollLock(open);

  /*
   * Guarded, because this renders a keyed list from stored data. `podsOfRepo`
   * already cleans what it hands over, but this component is public and a
   * caller can reach it with anything.
   */
  const list = (Array.isArray(pods) ? pods : []).filter(
    (p): p is { id: string; name: string } => Boolean(p) && typeof p.id === "string" && p.id.trim() !== "",
  );
  const count = list.length;

  /*
   * `showModal()` rather than the `open` attribute: only the method gives the
   * top layer, the `::backdrop`, the focus trap and Escape. React cannot set it
   * declaratively, so the state drives the call.
   */
  useEffect(() => {
    const el = dialog.current;
    if (!el) return;

    /*
     * Both calls can throw, and a throw here is an unhandled error inside an
     * effect — which takes the whole board down, not just the dialog.
     * `showModal()` throws if the element is already open or not in the
     * document, and it is simply absent on a browser without `<dialog>`. A POD
     * list that will not open is a disappointment; a blank page is a bug.
     */
    try {
      if (open && !el.open) el.showModal?.();
      if (!open && el.open) el.close?.();
    } catch {
      /* Leave it shut. The count, which is the answer most people want, still
         reads correctly on the row. */
    }
  }, [open]);

  return (
    <>
      {/*
        * Nothing linked is a fact, not a control. A disabled button invites a
        * press that can never do anything; the words say it instead.
        */}
      {count === 0 ? (
        <span className="text-xs text-[var(--ink-muted)]" title={`No POD is linked to ${repoName} yet. An admin links them in DevOps admin.`}>
          Not linked
        </span>
      ) : compact ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-haspopup="dialog"
          title={`Show the ${count} ${count === 1 ? "POD" : "PODs"} registered on ${repoName}`}
          className="inline-flex items-center gap-1.5 rounded-md border border-[var(--hairline)] bg-[var(--wash)] px-2 py-1 text-xs font-medium tabular-nums text-[var(--ink)] transition-colors hover:border-[var(--accent-line)] hover:text-[var(--accent-ink)]"
        >
          <Users size={12} aria-hidden />
          {count}
        </button>
      ) : (
        <Button
          onClick={() => setOpen(true)}
          title={`Show the ${count} ${count === 1 ? "POD" : "PODs"} registered on ${repoName}`}
          aria-haspopup="dialog"
        >
          <Users size={14} />
          {count} {count === 1 ? "POD" : "PODs"}
        </Button>
      )}

      <dialog
        ref={dialog}
        /* Escape and a click on the backdrop both close it, and both have to go
           through state or the next `showModal()` never fires. */
        onClose={() => setOpen(false)}
        onClick={(e) => { if (e.target === dialog.current) setOpen(false); }}
        aria-label={`PODs registered on ${repoName}`}
        /* `--scrim` rather than a black at some opacity: the drawer behind the
           POD board already uses it, and it is themed for both palettes. */
        /*
         * `fixed inset-0 m-auto h-fit` centres it without depending on the UA
         * stylesheet surviving. A modal dialog is centred by the browser's own
         * `margin: auto`, and the CSS reset sets `margin: 0` on *everything* —
         * so the default is gone and the dialog opens against the top-left
         * corner. Stating all four insets and letting `margin: auto` share the
         * leftover space is the part that does not depend on anybody's defaults.
         *
         * `h-fit` matters with `inset-0`: without it a box with both top and
         * bottom pinned stretches to the full height, and there is no free
         * space left for `auto` to centre with.
         */
        className="glass fixed inset-0 m-auto h-fit max-h-[calc(100dvh-2rem)] w-[min(30rem,calc(100vw-2rem))] overflow-hidden rounded-2xl p-0 text-[var(--ink)] backdrop:bg-[var(--scrim)] backdrop:backdrop-blur-[3px]"
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

        {/* Scrolls rather than growing past the window: a repo with forty PODs
            must not push the close button off the screen. */}
        <div className="flex max-h-[60vh] flex-wrap gap-2 overflow-y-auto px-4 py-4">
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
