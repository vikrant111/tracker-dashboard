/**
 * Where a tooltip goes, as arithmetic.
 *
 * In a `.ts` module rather than inside the component, for the reason the checks
 * enforce: Node's type stripping cannot load a `.tsx`, so geometry living in one
 * is geometry no check can reach. Placement is exactly the kind of thing that is
 * wrong in a way nobody notices until they look at it on the wrong screen.
 */

/** The parts of a `DOMRect` this needs. Plain numbers, so it is checked without a DOM. */
export type Box = { left: number; top: number; width: number; height: number };

/** How far the bubble sits from the thing it describes. */
export const TOOLTIP_GAP = 8;
/** How close the bubble may come to the edge of the window. */
export const TOOLTIP_MARGIN = 8;

const has = (box: Box | null | undefined): box is Box =>
  Boolean(box) && (box!.width > 0 || box!.height > 0);

/**
 * One box covering all of them, or null when there is nothing to cover.
 *
 * This is what makes the tooltip find its anchor at all. The anchor is
 * `display: contents` — deliberately, because it must not add a wrapper that
 * changes the layout of whatever it wraps — and an element with
 * `display: contents` **generates no box**. Browsers then disagree about what
 * `getBoundingClientRect()` returns: Chrome and Safari hand back an empty rect
 * at `0,0`, Firefox the union of the children.
 *
 * So on Chrome and Safari every tooltip parked itself in the top-left corner of
 * the window, nowhere near the control it described. Measuring the children is
 * what Firefox was already doing, made explicit and made the same everywhere.
 */
export function unionOf(boxes: (Box | null | undefined)[]): Box | null {
  const real = (Array.isArray(boxes) ? boxes : []).filter(has);
  if (real.length === 0) return null;

  const left = Math.min(...real.map((b) => b.left));
  const top = Math.min(...real.map((b) => b.top));
  const right = Math.max(...real.map((b) => b.left + b.width));
  const bottom = Math.max(...real.map((b) => b.top + b.height));

  return { left, top, width: right - left, height: bottom - top };
}

/**
 * The box a tooltip should point at: the anchor's own, or its children's.
 *
 * `own` first, because an anchor that does have a box is the simple case and
 * its children may be smaller than it.
 */
export const anchorBox = (own: Box | null | undefined, children: (Box | null | undefined)[]): Box | null =>
  has(own) ? own : unionOf(children);

/**
 * Where to put the bubble: above the target, or below when the top of the
 * screen is in the way, centred and then pulled back inside either edge.
 */
export function placeTooltip(
  target: Box,
  self: Box,
  viewport: { width: number; height: number },
): { x: number; y: number; below: boolean } {
  const below = target.top - self.height - TOOLTIP_GAP < TOOLTIP_MARGIN;
  const y = below ? target.top + target.height + TOOLTIP_GAP : target.top - self.height - TOOLTIP_GAP;

  const centred = target.left + target.width / 2 - self.width / 2;
  const x = Math.max(TOOLTIP_MARGIN, Math.min(centred, viewport.width - self.width - TOOLTIP_MARGIN));

  return {
    x,
    y: Math.max(TOOLTIP_MARGIN, Math.min(y, viewport.height - self.height - TOOLTIP_MARGIN)),
    below,
  };
}
