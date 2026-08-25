import Link from "next/link";

/** A page that is not there. Kept plain — there is nothing to diagnose. */
export default function NotFound() {
  return (
    <main className="grid min-h-screen place-items-center p-6">
      <div className="glass max-w-md p-8 text-center">
        <h1 className="font-[family-name:var(--font-display)] text-2xl font-bold">Nothing here</h1>
        <p className="mt-3 text-sm leading-relaxed text-[var(--ink-2)]">
          That page does not exist. The board is where everything starts.
        </p>
        <Link
          href="/"
          className="mt-6 inline-flex rounded-xl bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white"
        >
          Back to the board
        </Link>
      </div>
    </main>
  );
}
