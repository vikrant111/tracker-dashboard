"use client";

/**
 * A panel that hangs off a trigger and is not clipped by anything.
 *
 * Every `Panel` on this board is `overflow-hidden`, and framer-motion gives
 * each one a transform, so an `absolute` popover inside one gets cut at the
 * panel edge and can end up painted underneath the table it is meant to cover.
 * That is exactly what the date picker did.
 *
 * So it renders through a portal at `position: fixed`, measured from the
 * trigger — the same approach `Tooltip` already uses, for the same reason.
 *
 * It started under `devops/` and moved here when the board's date picker
 * needed it too: the trend card clipped its calendar for exactly the reason
 * above, and a second hand-rolled copy would have been a second set of
 * flipping, scroll and outside-click bugs to find.
 *
 * It also flips to stay on screen: a picker opened from a control on the right
 * of a wide panel would otherwise open off the edge of the window.
 */
import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

/** Room to leave against the window edge, so nothing touches the sides. */
const MARGIN = 8;

export function Popover({
  open,
  onClose,
  trigger,
  /* Never wider than the window, or a phone gets a panel it cannot see the
     edge of. The caller asks for a width; this is what it may actually have. */
  width = 304,
  children,
}: {
  open: boolean;
  onClose: () => void;
  /** The element to hang off. */
  trigger: HTMLElement | null;
  width?: number;
  children: ReactNode;
}) {
  const [at, setAt] = useState<{ top: number; left: number } | null>(null);
  const [mounted, setMounted] = useState(false);
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => setMounted(true), []);

  // Measured before paint, so it never appears in the wrong place first.
  useLayoutEffect(() => {
    if (!open || !trigger) return setAt(null);

    const place = () => {
      const rect = trigger.getBoundingClientRect();
      const height = panel.current?.offsetHeight ?? 340;

      // Left-aligned to the trigger, pulled back when that would overflow.
      const w = Math.min(width, window.innerWidth - MARGIN * 2);
      const left = Math.max(MARGIN, Math.min(rect.left, window.innerWidth - w - MARGIN));
      // Below, unless there is more room above — which is the case for a
      // control near the bottom of a long page.
      const below = rect.bottom + 6;
      const fitsBelow = below + height <= window.innerHeight - MARGIN;
      const top = fitsBelow ? below : Math.max(MARGIN, rect.top - height - 6);

      setAt({ top, left });
    };

    place();
    // Reposition rather than drift: the page scrolls under a fixed element.
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, [open, trigger, width]);

  /* Escape closes, and so does a click anywhere outside. */
  useEffect(() => {
    if (!open) return;

    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    const away = (e: MouseEvent) => {
      const target = e.target as Node;
      if (!panel.current?.contains(target) && !trigger?.contains(target)) onClose();
    };

    document.addEventListener("keydown", key);
    // Capture, so a click on a button that stops propagation still closes this.
    document.addEventListener("mousedown", away, true);
    return () => {
      document.removeEventListener("keydown", key);
      document.removeEventListener("mousedown", away, true);
    };
  }, [open, onClose, trigger]);

  /*
   * Nothing at all until the client has mounted.
   *
   * `createPortal` throws outright in a static render — "Portals are not
   * currently supported by the server renderer" — and this was reached by
   * every card that merely *contains* a picker, open or not. Checking
   * `typeof document` was not enough: a static render in a jsdom process has
   * a `document`. A mount flag is the thing that is only ever true on the
   * client, and it keeps the exit animation, which returning null on `!open`
   * would throw away.
   */
  if (!mounted) return null;

  return createPortal(
    <AnimatePresence>
      {open && at && (
        <motion.div
          ref={panel}
          initial={{ opacity: 0, y: -6, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -4, scale: 0.98 }}
          transition={{ type: "spring", stiffness: 420, damping: 32 }}
          style={{ top: at.top, left: at.left, width: `min(${width}px, calc(100vw - ${MARGIN * 2}px))` }}
          className="fixed z-[90] rounded-xl border border-[var(--hairline)] bg-[var(--panel)] p-3 shadow-2xl"
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
