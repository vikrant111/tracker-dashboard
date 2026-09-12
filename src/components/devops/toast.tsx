"use client";

/**
 * The one-line confirmation after something happened.
 *
 * Its own component because three screens show one and they must look and
 * behave identically — a second copy is how "Saved." ends up in two places with
 * two different colours.
 */
import { AnimatePresence, motion } from "framer-motion";

export function Toast({ toast }: { toast: { text: string; tone: "ok" | "bad" } | null }) {
  return (
    <AnimatePresence>
      {toast && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 20 }}
          role="status"
          className="fixed bottom-5 left-1/2 z-[95] -translate-x-1/2 rounded-xl border px-4 py-2.5 text-sm shadow-lg"
          style={{
            borderColor: toast.tone === "bad" ? "var(--st-critical)" : "var(--st-good)",
            background: "var(--panel)",
            color: toast.tone === "bad" ? "var(--st-critical-ink)" : "var(--ink)",
          }}
        >
          {toast.text}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
