/**
 * Which font source the build uses, chosen by `FONT_SOURCE` in the environment.
 *
 * This file is only the default. `next.config.ts` rewrites the specifier
 * `@/fonts` to `google.ts`, `local.ts` or `system.ts` at build time — the
 * switch has to happen in the bundler rather than here, because `next/font`
 * downloads whatever it sees at *compile* time. An `if` in this file would
 * still compile all three branches, and the Google fetch would still run.
 */
export { fontClassName } from "./google";
