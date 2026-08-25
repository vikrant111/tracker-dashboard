/** Two decimal places: a clip-path with sixteen is a string nobody can read. */
import {
  MAX_ZOOM,
  PARALLAX_MAX,
  PARALLAX_RATIO,
  clamp01,
  ease,
  finite,
  type Anchor,
  type Inset,
  type Viewport,
} from "./progress.ts";

const round = (n: number) => Math.round(n * 100) / 100;

/**
 * The window the sky is seen through: exactly the card at rest, the whole
 * viewport once the takeover completes.
 *
 * **All four edges retreat on one `open` value**, so every side gives way by the
 * same fraction at the same moment and the window maximises outward rather than
 * unveiling. Running the sides ahead of the top and bottom does cover the wide
 * gutters sooner, and it reads as a curtain being drawn — the horizontal edges
 * arrive long before the vertical ones and the eye follows the mismatch. The
 * gutters are covered by finishing the takeover sooner instead; see
 * `SPAN_HEIGHT`.
 *
 * Insets are floored at zero. The card's top goes negative as it scrolls past,
 * and a negative inset is not a smaller window — `clip-path` treats it as
 * invalid and drops the whole rule.
 */
export function insetAt(anchor: Anchor, viewport: Viewport, scrollY: number, progress: number): Inset {
  const open = ease(progress);
  const vw = Math.max(0, finite(viewport.width));
  const vh = Math.max(0, finite(viewport.height));

  const top = finite(anchor.docTop) - finite(scrollY);
  const left = finite(anchor.left);
  const width = Math.max(0, finite(anchor.width));
  const height = Math.max(0, finite(anchor.height));

  const openTo = (edge: number) => Math.max(0, edge * (1 - open));

  return {
    top: openTo(top),
    right: openTo(vw - (left + width)),
    bottom: openTo(vh - (top + height)),
    left: openTo(left),
  };
}



/**
 * What the growing sky looks like at a given progress: its zoom, its inset, the
 * feathered edge, and the veil over the page behind it.
 */
/** The scene pushes in as it opens out — the zoom the takeover is named for. */
export function zoomAt(progress: number): number {
  return 1 + MAX_ZOOM * ease(progress);
}

/**
 * How much the sky is dimmed behind the board.
 *
 * The veil exists to stop the sky shouting, not to protect text — every word on
 * the page sits on a glass panel, and the palette's contrast was validated
 * against `--surface`, not against this.
 *
 * It has to scale with the viewport. The content column is capped at 1400px, so
 * a wide monitor leaves ~27% of its width as open sky and can afford a strong
 * veil. At 1400px and below the gutters collapse to about **6%** — a phone and a
 * 1440px laptop are in the same boat — and the only place the sky shows is
 * *through* the glass, which is 0.11 alpha in dark mode. A 0.5 veil there is the
 * difference between a sky and a flat panel.
 */
export const VEIL_NARROW = 900;
export const VEIL_WIDE = 1600;

export function veilAt(progress: number, viewportWidth: number): number {
  const w = finite(viewportWidth, VEIL_NARROW);
  const room = clamp01((w - VEIL_NARROW) / (VEIL_WIDE - VEIL_NARROW));
  const max = 0.18 + 0.32 * room;
  const min = max * 0.4;
  return min + (max - min) * clamp01(progress);
}

/** Parallax: the sky trails the page, and stops trailing before it runs out. */
export function parallaxAt(scrollY: number): number {
  return Math.min(PARALLAX_MAX, Math.max(0, finite(scrollY) * PARALLAX_RATIO));
}

/**
 * The window as a hard `clip-path`, used *underneath* the mask.
 *
 * Belt and braces. The feather fades from the window's edge **inward**, so a
 * clip at exactly that edge cuts where the alpha is already zero — it is
 * invisible when the mask works, and it is the only thing containing the layer
 * if `mask-composite: intersect` is not honoured, where the four gradients would
 * otherwise union into a full-screen mask and the window would not exist.
 */
export function clipPathAt(anchor: Anchor, viewport: Viewport, scrollY: number, progress: number): string {
  const i = insetAt(anchor, viewport, scrollY, progress);
  return `inset(${round(i.top)}px ${round(i.right)}px ${round(i.bottom)}px ${round(i.left)}px)`;
}

/** How soft the window's edge is at its softest. */
export const FEATHER_MAX = 150;

/**
 * How far the window's edge is blurred out.
 *
 * `clip-path` was the obvious way to cut this window, and it is the wrong one:
 * it is a binary test per pixel, so the sky meets the page in a razor-sharp
 * rectangle with no transition. Mid-takeover that edge is the most visible thing
 * on the screen — it reads as a rendering fault rather than as a card growing.
 *
 * A mask carries alpha, so the edge can be faded instead of cut. The feather is
 * widest at rest and closes to nothing as the window fills the viewport, so the
 * sky reaches the screen edges at the end rather than vignetting forever.
 *
 * It is also capped against the window's own short side. A 150px feather on a
 * 200px-wide window would meet in the middle and mask the layer away entirely.
 */
export function featherAt(progress: number, windowWidth: number, windowHeight: number): number {
  const base = FEATHER_MAX * (1 - ease(progress));
  const shortest = Math.max(0, Math.min(finite(windowWidth), finite(windowHeight)));
  return Math.max(0, Math.min(base, shortest * 0.45));
}

/**
 * The window as a soft-edged `mask-image`.
 *
 * Four linear gradients, one per edge, intersected. Each runs the full width or
 * height of the layer and turns opaque `feather` px past its inset, which is a
 * feathered rectangle once they are ANDed together.
 *
 * Returns null when the window is the whole viewport with nothing left to fade —
 * at which point the mask is dropped entirely rather than left at a no-op, so
 * the compositor stops doing work it cannot see.
 *
 * Returned as a string rather than assembled in the component so the exact bytes
 * that reach the style attribute are what the checks assert on.
 */
export function maskImageAt(
  anchor: Anchor,
  viewport: Viewport,
  scrollY: number,
  progress: number,
): string | null {
  const i = insetAt(anchor, viewport, scrollY, progress);
  const vw = Math.max(0, finite(viewport.width));
  const vh = Math.max(0, finite(viewport.height));

  const windowWidth = Math.max(0, vw - i.left - i.right);
  const windowHeight = Math.max(0, vh - i.top - i.bottom);
  const f = featherAt(progress, windowWidth, windowHeight);

  const fullyOpen = i.top === 0 && i.right === 0 && i.bottom === 0 && i.left === 0;
  if (fullyOpen && f <= 0.5) return null;

  const edge = (direction: string, from: number) =>
    `linear-gradient(to ${direction}, transparent ${round(from)}px, #000 ${round(from + f)}px)`;

  return [
    edge("right", i.left),
    edge("left", i.right),
    edge("bottom", i.top),
    edge("top", i.bottom),
  ].join(", ");
}
