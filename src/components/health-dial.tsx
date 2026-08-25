"use client";

import { motion, useReducedMotion } from "framer-motion";
import { useCallback, useEffect, useRef, useState } from "react";
import { STATUS } from "@/lib/palette";
import { CountUp } from "./ui";
import { BANDS, C, R, SIZE, STROKE, bandFor } from "./health-dial-bands";
import { useDialScrub } from "./use-dial-scrub";

export { SIZE, BANDS, bandFor };
export type { Band } from "./health-dial-bands";

/**
 * The board's score, and a way to interrogate it.
 *
 * Dragging the ring scrubs a *hypothetical* score so the reader can find where
 * each band begins — "how much would we have to clear to be healthy?". It never
 * changes any data: on release it springs back to the real value. The band arcs
 * behind the track show those thresholds even before anyone drags.
 */
export function HealthDial({
  value,
  onExplore,
  onDrillLabel,
}: {
  value: number;
  /** Reports the scrubbed value, or null once it snaps back. */
  onExplore: (v: number | null) => void;
  onDrillLabel?: string;
}) {
  const reduced = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const { dragging, explored, report, begin, move, end, onKeyDown } = useDialScrub(ref, value, onExplore);

  const shown = explored ?? value;
  const band = bandFor(shown);
  const offset = C * (1 - shown / 100);

  const knobAngle = (shown / 100) * 360 - 90;
  const knob = {
    x: SIZE / 2 + R * Math.cos((knobAngle * Math.PI) / 180),
    y: SIZE / 2 + R * Math.sin((knobAngle * Math.PI) / 180),
  };

  return (
    <div
      ref={ref}
      role="slider"
      tabIndex={0}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(shown)}
      aria-valuetext={`${Math.round(shown)}% closed — ${band.label}${explored !== null ? ", exploring" : ""}`}
      aria-label={`Board health. ${onDrillLabel ?? ""} Drag or use arrow keys to explore the thresholds; release or press Escape to return to the real score.`}
      onPointerDown={begin}
      onPointerMove={move}
      onPointerUp={end}
      onBlur={() => explored !== null && report(null)}
      onKeyDown={onKeyDown}
      className={`relative aspect-square w-[min(200px,52vw)] shrink-0 touch-none rounded-full outline-none select-none ${
        dragging ? "cursor-grabbing" : "cursor-grab"
      }`}
    >
      {/* Heartbeat behind the dial. A gradient, not a blurred disc. */}
      <span
        aria-hidden
        className={reduced || dragging ? "absolute inset-2 rounded-full" : "breathe absolute inset-2 rounded-full"}
        style={{
          background: `radial-gradient(circle at center, color-mix(in srgb, ${band.color} 62%, transparent) 0%, color-mix(in srgb, ${band.color} 26%, transparent) 45%, transparent 70%)`,
          transition: "background 260ms var(--ease)",
        }}
      />

      <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="h-full w-full -rotate-90" aria-hidden>
        <defs>
          <linearGradient id="healthGrad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={band.color} />
            <stop offset="100%" stopColor="var(--accent-2)" />
          </linearGradient>
        </defs>

        <circle cx={SIZE / 2} cy={SIZE / 2} r={R} fill="none" stroke="var(--wash-2)" strokeWidth={STROKE} />

        {/* Where each band begins, so the thresholds are legible without dragging. */}
        {BANDS.filter((b) => b.min > 0).map((b) => {
          const a = ((b.min / 100) * 360 - 90) * (Math.PI / 180);
          const inner = R - STROKE / 2 - 1;
          const outer = R + STROKE / 2 + 1;
          return (
            <line
              key={b.min}
              x1={SIZE / 2 + inner * Math.cos(a)}
              y1={SIZE / 2 + inner * Math.sin(a)}
              x2={SIZE / 2 + outer * Math.cos(a)}
              y2={SIZE / 2 + outer * Math.sin(a)}
              stroke={b.color}
              strokeWidth={2}
              strokeLinecap="round"
              opacity={dragging || explored !== null ? 0.95 : 0.4}
              style={{ transition: "opacity 200ms var(--ease)" }}
            />
          );
        })}

        <motion.circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={R}
          fill="none"
          stroke="url(#healthGrad)"
          strokeWidth={STROKE}
          strokeLinecap="round"
          strokeDasharray={C}
          initial={{ strokeDashoffset: C }}
          animate={{ strokeDashoffset: offset }}
          transition={
            dragging
              ? { duration: 0 }
              : { type: "spring", stiffness: 120, damping: 18, restDelta: 0.5 }
          }
          style={{ filter: `drop-shadow(0 0 12px color-mix(in srgb, ${band.color} 55%, transparent))` }}
        />

        {/* The grip. Only while it is in play, so the resting dial stays clean. */}
        <motion.circle
          cx={knob.x}
          cy={knob.y}
          r={dragging ? 9 : 7}
          fill="var(--panel)"
          stroke={band.color}
          strokeWidth={3}
          initial={false}
          animate={{ opacity: dragging || explored !== null ? 1 : 0, cx: knob.x, cy: knob.y }}
          transition={dragging ? { duration: 0 } : { type: "spring", stiffness: 120, damping: 18 }}
        />
      </svg>

      <span className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
        <span className="flex items-baseline">
          {explored === null ? (
            <CountUp
              value={value}
              className="lit font-[family-name:var(--font-display)] text-[clamp(2.25rem,11vw,3.75rem)] leading-none font-bold tracking-tight"
              style={{ "--hue": band.color } as React.CSSProperties}
            />
          ) : (
            <span
              className="lit font-[family-name:var(--font-display)] text-[clamp(2.25rem,11vw,3.75rem)] leading-none font-bold tracking-tight tnum"
              style={{ "--hue": band.color } as React.CSSProperties}
            >
              {Math.round(shown)}
            </span>
          )}
          {/*
           * A percent sign, not an "of 100" caption underneath.
           *
           * On this card the caption sat a few rows above "106 of 244" — a real
           * count of real items — so "32 OF 100" read as another count of
           * something rather than a score out of a fixed maximum. `%` says
           * "proportion" instantly and cannot be mistaken for a tally.
           */}
          <span
            className="lit font-[family-name:var(--font-display)] text-[clamp(1.1rem,4.5vw,1.75rem)] leading-none font-bold"
            style={{ "--hue": band.color } as React.CSSProperties}
          >
            %
          </span>
        </span>
        {/*
         * Names what the ring measures, which the number alone never did.
         *
         * The score is exactly the share of tracked items that are closed, so
         * the caption says so — the reader can check it against "106 of 244" a
         * few rows down and get the same figure.
         */}
        <span className="eyebrow mt-1.5">{explored === null ? "closed" : "exploring"}</span>
      </span>
    </div>
  );
}
