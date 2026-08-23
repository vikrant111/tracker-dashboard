/**
 * The scroll takeover: the greeting card's sky growing until it *is* the page.
 *
 * The card owns a small rectangle of sky at the top of the board. As you scroll,
 * that rectangle opens outward until it covers the viewport, so the sky the card
 * was holding becomes the background of the whole page. Nothing fades in and
 * nothing is duplicated — it is one scene, seen through a window that widens.
 *
 * All of it is pure and client-safe, so `scripts/check-ui.mjs` exercises the
 * real code rather than a copy. That matters here: the maths runs on every
 * scroll frame and a single NaN would put `clip-path: inset(NaN…)` into the
 * style attribute, which silently drops the rule and blanks the background.
 */

/** Where the card sits in the *document*, so scrolling does not require re-measuring. */
export type Anchor = {
  /** Distance from the top of the document, not the viewport. */
  docTop: number;
  left: number;
  width: number;
  height: number;
};

export type Viewport = { width: number; height: number };

export type Inset = { top: number; right: number; bottom: number; left: number };

/**
 * The shortest scroll distance a takeover may span. Without a floor, a card
 * measured at zero height (during layout, or hidden) divides by zero and the
 * background snaps to full on the first pixel of scroll.
 */
export const MIN_SPAN = 240;

/** How far the scene pushes in by the time it owns the page. */
export const MAX_ZOOM = 0.08;

/** The scene drifts at this fraction of scroll, so it reads as further away. */
export const PARALLAX_RATIO = 0.12;

/** ...but never drifts out of its own frame. */
export const PARALLAX_MAX = 120;

const finite = (n: number, fallback = 0) => (Number.isFinite(n) ? n : fallback);

export const clamp01 = (n: number) => (Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0);

/** Two decimals is well inside a device pixel, and keeps `e-14` out of the CSS. */
const round = (n: number) => Math.round(n * 100) / 100;

/** A rectangle we can actually open: on screen, positive, and finite. */
export function anchorIsUsable(anchor: Anchor | null | undefined): anchor is Anchor {
  if (!anchor) return false;
  const { docTop, left, width, height } = anchor;
  if (![docTop, left, width, height].every(Number.isFinite)) return false;
  return width > 0 && height > 0;
}

/**
 * How much of the card's height the takeover spends completing.
 *
 * It used to run until the card's *last* pixel left the top of the screen. On a
 * wide monitor that is ~580px of scroll during which the sky is still a
 * rectangle with bare page either side of it — 86% of the width at a normal
 * reading position. Since every edge has to move together (see `insetAt`), the
 * only way to cover the gutters sooner is to finish sooner.
 *
 * At 0.35 the sky owns the page after roughly one third of a screen of scroll.
 * The card is still on its way out at that point, which is fine: it is a panel
 * above the layer, and both are showing the same sky.
 */
export const SPAN_HEIGHT = 0.35;

/**
 * The scroll distance the takeover spans.
 */
export function takeoverEnd(anchor: Anchor): number {
  return Math.max(MIN_SPAN, finite(anchor.docTop) + finite(anchor.height) * SPAN_HEIGHT);
}

export function takeoverProgress(scrollY: number, anchor: Anchor): number {
  return clamp01(finite(scrollY) / takeoverEnd(anchor));
}

/** Smoothstep. A linear takeover starts and stops abruptly; this one arrives. */
export function ease(p: number): number {
  const t = clamp01(p);
  return t * t * (3 - 2 * t);
}

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
