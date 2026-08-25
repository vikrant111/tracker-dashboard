"use client";

/**
 * The "For you" menu: a real `role="menu"` with roving focus, an outside-press
 * close, and a panel that nudges itself back inside the viewport.
 */
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ChevronDown } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { MenuContext } from "./menu-context";
// The menu trigger and its items are buttons; the shared one carries the theme.
import { Button } from "./controls";

/**
 * A dropdown menu.
 *
 * The top bar grew to nine controls, which is more than a header can carry and
 * far more than a phone can. This collects the actions behind one trigger, and
 * it is a real menu rather than a div that toggles: `aria-haspopup`, roving
 * arrow keys, Escape returning focus to the trigger, and dismissal on an
 * outside press. A menu you cannot leave with the keyboard is a trap.
 */

export function Menu({
  label,
  icon,
  children,
  align = "right",
}: {
  label: string;
  icon?: ReactNode;
  children: ReactNode;
  align?: "left" | "right";
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();

  /**
   * How far to nudge the panel back into view.
   *
   * Anchoring to the trigger is only right while the trigger is where you
   * expect. On a phone it sits at the *left* of the bar, so a right-anchored
   * panel 19rem wide hangs off the left edge of the screen and its labels are
   * cut in half — which is exactly what happened.
   *
   * The anchor below handles the common case; this handles the rest. Measured
   * before paint, so the panel is never seen in the wrong place.
   */
  const [shift, setShift] = useState(0);

  useLayoutEffect(() => {
    if (!open) {
      setShift(0);
      return;
    }

    const fit = () => {
      const el = panel.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      // `clientWidth`, not `innerWidth`: the scrollbar is not usable space.
      const viewport = document.documentElement.clientWidth;
      const margin = 12;

      let dx = 0;
      if (rect.left < margin) dx = margin - rect.left;
      else if (rect.right > viewport - margin) dx = viewport - margin - rect.right;
      // The rect already includes whatever shift is applied, so this converges
      // rather than compounding.
      if (dx) setShift((current) => current + dx);
    };

    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, [open]);

  useEffect(() => {
    if (!open) return;

    // `pointerdown`, not `click`: a click fires after the button it landed on
    // has already run, so a press outside would act *and* leave the menu open.
    const onPointerDown = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        setOpen(false);
        // Focus goes back where it came from, or it lands on `<body>` and the
        // next Tab starts from the top of the page.
        trigger.current?.focus();
        return;
      }
      if (e.key !== "ArrowDown" && e.key !== "ArrowUp" && e.key !== "Home" && e.key !== "End") return;

      const items = [...(panel.current?.querySelectorAll<HTMLElement>("[data-menuitem]:not([disabled])") ?? [])];
      if (!items.length) return;
      e.preventDefault();

      const here = items.indexOf(document.activeElement as HTMLElement);
      const next =
        e.key === "Home" ? 0
        : e.key === "End" ? items.length - 1
        : e.key === "ArrowDown" ? (here + 1) % items.length
        : (here - 1 + items.length) % items.length;
      items[next]?.focus();
    };

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  // Opening with the keyboard should land on the first item; opening with a
  // pointer should not steal the cursor's place.
  const openWith = (focusFirst: boolean) => {
    setOpen(true);
    if (!focusFirst) return;
    requestAnimationFrame(() => {
      panel.current?.querySelector<HTMLElement>("[data-menuitem]:not([disabled])")?.focus();
    });
  };

  return (
    <div ref={root} className="relative">
      <Button
        onClick={() => (open ? setOpen(false) : openWith(false))}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ") {
            if (!open) {
              e.preventDefault();
              openWith(true);
            }
          }
        }}
        ref={trigger}
        aria-haspopup="menu"
        aria-expanded={open}
        className={open ? "bg-[var(--wash-2)]" : ""}
      >
        {icon}
        <span className="hidden sm:inline">{label}</span>
        <ChevronDown
          size={14}
          aria-hidden
          className={`transition-transform duration-200 ${open ? "rotate-180" : ""}`}
        />
      </Button>

      <AnimatePresence>
        {open && (
          <motion.div
            ref={panel}
            role="menu"
            aria-label={label}
            initial={reduced ? { opacity: 0, x: shift } : { opacity: 0, y: -6, scale: 0.97, x: shift }}
            animate={reduced ? { opacity: 1, x: shift } : { opacity: 1, y: 0, scale: 1, x: shift }}
            exit={reduced ? { opacity: 0 } : { opacity: 0, y: -4, scale: 0.98 }}
            transition={{ type: "spring", stiffness: 420, damping: 32, mass: 0.6 }}
            style={{ transformOrigin: align === "right" ? "top right" : "top left" }}
            /*
             * Solid, not glass. A menu that you can read the dashboard through
             * is unreadable — `--panel` is the token for exactly this: "solid
             * popovers, drawers, menus". Glass is for surfaces you look *at*,
             * not for ones that sit temporarily on top of other content.
             *
             * The anchor flips by breakpoint because the trigger does: it is at
             * the left of the bar on a phone and near the right on a desktop, so
             * a single anchor sends the panel off one edge or the other.
             *
             * Width is capped against the viewport as well as set — a fixed
             * 19rem panel does not fit a 320px screen at all.
             */
            className={`absolute top-full z-40 mt-2 flex w-[min(19rem,calc(100vw-1.5rem))] flex-col gap-1 rounded-2xl border border-[var(--glass-border)] bg-[var(--panel)] p-2 shadow-[var(--glass-shadow)] ${
              align === "right" ? "left-0 sm:right-0 sm:left-auto" : "left-0"
            }`}
          >
            <MenuContext.Provider value={{ close: () => setOpen(false) }}>{children}</MenuContext.Provider>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
