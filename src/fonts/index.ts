/**
 * Which font source the build uses, chosen by `FONT_SOURCE` in the environment.
 *
 * This file is only the default. `next.config.ts` rewrites the specifier
 * `@/fonts` to `local.ts` or `system.ts` at build time — the switch has to
 * happen in the bundler rather than here, because `next/font` resolves
 * whatever it sees at *compile* time. An `if` in this file would still compile
 * both branches.
 *
 * Neither branch touches the network. The faces are committed under `files/`.
 */
export { fontClassName } from "./local";
