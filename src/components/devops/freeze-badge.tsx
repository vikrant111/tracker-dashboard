"use client";

/**
 * Whether a branch is open, frozen, or somewhere in between.
 *
 * The one thing a member comes to this board to find out, so it is readable at
 * a glance and never by colour alone: a lock, a tick, a spinner and a warning
 * triangle carry the state as well as the tint. Colourblind readers and a
 * washed-out projector both get the same answer — the rule the charts follow.
 */
import { motion } from "framer-motion";
import { AlertTriangle, Check, Loader2, Lock } from "lucide-react";
import { STATUS, STATUS_INK } from "@/lib/palette";
import type { FreezeState } from "@/lib/devops/types";
import { Tooltip } from "@/components/ui";

/*
 * Two colours per state, not one. `STATUS` is the mark — the border and the
 * tint, which only has to clear 3:1. `STATUS_INK` is the label, which a person
 * reads and so has to clear 4.5:1. Painting the text with the mark colour is
 * the mistake this pairing exists to prevent.
 */
const LOOK: Record<FreezeState, { label: string; hue: string; ink: string; Icon: typeof Lock; hint: string }> = {
  open: {
    label: "Open",
    hue: STATUS.good,
    ink: STATUS_INK.good,
    Icon: Check,
    hint: "Anyone with write access can push and merge.",
  },
  frozen: {
    label: "Frozen",
    hue: STATUS.critical,
    ink: STATUS_INK.critical,
    Icon: Lock,
    hint: "Locked on GitHub. Pushes and merges are refused until an admin unfreezes it.",
  },
  pending: {
    label: "Working",
    hue: STATUS.warning,
    ink: STATUS_INK.warning,
    Icon: Loader2,
    hint: "The change has been sent to GitHub and has not come back yet.",
  },
  failed: {
    label: "Failed",
    hue: STATUS.serious,
    ink: STATUS_INK.serious,
    Icon: AlertTriangle,
    hint: "GitHub refused the change. The branch is in whatever state it was already in.",
  },
};

export function FreezeBadge({
  state,
  reason,
  changedAt,
  changedBy,
  detail,
}: {
  state: FreezeState;
  reason?: string;
  changedAt?: string;
  changedBy?: string;
  detail?: string;
}) {
  const look = LOOK[state] ?? LOOK.open;
  const { Icon } = look;

  /*
   * The tooltip carries the story: why, who, and when. Putting that on the
   * badge itself would make every row three lines tall, and the state is what
   * people scan for — the reason is what they need once one row matters.
   */
  const when = changedAt ? new Date(changedAt).toLocaleString() : "";
  const story = [
    look.hint,
    reason && `Reason: ${reason}`,
    changedBy && when && `${changedBy} · ${when}`,
    state === "failed" && detail && `GitHub said: ${detail}`,
  ]
    .filter(Boolean)
    .join("\n");

  return (
    <Tooltip label={story}>
      <motion.span
        layout
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ type: "spring", stiffness: 420, damping: 28 }}
        className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold"
        style={{ borderColor: look.hue, color: look.ink, background: "var(--wash)" }}
      >
        <Icon size={13} className={state === "pending" ? "animate-spin" : ""} aria-hidden />
        {look.label}
      </motion.span>
    </Tooltip>
  );
}

/** The same states, for a legend or a filter. */
export const FREEZE_LOOK = LOOK;
