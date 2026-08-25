"use client";

import { useEffect, useState } from "react";

/**
 * A value that settles before it is used.
 *
 * The input stays instant; only the query waits. Committing on every keystroke
 * re-keys SWR and re-renders every panel on the board, which is most of what
 * made typing in the drawer feel heavy.
 */
/** Wait for typing to settle before refetching. */
export function useDebounced<T>(value: T, ms = 250): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setSettled(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return settled;
}
