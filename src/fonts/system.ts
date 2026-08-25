/**
 * No web fonts at all. `FONT_SOURCE=system`.
 *
 * Nothing is downloaded and nothing is shipped — the page renders in whatever
 * the reader's machine already has. Every rule in `globals.css` already names a
 * real fallback after the variable:
 *
 *     --font-sans: var(--font-plex-sans), system-ui, sans-serif;
 *
 * so leaving the variables undefined is not a broken state, it is the fallback
 * doing its job. The dashboard looks plainer and is completely usable.
 *
 * This is the last resort for a locked-down machine: it cannot fail, because
 * there is nothing for a proxy to intercept.
 */

/** Deliberately empty — no font variables are defined, so the fallbacks apply. */
export const fontClassName = "";
