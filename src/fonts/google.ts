/**
 * Fonts fetched from Google at **build time**. `FONT_SOURCE=google` (default).
 *
 * Next downloads and self-hosts these during `next build` and on the first dev
 * compile, so nothing is fetched from Google in the browser. That download is
 * still a network call from the build machine, which is what fails behind a
 * TLS-inspecting corporate proxy with `unable to get local issuer certificate`.
 *
 * If that is your situation, either trust the proxy's CA
 * (`NODE_EXTRA_CA_CERTS`) or switch to `FONT_SOURCE=local`, which needs no
 * network at all. See `docs/restricted-environments.md`.
 */
import { Bricolage_Grotesque, IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google";

const bricolage = Bricolage_Grotesque({
  subsets: ["latin"],
  variable: "--font-bricolage",
  display: "swap",
});

const plexSans = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-plex-sans",
  display: "swap",
});

const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-plex-mono",
  display: "swap",
});

/** Goes on `<html>`; defines the three `--font-*` variables `globals.css` reads. */
export const fontClassName = `${bricolage.variable} ${plexSans.variable} ${plexMono.variable}`;
