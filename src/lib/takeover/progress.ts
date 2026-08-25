/**
 * How far through the takeover the reader has scrolled, and the easing on it.
 *
 * Pure arithmetic over a scroll position — no DOM, no React — which is what
 * makes every edge testable: a zero-height card, a card taller than the
 * viewport, a scroll position before the card exists.
 */
/**
 * The shortest scroll distance a takeover may span. Without a floor, a card
 * measured at zero height (during layout, or hidden) divides by zero and the
 * background snaps to full on the first pixel of scroll.
 */
export type Anchor = {
  /** Distance from the top of the document, not the viewport. */
  docTop: number;
  left: number;
  width: number;
  height: number;
};

export type Viewport = { width: number; height: number };

export type Inset = { top: number; right: number; bottom: number; left: number };

export const MIN_SPAN = 240;

/** How far the scene pushes in by the time it owns the page. */
export const MAX_ZOOM = 0.08;

/** The scene drifts at this fraction of scroll, so it reads as further away. */
export const PARALLAX_RATIO = 0.12;

/** ...but never drifts out of its own frame. */
export const PARALLAX_MAX = 120;

export const finite = (n: number, fallback = 0) => (Number.isFinite(n) ? n : fallback);

export const clamp01 = (n: number) => (Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0);

/** Two decimals is well inside a device pixel, and keeps `e-14` out of the CSS. */


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

