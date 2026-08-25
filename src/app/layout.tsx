import type { Metadata, Viewport } from "next";
import { THEME_SCRIPT } from "@/components/theme-toggle";
/*
 * Resolved by `next.config.ts` from `FONT_SOURCE` — google (default), local or
 * system. The indirection exists because `next/font/google` downloads at
 * *compile* time, so choosing with an `if` here would still trigger the fetch.
 * See `docs/restricted-environments.md`.
 */
import { fontClassName } from "@/fonts";
import "./globals.css";

export const metadata: Metadata = {
  title: "POD Tracker — bug and ticket ageing",
  description: "Ageing bugs, tickets and CRs across every POD, live from Azure Boards.",
};

/** Lets the browser tint its own chrome to match whichever theme is showing. */
export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#eef3f8" },
    { media: "(prefers-color-scheme: dark)", color: "#061524" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={fontClassName}
    >
      <head>
        {/* Applies the stored theme before first paint, so there is no flash. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
