"use client";

import { motion } from "framer-motion";

import { Greeting } from "./greeting";
import type { Weather } from "@/lib/weather";
import type { PodMatch } from "@/controllers/search.controller";
import { describeEmpty } from "./health-empty-copy";

/**
 * The card when the board has **no items to score**.
 *
 * Zero items is not a health reading, so this stands in for the ring rather
 * than drawing an empty one — an empty ring still reads as a measurement, and
 * an empty one reads as zero, which is the opposite of the truth.
 *
 * **It must say why, and it must not guess.** The first version guessed and got
 * it wrong: it told the reader to "switch PODs or pick All PODs" while the note
 * directly above said the person had been *found* on this very POD. Two parts
 * of one screen disagreeing is the failure this whole project exists to avoid,
 * so the reason now comes from the same search resolution the note uses.
 */
export function HealthEmpty({
  podName,
  userName,
  weather,
  term,
  match,
  others,
  onClear,
  ref,
}: {
  podName: string;
  userName: string;
  weather: Weather | null;
  /** What was searched for, if anything. */
  term: string;
  /** How this POD matched the search — the reason the board is on it. */
  match: PodMatch | null;
  /** Other PODs the same search finds, so the copy can point somewhere real. */
  others: PodMatch[];
  onClear?: () => void;
  ref?: React.Ref<HTMLElement>;
}) {
  const state = describeEmpty({ podName, term, match, others });

  return (
    <motion.section
      ref={ref}
      data-sky-anchor
      initial={{ opacity: 0, y: 26, scale: 0.985 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: "spring", stiffness: 210, damping: 26 }}
      className="glass sheen relative flex h-full flex-col gap-5 overflow-hidden p-4 sm:p-6"
    >
      <div className="flex shrink-0 flex-col items-center gap-5 sm:flex-row sm:items-center sm:gap-6">
        {/*
         * Sized like the real dial it stands in for, so the card does not
         * resize when a search stops matching.
         */}
        <div
          className="flex aspect-square w-[min(200px,52vw)] shrink-0 items-center justify-center rounded-full border border-dashed"
          style={{ borderColor: "var(--hairline)" }}
          role="img"
          aria-label={`${state.heading}. There is no health score to show.`}
        >
          <div className="flex flex-col items-center gap-2 text-[var(--ink-muted)]">
            <state.Icon size={26} aria-hidden />
            <span className="font-[family-name:var(--font-display)] text-3xl font-bold">—</span>
          </div>
        </div>

        <div className="min-w-0 flex-1 text-center sm:text-left">
          <span className="eyebrow">Board health</span>
          <h1 className="mt-2.5 font-[family-name:var(--font-display)] text-[clamp(1.6rem,6vw,2.25rem)] leading-tight font-bold tracking-tight break-words">
            {podName}
          </h1>
          <p className="mt-1 text-base font-semibold text-[var(--ink-2)]">{state.heading}</p>
          <p className="mt-3 max-w-xs text-sm leading-relaxed text-[var(--ink-2)]">{state.body}</p>

          {onClear && term ? (
            <button
              onClick={onClear}
              className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-[var(--accent-ink)] transition-colors hover:text-[var(--accent)]"
            >
              Clear the search
            </button>
          ) : null}
        </div>
      </div>

      <Greeting name={userName} weather={weather} />
    </motion.section>
  );
}
