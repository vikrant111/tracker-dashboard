import { VIEW_W } from "@/lib/sky";
import { SCENE } from "@/lib/constants";

/**
 * Tufts of grass along the ground, leaning in the wind.
 *
 * Drawn in **tufts, not blades**: one animation per clump rather than one per
 * blade keeps this near forty animations instead of a hundred and forty, and a
 * clump moving together is what real grass does anyway.
 *
 * Everything varies by index rather than at random — `Math.random()` would give
 * the server one field and the client another, and the scene would visibly
 * rearrange itself on hydration.
 */
/**
 * Tufts of grass along the ground, leaning in the wind.
 *
 * Grass is drawn in **tufts, not blades**: one animation per tuft rather than
 * one per blade keeps this to ~40 animations instead of ~140, and a clump
 * moving together is what real grass does anyway.
 *
 * Everything varies by index rather than at random — `Math.random()` would give
 * the server one field and the client another, and the scene would visibly
 * rearrange itself on hydration.
 */
/** One clump: where it stands, how tall, and how it leans. */
export type Tuft = { x: number; height: number; dur: string; delay: string; lean: number };

export function tufts(count: number, seed: number) {
  return Array.from({ length: count }, (_, i) => {
    const n = i * 7 + seed * 13;
    return {
      x: ((i + 0.5) / count) * VIEW_W + ((n % 5) - 2),
      height: 5 + (n % 4),
      dur: `${3.4 + ((n * 3) % 26) / 10}s`,
      delay: `-${((n * 5) % 38) / 10}s`,
      lean: ((n % 3) - 1) * 0.6,
    };
  });
}

/** Behind the cast, tall; in front of it, short — so nothing hides the legs. */
// How many is `SCENE.grass`; the second argument only varies the shapes.
export const GRASS_BACK = tufts(SCENE.grass.back, 0);
export const GRASS_FRONT = tufts(SCENE.grass.front, 3);
