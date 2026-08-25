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
export * from "./takeover/progress.ts";
export * from "./takeover/shape.ts";
