"use client";

/**
 * The animals. One file, because they share a job and nothing else does it.
 *
 * Each is a small SVG whose motion is CSS keyframes from `globals.css`, gated
 * on `reduced` so a reader who asked for less motion gets a still scene rather
 * than a frozen first frame.
 *
 * Anatomy is deliberate rather than decorative: a squirrel is recognised by a
 * tail taller than its body, a crane by a wing that folds at the wrist and a
 * neck held straight in flight. The first squirrel had a thin sliver for a tail
 * and read as a rat, which is the whole argument for the checks that measure
 * these shapes.
 *
 * Who appears when is not decided here — `CAST` in `greeting.tsx` owns that.
 */

/**
 * A bat.
 *
 * A bat's wing is a hand: the membrane is stretched between elongated fingers,
 * and those struts are visible against a lit sky. Drawing them is what stops the
 * scalloped outline reading as a leaf. The membrane also has a slight bend at
 * the wrist, so the outer half leads the beat.
 */
export function Bat({ flap, reduced }: { flap: string; reduced: boolean }) {
  const wing = (dir: 1 | -1) => (
    <g style={{ transformOrigin: "0px 0px", animation: reduced ? undefined : `sky-bat-${dir === 1 ? "right" : "left"} ${flap} ease-in-out infinite` }}>
      <path
        d={
          `M 0 -0.6 C ${4 * dir} -3.6 ${9.5 * dir} -4.4 ${15 * dir} -2.4 ` +
          `L ${12.6 * dir} -0.2 C ${10.6 * dir} 1.4 ${9 * dir} 0.4 ${7.4 * dir} 1.9 ` +
          `C ${5.6 * dir} 0.5 ${4 * dir} 1.2 ${2.4 * dir} 2.1 C ${1.4 * dir} 1.1 ${0.6 * dir} 0.6 0 1.1 Z`
        }
        fill="var(--sky-bird)"
      />
      {/* The fingers, radiating from the wrist to each point of the trailing edge. */}
      <g stroke="var(--sky-membrane)" strokeWidth="0.35" opacity="0.7" fill="none" strokeLinecap="round">
        <path d={`M ${1.2 * dir} -0.9 L ${14.4 * dir} -2.3`} />
        <path d={`M ${1.2 * dir} -0.9 L ${11 * dir} 0.4`} />
        <path d={`M ${1.2 * dir} -0.9 L ${7.4 * dir} 1.7`} />
        <path d={`M ${1.2 * dir} -0.9 L ${2.6 * dir} 1.9`} />
      </g>
    </g>
  );
  return (
    <g>
      {wing(-1)}
      {wing(1)}
      {/* A bat's body is slim and upright, not a round bird body. */}
      <path d="M 0 -1.4 C 1.5 -1.2 1.7 0.6 0.9 2 C 0.3 2.6 -0.3 2.6 -0.9 2 C -1.7 0.6 -1.5 -1.2 0 -1.4 Z" fill="var(--sky-bird)" />
      <circle cx="0" cy="-1.9" r="1.1" fill="var(--sky-bird)" />
      {/* The ears: tall and forward, the thing you actually recognise a bat by. */}
      <path d="M -1.2 -2.6 L -1.9 -4.6 L -0.3 -3.2 Z" fill="var(--sky-bird)" />
      <path d="M 1.2 -2.6 L 1.9 -4.6 L 0.3 -3.2 Z" fill="var(--sky-bird)" />
    </g>
  );
}

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
 * A squirrel: hops along the ground, then sits up and flicks that tail.
 *
 * The tail is the animal. It is taller than the body, plumed, and carried in an
 * S over the back — a squirrel identified from a distance is identified by its
 * tail alone. The first version drew a thin sliver, which is why it read as a rat.
 */
export function Squirrel({ reduced }: { reduced: boolean }) {
  return (
    <g style={{ animation: reduced ? undefined : "sky-hop 7s ease-in-out infinite" }}>
      <g style={{ transformOrigin: "-4px 0px", animation: reduced ? undefined : "sky-tail-flick 7s ease-in-out infinite" }}>
        <path
          d="M -4 0.6 C -11 0.4 -14.6 -5 -13 -10.4 C -11.8 -14.6 -7.6 -16.6 -4.2 -15
             C -6.6 -14.6 -9.4 -13.2 -10.4 -10 C -11.6 -6 -9.4 -2.6 -5 -2.2
             C -4.4 -1.6 -4.1 -1 -4 0.6 Z"
          fill="var(--sky-bird)"
        />
      </g>
      {/* Sitting up: haunch low and round at the back, chest rising to the head. */}
      <path
        d="M -4.6 1.8 C -5.6 -1.4 -4 -4.2 -1.4 -5.2 C 0.6 -6 2.4 -5.4 3.4 -4
           C 4.2 -2.6 3.6 -0.4 2.6 1.4 C 0.6 2.4 -2.6 2.6 -4.6 1.8 Z"
        fill="var(--sky-bird)"
      />
      <circle cx="4.6" cy="-5.4" r="2.3" fill="var(--sky-bird)" />
      {/* A blunt muzzle and the two tufted ears that finish the shape. */}
      <path d="M 6.3 -4.6 C 7.7 -4.6 7.7 -3.5 6.3 -3.4 Z" fill="var(--sky-bird)" />
      <path d="M 3.1 -7 L 2.9 -9.4 L 4.7 -7.6 Z" fill="var(--sky-bird)" />
      <path d="M 5.5 -7.5 L 6.5 -9.7 L 6.9 -7.2 Z" fill="var(--sky-bird)" />
      {/* Forepaws held at the chest, hind foot flat — how a squirrel sits. */}
      <path d="M 2.8 -2.4 C 4 -2 4.2 -1 3.4 -0.4" stroke="var(--sky-bird)" strokeWidth="1.1" strokeLinecap="round" fill="none" />
      <path d="M -3.4 2.2 L 1.2 2.2" stroke="var(--sky-bird)" strokeWidth="1.5" strokeLinecap="round" />
    </g>
  );
}

/** The cat's stride. One number, so the gait and the body bob cannot drift apart. */
const STRIDE = 2.4;

/**
 * One jointed leg: thigh from the shoulder or hip, shank below it, paw at the end.
 *
 * A single rotating stick reads as a puppet, which is what the first version was.
 * The joint is what sells it — the shank stays straight while the leg carries
 * weight and folds only to clear the ground on the way forward. A cat's hock
 * bends the opposite way to its knee, so the hind legs get their own keyframe.
 */
function CatLeg({
  x,
  delay,
  hind,
  far,
  reduced,
}: {
  x: number;
  delay: string;
  hind?: boolean;
  far?: boolean;
  reduced: boolean;
}) {
  const hip = hind ? 1.4 : 1.2;
  const knee = hip + 3.2;
  const paw = knee + 2.8;
  const swing = (name: string) => (reduced ? undefined : `${name} ${STRIDE}s ease-in-out ${delay} infinite`);

  return (
    // Far-side legs sit behind the body and read dimmer, which is what gives the
    // walk its depth — four identical legs read as a cardboard cut-out.
    <g opacity={far ? 0.55 : 1} style={{ transformOrigin: `${x}px ${hip}px`, animation: swing("sky-thigh") }}>
      <path d={`M ${x} ${hip} L ${x} ${knee}`} stroke="var(--sky-bird)" strokeWidth="1.7" strokeLinecap="round" />
      <g style={{ transformOrigin: `${x}px ${knee}px`, animation: swing(hind ? "sky-shank-hind" : "sky-shank") }}>
        <path d={`M ${x} ${knee} L ${x} ${paw}`} stroke="var(--sky-bird)" strokeWidth="1.4" strokeLinecap="round" />
        <path d={`M ${x - 0.4} ${paw} L ${x + 1.6} ${paw}`} stroke="var(--sky-bird)" strokeWidth="1.5" strokeLinecap="round" />
      </g>
    </g>
  );
}

/**
 * A cat, walking the skyline.
 *
 * The gait is a **lateral-sequence walk**, which is what a cat actually uses at
 * this speed: hind, then fore, on one side, then the same on the other —
 * quarter-stride apart, so three feet are down at any moment. Legs in simple
 * opposition (the previous version) is a trot, and a trotting cat does not
 * saunter along a skyline.
 */
export function Cat({ reduced }: { reduced: boolean }) {
  return (
    <g>
      {/* Far legs first: behind the body. */}
      <CatLeg x={-5.4} delay={`-${STRIDE * 0.5}s`} hind far reduced={reduced} />
      <CatLeg x={5.2} delay={`-${STRIDE * 0.75}s`} far reduced={reduced} />

      <g style={{ transformOrigin: "-8px 0px", animation: reduced ? undefined : "sky-tail-sway 3.4s ease-in-out infinite" }}>
        <path d="M -8 -1 C -14 -2 -16 -8 -12.5 -12.5" stroke="var(--sky-bird)" strokeWidth="1.8" strokeLinecap="round" fill="none" />
      </g>

      {/* The body rides the gait: it lifts twice per stride, as each diagonal
          pair passes beneath it. Small on purpose — a bouncing cat reads as a toy. */}
      <g style={{ animation: reduced ? undefined : `sky-gait-bob ${STRIDE}s ease-in-out infinite` }}>
        {/* A cat is not an ellipse. The haunch is the high point at the rear, the
            back dips to the shoulder, and the chest hangs below the elbow. */}
        <path
          d="M -8.6 -1.4 C -9.4 -4.6 -6.4 -6 -3.6 -5.4 C -0.6 -6.2 3.4 -6 6.2 -4.6
             C 8.4 -3.6 9 -1.6 8.2 0.2 C 6.6 2.2 2 2.6 -1.6 2.4
             C -5.4 2.2 -8 1.2 -8.6 -1.4 Z"
          fill="var(--sky-bird)"
        />
        {/* Neck and head, carried slightly forward of the shoulder. */}
        <path d="M 6.4 -3.6 C 8 -4.6 9 -5.4 9.4 -6.2" stroke="var(--sky-bird)" strokeWidth="3.2" strokeLinecap="round" fill="none" />
        <circle cx="9.8" cy="-6.4" r="2.7" fill="var(--sky-bird)" />
        <path d="M 7.9 -8.2 L 7.8 -11 L 10 -8.9 Z" fill="var(--sky-bird)" />
        <path d="M 10.8 -8.9 L 12.6 -11 L 12.4 -8.2 Z" fill="var(--sky-bird)" />
        {/* A muzzle, so the head is not a bare circle. */}
        <path d="M 11.8 -5.8 C 12.9 -5.7 12.9 -4.9 11.9 -4.7" fill="var(--sky-bird)" />
      </g>

      {/* Near legs last: in front of the body. */}
      <CatLeg x={-4.6} delay="0s" hind reduced={reduced} />
      <CatLeg x={6} delay={`-${STRIDE * 0.25}s`} reduced={reduced} />
    </g>
  );
}
