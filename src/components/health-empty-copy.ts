import { SearchX, UserCheck } from "lucide-react";
import type { PodMatch } from "@/controllers/search.controller";

/**
 * Which of the five empty boards this is.
 *
 * Genuinely different situations with different ways out, and only some of them
 * are anybody's mistake — so none of them share a sentence. Exported for the
 * check suite, which exercises every branch without rendering anything.
 */
export function describeEmpty({
  podName,
  term,
  match,
  others,
}: {
  podName: string;
  term: string;
  match: PodMatch | null;
  others: PodMatch[];
}): { heading: string; body: string; Icon: typeof SearchX } {
  const elsewhere = others.map((o) => o.name).join(", ");

  /*
   * Where the work actually is.
   *
   * Somebody on several PODs usually has items on only one of them, and naming
   * the POD without the count is the half of the answer that does not help:
   * "also on Payments POD" and "2 items in Payments POD" are the difference
   * between knowing there is somewhere else to look and knowing it is worth
   * looking. Ordered busiest-first by the matcher, so the first is the best
   * place to go.
   */
  const withWork = others.filter((o) => o.items > 0);
  const busiest = withWork[0];
  const countOf = (pod: PodMatch) => `${pod.items} item${pod.items === 1 ? "" : "s"}`;
  const workElsewhere = busiest
    ? `${countOf(busiest)} in ${busiest.name}` +
      (withWork.length > 1
        ? `, and more in ${withWork.slice(1).map((o) => o.name).join(", ")}`
        : "") +
      " — pick it from the note above to switch."
    : "";

  /*
   * On the roster, assigned nothing.
   *
   * Not an error at all — a new joiner looks exactly like this. Telling them to
   * "switch PODs" was the bug: the person is right here, they simply have no
   * work yet.
   */
  if (match && match.items === 0 && match.people.length > 0) {
    const who = match.people.join(", ");
    return {
      Icon: UserCheck,
      heading: "On the roster, nothing assigned",
      body:
        `${who} is on ${podName} with no work items yet, so there is nothing to score. ` +
        (workElsewhere
          ? workElsewhere
          : elsewhere
            ? `Also on ${elsewhere}, with nothing assigned there either.`
            : "Items appear here as they are assigned."),
    };
  }

  // Found here, but the other filters narrowed it away.
  if (match && match.items > 0) {
    return {
      Icon: SearchX,
      heading: "No items match",
      body: `“${term}” is in ${podName}, but nothing survives the other filters. Clear them to see all ${match.items}.`,
    };
  }

  // Not here, but somewhere the reader can actually reach.
  if (term && others.length) {
    return {
      Icon: SearchX,
      heading: "Not in this POD",
      body: `Nothing here matches “${term}”. It is in ${elsewhere} — pick it from the note above to switch.`,
    };
  }

  // Searched, and genuinely nowhere.
  if (term) {
    return {
      Icon: SearchX,
      heading: "No items match",
      body: `Nothing matches “${term}” in any POD you can see. Check the spelling, or clear the search.`,
    };
  }

  // No search at all: the POD is simply empty.
  return {
    Icon: SearchX,
    heading: "Nothing tracked yet",
    body: `${podName} has no work items. Connect Azure Boards or upload a spreadsheet, and the board fills in.`,
  };
}
