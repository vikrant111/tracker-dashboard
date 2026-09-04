import path from "node:path";
import type { NextConfig } from "next";

/**
 * Where the three typefaces come from, set by `FONT_SOURCE`.
 *
 * | Value | Fetches at build | Ships font files |
 * |---|---|---|
 * | `google` (default) | yes, from Google | yes, self-hosted after download |
 * | `local` | **no** | yes, from `src/fonts/files/` |
 * | `system` | **no** | no — the reader's own fonts |
 *
 * The choice has to be made here rather than in application code, because
 * `next/font/google` downloads whatever it can see at compile time. A runtime
 * `if` would compile all three branches and fetch anyway.
 *
 * **The modules live in `src/fonts/`, deliberately not under `src/app/`.** Next
 * processes font loaders for every file in the app tree, whether or not the
 * module graph reaches it — so while they sat in `src/app/fonts/`, the Google
 * branch was compiled and fetched in *all three* modes. Moving them one
 * directory out is what actually makes `local` and `system` offline. Do not
 * move them back.
 *
 * Those two are the modes for a machine behind a TLS-inspecting proxy, where
 * the build otherwise dies on `unable to get local issuer certificate`. See
 * `docs/restricted-environments.md`.
 */
const FONT_SOURCES = ["google", "local", "system"] as const;
const requested = process.env.FONT_SOURCE?.trim().toLowerCase() || "google";

if (!FONT_SOURCES.includes(requested as (typeof FONT_SOURCES)[number])) {
  // Loudly, at config load — a typo here would otherwise silently ship Google.
  throw new Error(
    `FONT_SOURCE is "${requested}". Use one of: ${FONT_SOURCES.join(", ")}. ` +
      `"local" and "system" need no network at build time.`,
  );
}

const fontModule = path.resolve(process.cwd(), `src/fonts/${requested}.ts`);

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
  serverExternalPackages: ["mongoose", "exceljs", "bcryptjs"],

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

  /*
   * The font switch, for Turbopack (`next dev`) and webpack (`next build`).
   * Both are declared because which one runs depends on the command and the
   * flags, and a switch that only works in dev would be found at deploy time.
   */
  turbopack: {
    resolveAlias: { "@/fonts": `./src/fonts/${requested}.ts` },
  },

  /*
   * Replacement rather than `resolve.alias`, because Next resolves the `@/*`
   * tsconfig path first — an alias keyed on `@/fonts` is simply never
   * consulted, and the Google branch compiles and fetches anyway. This matches
   * on the *resolved* file instead, which nothing gets in front of.
   */
  /*
   * Do not treat the data store as source.
   *
   * The `json` driver writes `DB_store/*.json`, which lives inside the project
   * — deliberately, so a clone carries its data. But the dev server watches the
   * project, so **every write looked like a source edit**: Next recompiled,
   * rewrote its own manifests, and any request in flight hit a half-written one
   * and died on `SyntaxError: Unexpected end of JSON input`.
   *
   * That surfaced as unrelated routes failing at random, only ever on the file
   * driver, and it was the whole of it.
   */
  webpack: (config, { webpack }) => {
    /*
     * Next's default `ignored` may be a string, a RegExp or an array, so it is
     * replaced rather than spread — spreading a string produced
     * "Invalid attempt to spread non-iterable instance" and the dev server
     * refused to start at all.
     *
     * `node_modules` is restored explicitly because replacing the default drops
     * it, and watching it would be far worse than what this is fixing.
     */
    config.watchOptions = {
      ...(typeof config.watchOptions === "object" && config.watchOptions ? config.watchOptions : {}),
      ignored: ["**/node_modules/**", "**/.git/**", "**/.next/**", "**/DB_store/**", "**/.mongo-data/**"],
    };
    config.plugins.push(
      new webpack.NormalModuleReplacementPlugin(
        /[\\/]src[\\/]fonts[\\/]index\.ts$/,
        fontModule,
      ),
    );
    return config;
  },

  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
