"use client";

/**
 * The things with feathers.
 *
 * A crane and a gull are told apart by what the gull *lacks*: no neck reaching
 * forward, no legs trailing past the tail. And by how they fly — a crane beats
 * steadily, a gull soars, holding its wings level for most of the cycle.
 */
/**
 * A crane: neck stretched ahead, legs trailing well past the tail, wings beating
 * slowly.
 *
 * The wing is in **two parts hinged at the wrist**, because a real one is. The
 * outer half lags the inner through the beat, so the wing ripples along its
 * length instead of swinging as one paddle — that lag is the difference between
 * a flying bird and a flapping sign.
 */
export function Crane({ reduced }: { reduced: boolean }) {
  const wing = (dir: 1 | -1) => {
    const side = dir === 1 ? "right" : "left";
    return (
      <g style={{ transformOrigin: "0px 0px", animation: reduced ? undefined : `sky-crane-${side} 4.6s ease-in-out infinite` }}>
        {/* Inner wing: shoulder to wrist. Broad, and it barely changes shape. */}
        <path d={`M 0 -0.4 C ${4 * dir} -3 ${8 * dir} -3.6 ${11 * dir} -2.6 C ${8 * dir} -0.6 ${4 * dir} 0.6 0 1.4 Z`} fill="var(--sky-bird)" />
        {/* Outer wing: wrist to tip, hinged and lagging. */}
        <g
          style={{
            transformOrigin: `${11 * dir}px -2.6px`,
            animation: reduced ? undefined : `sky-crane-tip-${side} 4.6s ease-in-out -0.42s infinite`,
          }}
        >
          <path
            d={`M ${11 * dir} -2.6 C ${15 * dir} -3.8 ${19 * dir} -3.8 ${23 * dir} -2.4
                C ${19 * dir} -1.4 ${14 * dir} -0.6 ${10.6 * dir} -0.4 Z`}
            fill="var(--sky-bird)"
          />
        </g>
      </g>
    );
  };
  return (
    <g>
      {wing(-1)}
      {wing(1)}
      {/* A crane flies with its neck fully extended — that is what separates it
          from a heron, which folds its neck back into its shoulders. */}
      <path d="M 3.6 -0.2 L 11.4 -1.4" stroke="var(--sky-bird)" strokeWidth="1.4" strokeLinecap="round" fill="none" />
      <ellipse cx="12.4" cy="-1.6" rx="1.3" ry="1" fill="var(--sky-bird)" />
      <path d="M 13.5 -1.7 L 16.4 -1.9" stroke="var(--sky-bird)" strokeWidth="0.7" strokeLinecap="round" />
      {/* Body, tapering to a tail rather than a blunt ellipse. */}
      <path d="M 4 -0.6 C 1 -2 -3.4 -1.6 -6 0.4 C -3.4 2 1 2 4 0.8 Z" fill="var(--sky-bird)" />
      {/* Legs trail behind, together, past the tail. */}
      <path d="M -5.4 0.8 L -14 2.2" stroke="var(--sky-bird)" strokeWidth="0.8" strokeLinecap="round" fill="none" />
      <path d="M -5.4 1.4 L -13.4 3" stroke="var(--sky-bird)" strokeWidth="0.8" strokeLinecap="round" fill="none" />
    </g>
  );
}

/**
 * A gull, soaring.
 *
 * Told apart from the crane by what it *lacks*: no extended neck reaching
 * forward, no legs trailing past the tail. A gull tucks both away and becomes
 * an angular silhouette — the shallow "M" everyone draws when they draw a bird.
 *
 * Its wings are pointed rather than broad, and hinged at the wrist so the outer
 * half lags the inner one. The flap is a short burst followed by a **long
 * glide**: a gull spends most of its time not flapping at all, which is the
 * behaviour that makes it read as a gull rather than as a pigeon.
 */
export function Gull({ reduced, flap }: { reduced: boolean; flap: string }) {
  const wing = (dir: 1 | -1) => {
    const side = dir === 1 ? "right" : "left";
    return (
      <g style={{ transformOrigin: "0px 0px", animation: reduced ? undefined : `sky-gull-${side} ${flap} ease-in-out infinite` }}>
        {/* Inner wing: shoulder to wrist, rising. */}
        <path d={`M 0 -0.3 C ${3 * dir} -2.4 ${6 * dir} -3.1 ${9 * dir} -2.9 C ${6 * dir} -1.1 ${3 * dir} 0.2 0 1 Z`} fill="var(--sky-bird)" />
        {/* Outer wing: wrist to a point, angling back down. Hinged, and lagging. */}
        <g
          style={{
            transformOrigin: `${9 * dir}px -2.9px`,
            animation: reduced ? undefined : `sky-gull-tip-${side} ${flap} ease-in-out -0.3s infinite`,
          }}
        >
          <path
            d={`M ${9 * dir} -2.9 L ${18 * dir} -0.9 C ${14 * dir} -0.7 ${11 * dir} -0.6 ${8.6 * dir} -0.7 Z`}
            fill="var(--sky-bird)"
          />
        </g>
      </g>
    );
  };

  return (
    <g>
      {wing(-1)}
      {wing(1)}
      {/* Body: a short, blunt spindle. No neck out front, no legs behind — that
          absence is the whole identification. */}
      <path d="M 3.4 0 C 1.6 -1.3 -2 -1.2 -4.2 0.1 C -2 1.4 1.6 1.3 3.4 0 Z" fill="var(--sky-bird)" />
      {/* Head tucked close, and the small hooked bill gulls are known for. */}
      <circle cx="4" cy="-0.3" r="1.05" fill="var(--sky-bird)" />
      <path d="M 5 -0.4 L 6.6 -0.1 L 5 0.3 Z" fill="var(--sky-bird)" />
      {/* A short wedge tail, so the silhouette closes rather than just stopping. */}
      <path d="M -4 0.1 L -6.6 -0.8 L -6.6 1 Z" fill="var(--sky-bird)" />
    </g>
  );
}
