"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { KeyRound, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { validatePasswordChange } from "@/lib/validation";
import { useFocusTrap } from "./use-focus-trap";
import { Button, PasswordField } from "./ui";

/**
 * Changing your own password.
 *
 * A dialog rather than a page: it is a rare, self-contained errand, and pulling
 * somebody off the board to a settings route for three fields would lose their
 * place for no gain.
 *
 * The current password is asked for **because the server demands it**, not as
 * ceremony. A live session is not proof that the person at the keyboard is the
 * account holder — an unlocked laptop would otherwise be a complete takeover.
 */
export function ChangePassword({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const reduced = useReducedMotion();
  const first = useRef<HTMLInputElement>(null);
  const panel = useRef<HTMLDivElement>(null);

  // Every field is cleared on the way in and on the way out. A password left in
  // a React state that a later render could show is a password on screen.
  useEffect(() => {
    if (open) {
      setCurrent("");
      setNext("");
      setConfirm("");
      setError(null);
      setDone(false);
      // After the entrance, or the browser scrolls the dialog while it moves.
      const id = setTimeout(() => first.current?.focus(), reduced ? 0 : 180);
      return () => clearTimeout(id);
    }
  }, [open, reduced]);

  useFocusTrap(open, panel, onClose);

  const submit = async () => {
    // The same rules the server runs, run here first so the reader is told
    // what is wrong without a round trip. The server still decides.
    const problem = validatePasswordChange({ current, next, confirm });
    if (problem) {
      setError(problem);
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/account/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // `confirm` is not sent: the server has no use for it, and the fewer
        // copies of a password cross the wire the better.
        body: JSON.stringify({ current, next }),
      });
      const json = await res.json().catch(() => null);

      if (!res.ok) {
        setError(json?.error ?? "Could not change the password.");
        return;
      }

      // Cleared the moment it is no longer needed, not when the dialog closes.
      setCurrent("");
      setNext("");
      setConfirm("");
      setDone(true);
    } catch {
      setError("Could not reach the server. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={reduced ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={reduced ? { opacity: 1 } : { opacity: 0 }}
          transition={{ duration: 0.16 }}
          className="fixed inset-0 z-[90] grid place-items-center bg-[color-mix(in_srgb,var(--plane)_72%,transparent)] p-4 backdrop-blur-sm"
          onPointerDown={(e) => e.target === e.currentTarget && onClose()}
        >
          <motion.div
            ref={panel}
            role="dialog"
            aria-modal="true"
            aria-labelledby="change-password-title"
            initial={reduced ? false : { opacity: 0, y: 12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduced ? { opacity: 1 } : { opacity: 0, y: 8, scale: 0.99 }}
            transition={reduced ? { duration: 0 } : { type: "spring", stiffness: 320, damping: 28 }}
            className="w-full max-w-sm rounded-2xl border border-[var(--hairline)] bg-[var(--panel)] p-5 shadow-2xl"
          >
            <div className="flex items-start justify-between gap-3">
              <span className="flex items-center gap-2">
                <span
                  aria-hidden
                  className="glow-sm grid h-8 w-8 place-items-center rounded-xl"
                  style={{
                    background: "color-mix(in srgb, var(--accent) 18%, transparent)",
                    color: "var(--accent-ink)",
                    "--hue": "var(--accent)",
                  } as React.CSSProperties}
                >
                  <KeyRound size={15} />
                </span>
                <h2 id="change-password-title" className="font-[family-name:var(--font-display)] text-lg font-bold">
                  Change password
                </h2>
              </span>
              <button
                onClick={onClose}
                aria-label="Close"
                className="rounded-lg p-1.5 text-[var(--ink-muted)] transition-colors hover:bg-[var(--wash-2)] hover:text-[var(--ink)]"
              >
                <X size={16} />
              </button>
            </div>

            {done ? (
              <>
                <p className="mt-4 text-sm leading-relaxed text-[var(--ink-2)]">
                  Password changed. <strong className="font-semibold">You have been signed out everywhere</strong>,
                  including here — that is what makes changing a leaked password worth doing. Sign in again with the
                  new one.
                </p>
                <div className="mt-5 flex justify-end">
                  <Button variant="primary" onClick={() => (window.location.href = "/login")}>
                    Sign in again
                  </Button>
                </div>
              </>
            ) : (
              <>
                <p className="mt-3 text-sm leading-relaxed text-[var(--ink-2)]">
                  Your current password is required — being signed in is not proof it is you at the keyboard.
                  Every session signs out afterwards, this one included.
                </p>

                <div className="mt-4 flex flex-col gap-3">
                  <PasswordField
                    ref={first}
                    label="Current password"
                    value={current}
                    onChange={setCurrent}
                    autoComplete="current-password"
                  />
                  <PasswordField
                    label="New password"
                    value={next}
                    onChange={setNext}
                    autoComplete="new-password"
                  />
                  <PasswordField
                    label="New password again"
                    value={confirm}
                    onChange={setConfirm}
                    autoComplete="new-password"
                    onEnter={submit}
                  />
                </div>

                {error && (
                  <p role="alert" className="mt-3 text-sm font-medium" style={{ color: "var(--danger-ink)" }}>
                    {error}
                  </p>
                )}

                <div className="mt-5 flex justify-end gap-2">
                  <Button onClick={onClose} disabled={busy}>
                    Cancel
                  </Button>
                  <Button variant="primary" onClick={submit} disabled={busy}>
                    {busy ? "Changing…" : "Change it"}
                  </Button>
                </div>
              </>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
