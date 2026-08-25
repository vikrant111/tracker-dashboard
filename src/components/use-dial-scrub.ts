"use client";

import { useCallback, useEffect, useState, type RefObject } from "react";
import { DEAD_ZONE_RATIO, clamp } from "./health-dial-bands";

/**
 * Dragging the ring to scrub a hypothetical score.
 *
 * Display-only: nothing downstream of the scrubbed value touches data, and on
 * release it springs back to the real score. The guards matter more than the
 * maths — a dial left showing a number that is not real would be the dashboard
 * lying about board health.
 */
export function useDialScrub(
  ref: RefObject<HTMLDivElement | null>,
  value: number,
  onExplore: (v: number | null) => void,
) {
  const [dragging, setDragging] = useState(false);
  const [explored, setExplored] = useState<number | null>(null);

  const report = useCallback(
    (v: number | null) => {
      setExplored(v);
      onExplore(v);
    },
    [onExplore],
  );

  /** Pointer position → 0..100, measured clockwise from the top of the ring. */
  const valueAt = useCallback((clientX: number, clientY: number): number | null => {
    const el = ref.current;
    if (!el) return null;
    // Non-finite coordinates would survive the dead-zone test (NaN < 28 is
    // false) and end up rendered as the board health. Refuse them outright.
    if (!Number.isFinite(clientX) || !Number.isFinite(clientY)) return null;
    const r = el.getBoundingClientRect();
    const dx = clientX - (r.left + r.width / 2);
    const dy = clientY - (r.top + r.height / 2);
    const dist = Math.hypot(dx, dy);
    const dead = (Math.min(r.width, r.height) / 2) * DEAD_ZONE_RATIO;
    if (!Number.isFinite(dist) || dist < dead) return null;
    const deg = (Math.atan2(dy, dx) * 180) / Math.PI;
    const v = clamp(Math.round(((((deg + 90) % 360) + 360) % 360) / 3.6));
    return Number.isFinite(v) ? v : null;
  }, []);

  const begin = (e: React.PointerEvent) => {
    // Left button / touch / pen only, so a right-click never starts a scrub.
    if (e.button !== 0) return;
    const v = valueAt(e.clientX, e.clientY);
    if (v === null) return;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    setDragging(true);
    report(v);
  };

  const move = (e: React.PointerEvent) => {
    if (!dragging) return;
    const v = valueAt(e.clientX, e.clientY);
    if (v !== null) report(v);
  };

  const end = useCallback(() => {
    setDragging(false);
    report(null);
  }, [report]);

  // A pointer released outside the element, or a cancelled gesture, must still
  // snap back — otherwise the dial is left showing a number that is not real.
  useEffect(() => {
    if (!dragging) return;
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
    window.addEventListener("blur", end);
    return () => {
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
      window.removeEventListener("blur", end);
    };
  }, [dragging, end]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    const step = e.shiftKey ? 10 : 1;
    if (e.key === "ArrowRight" || e.key === "ArrowUp") {
      e.preventDefault();
      report(clamp((explored ?? value) + step));
    } else if (e.key === "ArrowLeft" || e.key === "ArrowDown") {
      e.preventDefault();
      report(clamp((explored ?? value) - step));
    } else if (e.key === "Escape" || e.key === "Home") {
      e.preventDefault();
      report(null);
    }
  };

  return { dragging, explored, report, begin, move, end, onKeyDown };
}
