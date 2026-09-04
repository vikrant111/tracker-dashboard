"use client";

import { motion } from "framer-motion";
import { Compass } from "lucide-react";
import type { PodMatch } from "@/controllers/search.controller";

/**
 * "You searched for this — here is where it lives."
 *
 * Shown when a search resolves to a POD, so the reader knows the board moved
 * and why. When the same name appears on more than one POD, the others are
 * listed as buttons: the note is not just an explanation, it is the way across.
 *
 * Nothing here is inferred. A POD is named because its roster holds the name or
 * its items do, and the note says which — a person with no assigned work would
 * otherwise look like a mistake rather than a new joiner.
 */
export function SearchScopeNote({
  term,
  current,
  others,
  onPick,
}: {
  term: string;
  /** The POD being shown, when the search is what selected it. */
  current: PodMatch | null;
  /** Every other POD the same search finds. */
  others: PodMatch[];
  onPick: (teamId: string) => void;
}) {
  if (!current && !others.length) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass flex flex-wrap items-center gap-x-2 gap-y-1.5 rounded-xl px-3.5 py-2.5 text-sm"
    >
      <Compass size={14} aria-hidden className="shrink-0 text-[var(--accent)]" />

      {current ? (
        <span className="text-[var(--ink-2)]">
          <span className="font-semibold text-[var(--ink)]">&ldquo;{term}&rdquo;</span> found in{" "}
          <span className="font-semibold text-[var(--ink)]">{current.name}</span>
          <span className="text-[var(--ink-muted)]"> · {describe(current)}</span>
        </span>
      ) : (
        <span className="text-[var(--ink-2)]">
          <span className="font-semibold text-[var(--ink)]">&ldquo;{term}&rdquo;</span> is not in this
          POD.
        </span>
      )}

      {others.length > 0 && (
        <>
          <span className="text-[var(--ink-muted)]">Also in:</span>
          {others.map((pod) => (
            <button
              key={pod.teamId}
              onClick={() => onPick(pod.teamId)}
              title={`Switch to ${pod.name} — ${describe(pod)}`}
              className="rounded-full border border-[var(--accent-line)] bg-[var(--accent-tint)] px-2.5 py-0.5 text-[13px] font-semibold text-[var(--accent-ink)] transition-colors hover:bg-[var(--accent)] hover:text-white"
            >
              {pod.name}
              <span className="ml-1 font-normal tnum opacity-80">{pod.items || "roster"}</span>
            </button>
          ))}
        </>
      )}
    </motion.div>
  );
}

/** Why this POD came up — items, roster, or both. Never a bare number. */
function describe(pod: PodMatch): string {
  const items = pod.items === 1 ? "1 item" : `${pod.items} items`;
  if (pod.items && pod.people.length) return `${items}, and on the roster`;
  if (pod.items) return items;
  // The case this whole feature exists for: on the team, assigned nothing yet.
  return `on the roster, no items yet`;
}
