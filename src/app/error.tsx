"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui";

/**
 * What a reader sees when a page throws.
 *
 * Without this they get Next's default error screen, which in production is a
 * blank page and in development is a stack trace — neither of which tells
 * somebody looking at a dashboard what to do next.
 *
 * The message deliberately does **not** include `error.message`. A thrown
 * OpenSearch error carries the cluster URL and sometimes the query; putting
 * that on screen turns a bad afternoon into an information leak. It goes to the
 * server log, where the people who can act on it are already looking.
 */
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("[dashboard] render failed", error);
  }, [error]);

  return (
    <main className="grid min-h-screen place-items-center p-6">
      <div className="glass max-w-md p-8 text-center">
        <h1 className="font-[family-name:var(--font-display)] text-2xl font-bold">That did not load</h1>
        <p className="mt-3 text-sm leading-relaxed text-[var(--ink-2)]">
          Something went wrong rendering this page. Trying again often works — the board re-reads itself from
          scratch.
        </p>
        {error.digest && (
          <p className="mt-3 font-[family-name:var(--font-mono)] text-[11px] text-[var(--ink-muted)]">
            Reference {error.digest}
          </p>
        )}
        <div className="mt-6 flex justify-center gap-2">
          <Button variant="primary" onClick={reset}>
            Try again
          </Button>
          <Button onClick={() => (window.location.href = "/")}>Back to the board</Button>
        </div>
      </div>
    </main>
  );
}
