/**
 * The same three faces, served from `./files/`. `FONT_SOURCE=local`.
 *
 * **Nothing is fetched — not at build time, not at run time.** This is the mode
 * for a machine behind a TLS-inspecting proxy, an allowlist that does not
 * include `fonts.googleapis.com`, or no internet at all.
 *
 * The `.woff2` files are committed to the repository. They are the `latin`
 * subset only, which is what the Google configuration asked for, and together
 * come to about 140 KB. Refresh them with `pnpm fonts:vendor` from a machine
 * that can reach Google.
 *
 * The declarations below mirror Google's own stylesheet exactly, including the
 * part that looks like a mistake: **IBM Plex Sans is one file declared at three
 * weights.** Google serves a variable font for a multi-weight request and emits
 * one `@font-face` per weight pointing at it, so the browser picks the rule and
 * sets the `wght` axis from it. Collapsing those three into a single
 * `weight: "400 600"` range would also work, but mirroring what Google sends
 * means this mode renders identically to `FONT_SOURCE=google` rather than
 * merely similarly.
 */
import localFont from "next/font/local";

const bricolage = localFont({
  src: [{ path: "./files/bricolage-grotesque-variable.woff2", weight: "200 800", style: "normal" }],
  variable: "--font-bricolage",
  display: "swap",
  // Matches Bricolage's own metrics, so the swap does not shift the layout.
  fallback: ["Trebuchet MS", "system-ui", "sans-serif"],
});

const plexSans = localFont({
  src: [
    { path: "./files/ibm-plex-sans-400.woff2", weight: "400", style: "normal" },
    { path: "./files/ibm-plex-sans-400.woff2", weight: "500", style: "normal" },
    { path: "./files/ibm-plex-sans-400.woff2", weight: "600", style: "normal" },
  ],
  variable: "--font-plex-sans",
  display: "swap",
  fallback: ["system-ui", "-apple-system", "Segoe UI", "sans-serif"],
});

const plexMono = localFont({
  src: [
    { path: "./files/ibm-plex-mono-400.woff2", weight: "400", style: "normal" },
    { path: "./files/ibm-plex-mono-500.woff2", weight: "500", style: "normal" },
    { path: "./files/ibm-plex-mono-600.woff2", weight: "600", style: "normal" },
  ],
  variable: "--font-plex-mono",
  display: "swap",
  fallback: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
});

/** Goes on `<html>`; defines the three `--font-*` variables `globals.css` reads. */
export const fontClassName = `${bricolage.variable} ${plexSans.variable} ${plexMono.variable}`;
