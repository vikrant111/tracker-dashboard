/**
 * Every tunable literal in the product that is **not** an environment variable.
 *
 * The rule for what lives here versus `.env.local`:
 *
 * - **Environment** — anything that differs between one deployment and the next,
 *   or that must never be committed: URLs, credentials, secrets, the poll
 *   interval an operator wants to tune per environment.
 * - **Here** — anything that is a *product decision* and should be identical
 *   everywhere: field length caps, page sizes, how many people the leaderboard
 *   shows, how long a toast stays up. Changing one of these is a change to the
 *   product, so it belongs in the repository where it can be reviewed.
 *
 * Scene geometry (`lib/sky.ts`) and the takeover maths (`lib/takeover.ts`) keep
 * their own constants: they are only meaningful next to the equations that use
 * them, and pulling them here would make both files harder to read, not easier.
 */
export { LIMITS, PAGE } from "./constants/storage.ts";
export { TIMING } from "./constants/timing.ts";
export { SESSION, LOGIN } from "./constants/auth.ts";
export { AZURE, AGEING } from "./constants/board.ts";
export { SCENE } from "./constants/scene.ts";
export { EXPORT, UPLOAD } from "./constants/spreadsheet.ts";
