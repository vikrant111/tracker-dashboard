"use client";

/**
 * Which rows the sign-off report is showing, and the URL that reproduces them.
 *
 * Lifted out of `signoff-report.tsx`, which is about what the panel looks like.
 * Four filters that all behave the same way — narrow, and go back to page one —
 * plus the one thing they are all for: a query string the download can carry,
 * so the file holds exactly the rows on screen.
 *
 * Two of the filters are answered by the server (`repoId`, `on`) and two here
 * (`signoff`, `q`). The export route applies all four, using the same pure
 * functions, so where a filter is applied never changes what it matches.
 */
import { useState } from "react";
import { cleanQuery } from "@/lib/devops/table";
import type { SignoffFilter } from "@/lib/devops/signoff";

export function useReportFilters() {
  const [repoId, setRepoId] = useState("");
  const [period, setPeriod] = useState("");
  const [signoff, setSignoff] = useState<SignoffFilter>("all");
  const [text, setText] = useState("");
  const [page, setPage] = useState(1);

  /*
   * Every filter returns to page one. Narrowing a list while sitting on page 4
   * leaves an empty table with rows behind it, which reads as "my data is
   * gone" rather than "there is no page 4".
   */
  const onPageOne = <T,>(set: (v: T) => void) => (value: T) => {
    set(value);
    setPage(1);
  };

  /** What the server narrows on: repository and merged-when. */
  const serverQuery = new URLSearchParams();
  if (repoId) serverQuery.set("repoId", repoId);
  if (period) serverQuery.set("on", period);
  const qs = serverQuery.toString();

  /** The download URL: all four filters, plus an optional format. */
  const downloadHref = (format?: string) => {
    const params = new URLSearchParams(qs);
    const q = cleanQuery(text);
    if (q) params.set("q", q);
    if (signoff !== "all") params.set("signoff", signoff);
    if (format) params.set("format", format);

    const search = params.toString();
    return `/api/pulls/export${search ? `?${search}` : ""}`;
  };

  return {
    repoId,
    period,
    signoff,
    text,
    page,
    setPage,
    setRepoId: onPageOne(setRepoId),
    setPeriod: onPageOne(setPeriod),
    setSignoff: onPageOne<SignoffFilter>(setSignoff),
    setText: onPageOne(setText),
    /** The API key for the rows themselves. */
    listHref: `/api/pulls${qs ? `?${qs}` : ""}`,
    downloadHref,
  };
}
