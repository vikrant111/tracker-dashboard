import type { NextConfig } from "next";

/**
 * Response headers every page and route carries.
 *
 * A dashboard behind a login is exactly the kind of thing worth framing on
 * somebody else's page, or sniffing a content type out of, so these are not
 * optional decoration. Each one closes a specific hole:
 */
const securityHeaders = [
  {
    /*
     * Clickjacking. Without this, an attacker frames the dashboard invisibly
     * over their own page and harvests the clicks of anyone already signed in —
     * "Delete POD" is one such click.
     */
    key: "X-Frame-Options",
    value: "DENY",
  },
  {
    /*
     * MIME sniffing. A browser that second-guesses `Content-Type` can be
     * persuaded to run an uploaded spreadsheet as script.
     */
    key: "X-Content-Type-Options",
    value: "nosniff",
  },
  {
    /*
     * Referrer leakage. Drill-down URLs carry filters — POD names, assignee
     * names — and those should not travel to an unrelated origin because
     * somebody clicked a link out to Azure.
     */
    key: "Referrer-Policy",
    value: "strict-origin-when-cross-origin",
  },
  {
    /* Nothing here needs a camera, a microphone or a location. */
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
  },
  {
    /*
     * HSTS. Once a browser has seen this it refuses plain HTTP for the host,
     * which is what stops the session cookie ever crossing the wire in clear.
     *
     * Ignored by browsers over HTTP, so it is safe to send in development too —
     * but `preload` is deliberately absent: submitting a host to the preload
     * list is close to irreversible and is the operator's decision, not a
     * default a framework config should make for them.
     */
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains",
  },
  {
    /*
     * Content Security Policy.
     *
     * `'unsafe-inline'` on styles is required: Tailwind and the inline
     * `style={{}}` props that carry a chart's colour both produce inline
     * styles, and there is no nonce path for them here.
     *
     * On scripts it is required by Next's own inlined bootstrap and the
     * pre-paint theme script. That is the honest state of it — the policy still
     * blocks a script from *another origin*, which is the common case, and
     * `object-src 'none'` plus `frame-ancestors 'none'` close the rest.
     */
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob:",
      "font-src 'self' data:",
      // Open-Meteo when weather is configured; nothing else reaches out.
      "connect-src 'self' https://api.open-meteo.com",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
      "upgrade-insecure-requests",
    ].join("; "),
  },
];

const nextConfig: NextConfig = {
  /*
   * These read the filesystem or ship native bindings, so they must stay in
   * Node's own module system rather than being bundled.
   */
  serverExternalPackages: ["@opensearch-project/opensearch", "exceljs", "bcryptjs"],

  /*
   * A self-contained server directory, so a container copies `.next/standalone`
   * and runs it — no `node_modules` install at image-build time, and an image
   * measured in tens of megabytes rather than hundreds.
   */
  output: "standalone",

  /* The version is useful in a footer and in a support conversation. */
  env: {
    NEXT_PUBLIC_APP_VERSION: process.env.npm_package_version ?? "0.0.0",
  },

  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
