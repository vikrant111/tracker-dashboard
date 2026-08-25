"use client";

/**
 * What the board looks like before its numbers arrive.
 *
 * Shaped like the real thing rather than a spinner, so the page does not jump
 * when the data lands.
 */
export function SkeletonBoard() {
  return (
    <div className="flex flex-col gap-4">
      <div className="grid items-stretch gap-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <div className="glass h-[216px] animate-pulse" />
        <div className="glass h-[216px] animate-pulse" />
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="glass h-[132px] animate-pulse" />
        ))}
      </div>
      <div className="grid items-start gap-4 lg:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="glass h-[260px] animate-pulse" />
        ))}
      </div>
    </div>
  );
}
