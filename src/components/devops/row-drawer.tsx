"use client";

/**
 * The panel that slides out from under a table row.
 *
 * It animates its **height**, which is the whole point. The first version
 * appeared at full size in one frame while a `motion.div` faded and slid four
 * pixels, so the table jumped under the cursor and the eye lost the row it had
 * just clicked — the animation played *after* the jolt it was supposed to
 * soften.
 *
 * A height is not known until it renders, and there are two ways to animate to
 * one. This uses framer-motion's `height: "auto"`, which measures the content
 * and animates a real pixel height.
 *
 * The other way is CSS `grid-template-rows: 0fr → 1fr`, which needs no
 * JavaScript — and it is what this did first. Two things made it the wrong
 * choice here, and both are silent failures rather than visible ones:
 *
 *  1. **Support.** Interpolating `grid-template-rows` needs Chrome 107,
 *     Firefox 127 or Safari 17.4. Anything older gets no animation at all —
 *     not a degraded one, none — and nothing says so.
 *  2. **The reduced-motion rule.** `globals.css` zeroes
 *     `animation-duration` on `*` with `!important` under
 *     `prefers-reduced-motion`. That is the right policy, but it takes the CSS
 *     animation with it on any machine with the setting on, which is common and
 *     easy to forget while debugging "it does not animate".
 *
 * framer-motion is already a dependency and already measures heights for the
 * rest of this board, so this costs no bundle and behaves the same everywhere.
 * `useReducedMotion` keeps the policy the CSS rule was expressing.
 *
 * Opening only. The row unmounts the instant it is closed, deliberately: a
 * drawer that lingers on the way out keeps stale fields on screen while the
 * reader has already moved on, and it stops the table settling. There is no
 * `AnimatePresence` anywhere near this — the detail row is a plain `<tr>`, and
 * presence tracking watches a non-motion child for an exit it can never finish,
 * which once held the old row set and made expanding do nothing at all.
 *
 * Shared by both tables, so a row that opens smoothly on one cannot be the row
 * that snaps on the other.
 */
import { motion, useReducedMotion } from "framer-motion";
import type { ReactNode } from "react";
import { DEVOPS_MOTION } from "@/lib/devops/constants";

export function RowDrawer({ children }: { children: ReactNode }) {
  const reduced = useReducedMotion();

  return (
    <motion.div
      /*
       * `overflow: hidden` is what makes a partial height show a partial
       * drawer rather than the whole thing spilling over the row below it.
       */
      style={{ overflow: "hidden" }}
      /*
       * Reduced motion fades, it does not freeze. Dropping the animation
       * altogether leaves the drawer appearing in one frame — the jolt this
       * component exists to remove, delivered to the people least likely to
       * want it. The house rule is the same everywhere on this board: keep the
       * opacity, drop the movement. See `ui/menu.tsx`.
       */
      initial={reduced ? { opacity: 0 } : { height: 0, opacity: 0 }}
      animate={reduced ? { opacity: 1 } : { height: "auto", opacity: 1 }}
      transition={{ duration: DEVOPS_MOTION.rowOpenMs / 1000, ease: DEVOPS_MOTION.easeCurve }}
    >
      {children}
    </motion.div>
  );
}

/**
 * The chevron's turn, matched to the drawer.
 *
 * A plain CSS transition, which every browser has had for a decade — and a
 * shared helper rather than a literal in two files, because the arrow and the
 * panel are one gesture and two durations read as two things happening.
 */
export const chevronStyle = (open: boolean): React.CSSProperties => ({
  transform: open ? "rotate(90deg)" : "rotate(0deg)",
  transition: `transform ${DEVOPS_MOTION.chevronMs}ms ${DEVOPS_MOTION.ease}`,
});
