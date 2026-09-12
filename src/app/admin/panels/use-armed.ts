"use client";

/**
 * A destructive control that asks once before it acts.
 *
 * The first press arms the button and changes its label; the second does the
 * thing. Arming expires on its own, so a button left armed by a stray click
 * does not stay dangerous — someone coming back to the tab a minute later finds
 * "Delete", not "Delete it?" waiting under their cursor.
 *
 * Keyed by a string, so one hook serves every row on the screen and arming one
 * disarms the rest.
 */
import { useEffect, useState } from "react";
import { TIMING } from "@/lib/constants";

export function useArmed() {
  const [armed, setArmed] = useState<string | null>(null);

  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(null), TIMING.confirmMs);
    return () => clearTimeout(t);
  }, [armed]);

  /** Run on the second press for this key; arm on the first. */
  const confirmThen = (key: string, run: () => void) => {
    if (armed === key) {
      setArmed(null);
      run();
      return;
    }
    setArmed(key);
  };

  return { armed, setArmed, confirmThen };
}
