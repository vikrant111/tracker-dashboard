"use client";

import { useEffect, useRef } from "react";
import useSWR from "swr";
import { fetcher } from "@/lib/swr";
import type { PodMatch } from "@/controllers/search.controller";

/**
 * Follow a search to the POD that actually holds the answer.
 *
 * Every query is scoped to one POD, so searching for somebody who belongs to a
 * different one used to return an empty board — truthfully, and uselessly. This
 * asks *where is this* and moves the reader there.
 *
 * It also finds people with **no work items at all**, because they match on a
 * POD's roster. That is the case this was built for: a newly onboarded person
 * exists on exactly one POD and is assigned nothing, so an items-only search
 * reports "nowhere" about somebody plainly there.
 */
export function useSearchScope({
  search,
  teamId,
  onSwitch,
}: {
  search: string;
  teamId: string;
  /** Called once per resolved search, never on a re-render. */
  onSwitch: (teamId: string) => void;
}): { matches: PodMatch[]; current: PodMatch | null; others: PodMatch[] } {
  const term = search.trim();

  const { data } = useSWR<{ term: string; matches: PodMatch[] }>(
    term ? `/api/search/pods?q=${encodeURIComponent(term)}` : null,
    fetcher,
    /*
     * No polling and no refetch on focus. This answers a question about where
     * things are, which does not change while you read the answer — and a
     * refetch would re-run the switch below.
     */
    { revalidateOnFocus: false, refreshInterval: 0, keepPreviousData: false },
  );

  const matches = data?.matches ?? [];

  /*
   * Switch at most once per search term.
   *
   * Without the guard this fights the reader: they search, it moves them to the
   * first POD, they pick a different one from the picker, and the effect
   * immediately drags them back. Remembering which term has already been acted
   * on means a manual choice sticks.
   */
  const handled = useRef<string | null>(null);

  useEffect(() => {
    if (!term) {
      handled.current = null;
      return;
    }
    // Wait for the answer, and only act on the answer to *this* term.
    if (!data || data.term !== term) return;
    if (handled.current === term) return;
    handled.current = term;

    if (!data.matches.length) return;
    // Already looking at a POD that matches — moving would be interference.
    if (data.matches.some((m) => m.teamId === teamId)) return;

    onSwitch(data.matches[0].teamId);
    // `teamId` is deliberately absent: this must react to the search resolving,
    // not to the POD changing, or picking a POD by hand would re-trigger it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [term, data, onSwitch]);

  return {
    matches,
    current: matches.find((m) => m.teamId === teamId) ?? null,
    others: matches.filter((m) => m.teamId !== teamId),
  };
}
