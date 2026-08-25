import { readFileSync, readdirSync } from "node:fs";

/**
 * The real modules, imported — not reimplemented.
 *
 * These sections used to mirror the logic here so it could run without a
 * browser. That made every one of them untestable: mutating the source left the
 * copy untouched, so the suite passed on knowingly broken code. Node strips the
 * types on import, so there is no reason to keep a copy.
 *
 * Only the dial's pointer maths is still mirrored, and deliberately: it lives
 * inside a client component that cannot be imported here.
 */
import { phaseFor, displayName, MAX_NAME } from "../src/lib/greeting.ts";
import {
  BODY_X,
  GROUND,
  HORIZON_Y,
  MEADOW_DEPTH,
  SUNRISE,
  SUNSET,
  SYNODIC_MONTH,
  VIEW_H,
  VIEW_W,
  ZENITH_Y,
  arcBounds,
  illumination,
  liftBy,
  meadowDepthFor,
  moonName,
  moonPhase,
  moonShadowPath,
  placeBody,
  skyAbove,
  skyBodies,
  visibleXRange,
} from "../src/lib/sky.ts";
import { currentWeather, skyForCode } from "../src/lib/weather.ts";
import { AGEING, AZURE, EXPORT, LIMITS, LOGIN, PAGE, SCENE, SESSION, TIMING, UPLOAD } from "../src/lib/constants.ts";
import { MIN_SECRET_LENGTH, resolveAuthSecret } from "../src/lib/auth-secret.ts";
import { checkSession, secondsRemaining } from "../src/lib/session-policy.ts";
import { authCookies } from "../src/lib/auth-cookies.ts";
import { lockedFor, recordFailure, recordSuccess, resetThrottle } from "../src/lib/login-throttle.ts";
import { mergeRoster } from "../src/lib/roster.ts";
import { MIN_PASSWORD, isEmail, validateTeam, validateUser, validatePasswordChange, validatePasswordReset } from "../src/lib/validation.ts";
import { detectSheet, isLegacyXls, isZip, whyNotReadable } from "../src/lib/spreadsheet.ts";
import { readNumbers } from "../src/lib/numbers.ts";
import { endLabelPositions } from "../src/components/trend-end-labels.ts";
import { closedRatio, healthScore } from "../src/lib/health.ts";
import { LEGACY, numbersBundle, stringCell, zip } from "./lib/numbers-fixture.mjs";
import { highlight, suggest } from "../src/lib/suggest.ts";
import { EXPORT_COLUMNS, fromAzure, mapHeaders, pickDataSheet, toRow } from "../src/lib/normalize.ts";
import {
  FEATHER_MAX,
  MAX_ZOOM,
  MIN_SPAN,
  PARALLAX_MAX,
  SPAN_HEIGHT,
  anchorIsUsable,
  clipPathAt,
  ease,
  insetAt,
  featherAt,
  maskImageAt,
  parallaxAt,
  takeoverEnd,
  takeoverProgress,
  veilAt,
  zoomAt,
} from "../src/lib/takeover.ts";

/**
 * The admin screen, as one string.
 *
 * It was a single 791-line file holding the POD editor, the member editor, the
 * Azure connection and the people list — four unrelated jobs. Each is its own
 * file under `admin/panels/` now; the checks care that the screen as a whole
 * obeys its rules, not which file a rule landed in.
 */
const ADMIN_FILES = [
  new URL("../src/app/admin/admin-client.tsx", import.meta.url),
  ...readdirSync(new URL("../src/app/admin/panels/", import.meta.url))
    .filter((f) => f.endsWith(".tsx") || f.endsWith(".ts"))
    .sort()
    .map((f) => new URL(f, new URL("../src/app/admin/panels/", import.meta.url))),
];
const adminSource = () => ADMIN_FILES.map((u) => readFileSync(u, "utf8")).join("\n");


/**
 * The shared interface pieces, as one string.
 *
 * `ui.tsx` is a barrel over `ui/` — one 750-line module meant finding the
 * tooltip required scrolling past the menu's keyboard handling. The checks do
 * not care which file a rule lands in, only that the set as a whole obeys it,
 * so this reads the directory rather than a list that would go stale.
 */
const UI_DIR = new URL("../src/components/ui/", import.meta.url);
const uiSource = () =>
  readdirSync(UI_DIR)
    .filter((f) => f.endsWith(".tsx") || f.endsWith(".ts"))
    .sort()
    .map((f) => readFileSync(new URL(f, UI_DIR), "utf8"))
    .join("\n");


/**
 * The greeting, as one string.
 *
 * It lives in three files — the card, the world it looks out on, and the
 * animals in it — because one 880-line file held all three and a reader
 * looking for the grass had to scroll past a cat's leg joints. The checks do
 * not care which file a rule lands in, only that the scene as a whole obeys it.
 */
const GREETING_FILES = readdirSync(new URL("../src/components/", import.meta.url))
  .filter((f) => /^greeting/.test(f) && (f.endsWith(".tsx") || f.endsWith(".ts")))
  .sort()
  .map((f) => `../src/components/${f}`);
const greetingSource = () =>
  GREETING_FILES.map((f) => readFileSync(new URL(f, import.meta.url), "utf8")).join("\n");


/**
 * Client-side pure logic, checked without a browser: the health dial's pointer
 * maths and the greeting's time/name rules.
 *
 *   pnpm check:ui
 *
 * Dragging the ring shows a *hypothetical* score. It must never produce a value
 * outside 0..100, never NaN, and never leave a scrubbed number on screen after
 * the gesture ends — a stale explore value would be the dashboard displaying a
 * board health that is not real, which is the one thing this project must not do.
 *
 * The maths is duplicated here rather than imported because the component is a
 * client module; keep the two in step (see health-dial.tsx `valueAt`).
 */
const SIZE = 200;
// Mirrors DEAD_ZONE_RATIO: a fraction of the radius, since the dial is fluid.
const RADIUS = 100;
const DEAD_ZONE = RADIUS * 0.28;
const clamp = (n) => Math.min(100, Math.max(0, n));

/** Mirror of `valueAt` in src/components/health-dial.tsx. */
function valueAt(dx, dy) {

  const dist = Math.hypot(dx, dy);
  if (!Number.isFinite(dist) || dist < DEAD_ZONE) return null;
  const deg = (Math.atan2(dy, dx) * 180) / Math.PI;
  const v = clamp(Math.round(((((deg + 90) % 360) + 360) % 360) / 3.6));
  return Number.isFinite(v) ? v : null;
}

let failures = 0;
let checks = 0;
function check(label, pass, detail = "") {
  checks++;
  if (!pass) {
    failures++;
    console.log(`  ✗ ${label}  ${detail}`);
  } else if (process.env.VERBOSE) console.log(`  ✓ ${label}  ${detail}`);
}
const section = (t) => console.log("\n" + t);

section("cardinal points map to the expected score");
const R = 70;
for (const [label, dx, dy, want] of [
  ["top (12 o'clock) → 0", 0, -R, 0],
  ["right (3 o'clock) → 25", R, 0, 25],
  ["bottom (6 o'clock) → 50", 0, R, 50],
  ["left (9 o'clock) → 75", -R, 0, 75],
]) {
  check(label, valueAt(dx, dy) === want, `got ${valueAt(dx, dy)}`);
}

section("every direction stays in range and finite");
let out = 0;
let nan = 0;
for (let deg = 0; deg < 360; deg += 0.25) {
  for (const radius of [DEAD_ZONE + 0.5, 40, 90, 400, 5000]) {
    const a = (deg * Math.PI) / 180;
    const v = valueAt(radius * Math.cos(a), radius * Math.sin(a));
    if (v === null) continue;
    if (!Number.isFinite(v)) nan++;
    if (v < 0 || v > 100) out++;
  }
}
check("no value outside 0..100", out === 0, `${out} out of range`);
check("no non-finite value", nan === 0, `${nan} non-finite`);

section("the dead zone suppresses noise near the centre");
check("exact centre returns null", valueAt(0, 0) === null);
for (const r of [1, 10, 27.9]) {
  const a = Math.PI / 3;
  check(`radius ${r} is inside the dead zone`, valueAt(r * Math.cos(a), r * Math.sin(a)) === null);
}
check("just outside the dead zone reads a value", valueAt(0, -(DEAD_ZONE + 1)) !== null);

section("hostile pointer coordinates");
for (const [label, dx, dy] of [
  ["NaN x", NaN, 10],
  ["NaN y", 10, NaN],
  ["Infinity", Infinity, 10],
  ["-Infinity", -Infinity, -Infinity],
  ["huge", 1e12, -1e12],
]) {
  const v = valueAt(dx, dy);
  const safe = v === null || (Number.isFinite(v) && v >= 0 && v <= 100);
  check(`${label} cannot yield a bad score`, safe, `got ${v}`);
}

section("keyboard stepping stays in range");
let v = 50;
for (let i = 0; i < 400; i++) v = clamp(v + 10);
check("repeated increase saturates at 100", v === 100, `=${v}`);
for (let i = 0; i < 400; i++) v = clamp(v - 10);
check("repeated decrease saturates at 0", v === 0, `=${v}`);

section("band thresholds are the documented ones");
const BANDS = [
  { min: 85, label: "Holding steady" },
  { min: 65, label: "Some drag" },
  { min: 40, label: "Falling behind" },
  { min: 0, label: "Needs a triage day" },
];
const bandFor = (s) => BANDS.find((b) => s >= b.min);
for (const [score, label] of [
  [100, "Holding steady"], [85, "Holding steady"], [84, "Some drag"],
  [65, "Some drag"], [64, "Falling behind"], [40, "Falling behind"],
  [39, "Needs a triage day"], [0, "Needs a triage day"],
]) {
  check(`score ${score} → ${label}`, bandFor(score).label === label, bandFor(score).label);
}
check("every score 0..100 lands in a band", Array.from({ length: 101 }, (_, i) => bandFor(i)).every(Boolean));


// ------------------------------------------------------------------ greeting

section("greeting — every hour lands in exactly one phase");
const PHASES = ["morning", "afternoon", "evening", "night"];
const covered = Array.from({ length: 24 }, (_, h) => phaseFor(h));
check("all 24 hours resolve to a known phase", covered.every((p) => PHASES.includes(p)));
check("every phase is reachable", PHASES.every((p) => covered.includes(p)), covered.join(","));
for (const [h, want] of [
  [5, "morning"], [11, "morning"], [12, "afternoon"], [16, "afternoon"],
  [17, "evening"], [20, "evening"], [21, "night"], [0, "night"], [4, "night"],
]) {
  check(`hour ${h} → ${want}`, phaseFor(h) === want, phaseFor(h));
}

section("greeting — hostile hours cannot break the scene");
for (const [label, h] of [["NaN", NaN], ["Infinity", Infinity], ["negative", -3], ["past 24", 49], ["float", 13.9]]) {
  const p = phaseFor(h);
  check(`${label} still yields a phase`, PHASES.includes(p), String(p));
}

section("greeting — the displayed name");
for (const [raw, want] of [
  ["Vikrant Sharma", "Vikrant"],
  ["ananya.rao@example.com", "Ananya"],
  ["admin@example.com", "Admin"],
  ["priya_nair", "Priya"],
  ["KM", "KM"],
  ["", "there"],
  [null, "there"],
  [undefined, "there"],
  ["   ", "there"],
  ["@nodomain", "there"],
]) {
  check(`${JSON.stringify(raw)} → ${want}`, displayName(raw) === want, displayName(raw));
}
check("a very long name is truncated", displayName("A".repeat(80)).length <= MAX_NAME, String(displayName("A".repeat(80)).length));
check("newlines cannot break the line", !displayName("Ana\nRao").includes("\n"));
check("output is never empty", ["", null, undefined, "  ", "@@@"].every((v) => displayName(v).length > 0));


// ----------------------------------------------------------------- sky scene

section("greeting sky — the flyers");
{
  const src = greetingSource();
  const css = readFileSync(new URL("../src/app/globals.css", import.meta.url), "utf8");

  // Scoped to each table, or one flyer's rules end up measuring another's.
  const tableOf = (name) => src.match(new RegExp(`const ${name} = \\[([\\s\\S]*?)\\n\\];`))?.[1] ?? "";
  const numbers = (block, key, pattern) => [...block.matchAll(new RegExp(`${key}: ${pattern}`, "g"))].map((m) => Number(m[1]));
  const batTable = tableOf("CHOREOGRAPHY");
  const gullTable = tableOf("GULL_PATHS");
  const bats = numbers(batTable, "cross", '"(\\d+)s"');
  const flaps = numbers(batTable, "flap", '"([\\d.]+)s"');
  const scales = numbers(batTable, "scale", "([\\d.]+)");
  const gullCross = numbers(gullTable, "cross", '"(\\d+)s"');
  const gullFlaps = numbers(gullTable, "flap", '"([\\d.]+)s"');
  const gullScales = numbers(gullTable, "scale", "([\\d.]+)");
  const clouds = [...src.matchAll(/dur: "(\d+)s"/g)].map((m) => Number(m[1]));

  // Clouds: a silhouette with humps, not a row of ellipses in a line.
  check("clouds are a drawn silhouette", /function Cloud\(/.test(src));
  const cloud = src.slice(src.indexOf("function Cloud("), src.indexOf("function Cloud(") + 700);
  check("a cloud has several humps", (cloud.match(/<circle/g) || []).length >= 4, String((cloud.match(/<circle/g) || []).length));
  check("a cloud has a flat base", /<rect[^>]*rx=/.test(cloud));
  check("clouds are one silhouette, not outlined shapes", !/stroke=/.test(cloud));
  check("clouds drift", src.includes('anim("sky-drift"'));
  check("@keyframes sky-drift exists", css.includes("@keyframes sky-drift"));
  // Drift is slower than anything that flies, or the sky reads as moving backwards.
  const cloudDurs = [...src.matchAll(/dur: "(\d+)s"/g)].map((m) => Number(m[1]));
  const flyers = [...bats, ...gullCross];
  check("clouds drift slower than the flyers", Math.min(...cloudDurs) > Math.max(...flyers), `${Math.min(...cloudDurs)} vs ${Math.max(...flyers)}`);
  check("no two clouds drift in lockstep", new Set(cloudDurs).size === cloudDurs.length, cloudDurs.join(","));
  // With no weather provider there is nothing to be truthful about, so the sky
  // gets scenery. A provider that *says* clear still gets one wisp.
  check("an unconfigured sky still has clouds", SCENE.clouds.unknown >= 3, `${SCENE.clouds.unknown}`);
  check("a reported clear sky stays clear", SCENE.clouds.clear === 1, `${SCENE.clouds.clear}`);
  check("every condition has a cloud count", ["clear", "cloudy", "overcast", "rain", "snow", "storm", "fog"].every((k) => Number.isInteger(SCENE.clouds[k]) && SCENE.clouds[k] >= 0));
  check("worse weather is not clearer", SCENE.clouds.overcast >= SCENE.clouds.cloudy && SCENE.clouds.cloudy >= SCENE.clouds.clear);
  check("real weather still drives the count", src.includes("weather ? (CLOUD_COUNT[weather.sky]"));

  // Removed animals stay removed. Each of these was drawn once and taken out
  // again; without a standing guard the next scene edit quietly brings it back.
  // Gulls were removed once and are back on purpose, so the old guard is gone.
  // What must not come back is the *first* implementation, which flapped with a
  // single rigid wing and read as a paper aeroplane.
  check("the old gull implementation stays gone", !/const BIRDS|function Bird\(/.test(src));
  check("its keyframes stay gone too", !css.includes("@keyframes sky-wing-left"));
  check("no swan remains", !/function Swan\(/.test(src));
  check("no swan is cast", !/swan:/.test(src));
  check("no swan is drawn", !/<Swan\b/.test(src));
  check("no swan keyframes remain", !css.includes("@keyframes sky-swan-neck") && !css.includes("@keyframes sky-ripple"));

  check("the bat choreography defines three distances", bats.length === 3 && scales.length === 3, `${bats.length} defined`);

  /*
   * The gulls follow the same perspective rule as the bats: further away is
   * smaller, slower to cross and slower to beat. Getting one of the three
   * backwards is what makes a scene feel wrong without anyone being able to say
   * why.
   */
  check("the gull choreography defines more than one", gullCross.length >= 2, `${gullCross.length} defined`);
  check("the scene asks for a sane number of gulls", Number.isInteger(SCENE.gulls) && SCENE.gulls >= 0 && SCENE.gulls <= gullCross.length, `${SCENE.gulls}`);
  check("the gull count is clamped to its choreography", /GULL_PATHS\.slice\(0, Math\.max\(0, Math\.min\(SCENE\.gulls, GULL_PATHS\.length\)\)\)/.test(src));
  check("gulls are ordered near to far", gullScales.join() === [...gullScales].sort((a, b) => b - a).join(), gullScales.join(", "));
  check("further gulls cross more slowly", gullCross.every((c, i) => i === 0 || c > gullCross[i - 1]), gullCross.join(", "));
  check("further gulls beat more slowly", gullFlaps.every((f, i) => i === 0 || f > gullFlaps[i - 1]), gullFlaps.join(", "));

  /*
   * A gull soars and a bat does not. If their beats converge the two stop being
   * distinguishable in the air, which is most of what identifies them at this
   * size.
   */
  check("gulls beat more slowly than bats", Math.min(...gullFlaps) > Math.min(...flaps), `gull ${Math.min(...gullFlaps)}s vs bat ${Math.min(...flaps)}s`);
  check("gulls glide, with a long hold", /38%,\n  100% \{\n    transform: rotate\(-4deg\)/.test(css));
  check("the gull's outer wing is hinged", css.includes("@keyframes sky-gull-tip-left") && css.includes("@keyframes sky-gull-tip-right"));
  check("the scene asks for a sane number of bats", Number.isInteger(SCENE.bats) && SCENE.bats >= 0 && SCENE.bats <= bats.length, `${SCENE.bats}`);
  check("the count is clamped to the choreography", /CHOREOGRAPHY\.slice\(0, Math\.max\(0, Math\.min\(SCENE\.bats, CHOREOGRAPHY\.length\)\)\)/.test(src));

  // Slow was the explicit ask: anything under a minute reads as darting.
  check("every bat takes at least 60s to cross", bats.every((b) => b >= 60), bats.join("s, ") + "s");

  // Perspective: further away is smaller, slower to cross and slower to beat.
  const byScale = [...scales].sort((a, b) => b - a);
  check("bats are ordered near to far", scales.join() === byScale.join(), scales.join(", "));
  check("smaller bats cross more slowly", bats.every((b, i) => i === 0 || b > bats[i - 1]), bats.join(", "));
  check("smaller bats beat more slowly", flaps.every((f, i) => i === 0 || f > flaps[i - 1]), flaps.join(", "));

  // A cloud overtaking a flyer reads as the sky moving backwards.
  check(
    "clouds drift slower than every bat",
    Math.min(...clouds) > Math.max(...bats),
    `cloud ${Math.min(...clouds)}s vs bat ${Math.max(...bats)}s`,
  );

  // Wings must oppose each other, and a bat has no glide phase.
  check("bat wings are opposed", css.includes("@keyframes sky-bat-left") && css.includes("@keyframes sky-bat-right"));
  const batLeft = css.match(/@keyframes sky-bat-left\s*\{([\s\S]*?)\n\}/)?.[1] ?? "";
  // A glide would show as a held pair of stops late in the cycle, e.g. "60%, 100%".
  check("the bat beat is continuous, with no glide hold", !/[1-9]\d%,\s*\n\s*100%/.test(batLeft));
  check("the bat path undulates", /@keyframes sky-bat-path[\s\S]*?25%[\s\S]*?75%/.test(css));

  // With motion off, every flyer needs somewhere sensible to rest.
  const rests = [...src.matchAll(/restX: (\d+)/g)].map((m) => Number(m[1]));
  const batRests = (batTable.match(/restX: \d+/g) ?? []).length;
  check("each bat has a resting position", batRests === bats.length, `${batRests} rests for ${bats.length} bats`);
  // Motion off has to park the gulls somewhere too, or they pile up at x=0.
  check("gulls rest somewhere with motion off", src.includes("180 + i * 90"));
  check("resting positions are spread out", new Set(rests).size === rests.length, rests.join(", "));

  // The walkers must stand on the ground, inside the frame.
  const viewBoxH = VIEW_H;
  const ground = GROUND;
  check("the viewBox is short enough to keep the ground in frame", viewBoxH > 0 && viewBoxH <= 130, `height ${viewBoxH}`);
  check("the ground sits inside the viewBox", ground > 0 && ground < viewBoxH, `ground ${ground} of ${viewBoxH}`);

  // The cat is drawn with feet at y+7 in local units, scaled 0.8. If those land
  // below the ground line the legs get cropped — which is exactly what happened.
  // Anchor on the cat's own block: several groups share scale(0.8), and a bare
  // match picked up the crane instead, so this check was measuring the wrong animal.
  const catBlock = src.slice(src.indexOf("CAST[phase].cat &&"));
  const catY = Number(catBlock.match(/translate\(0px, (\d+)px\)/)?.[1] ?? 0);
  check("the cat's feet land on or above the ground", catY > 0 && catY + 5.6 <= ground, `feet ${catY + 5.6}, ground ${ground}`);
}

section("greeting sky — the grass");
{
  const src = greetingSource();
  const css = readFileSync(new URL("../src/app/globals.css", import.meta.url), "utf8");

  // The hard 1px ground line is gone. It was the one thing in the scene that
  // could not exist outside a diagram — it read as a border, not as ground.
  check("the ruled ground line is gone", !/M 0 \$\{GROUND\} L \$\{VIEW_W\} \$\{GROUND\}/.test(src));
  check("a meadow is drawn instead", /function Meadow\(/.test(src));
  check("@keyframes sky-grass-sway exists", css.includes("@keyframes sky-grass-sway"));

  // Two layers, so the cast walks *through* the field rather than on top of it.
  check("there is a far layer and a near one", src.includes('layer="back"') && src.includes('layer="front"'));
  check("the far grass is drawn before the cast", src.indexOf('layer="back"') < src.indexOf("CAST[phase].bat"));
  check("the near grass is drawn after it", src.indexOf('layer="front"') > src.indexOf("CAST[phase].cat"));
  check("the meadow only grows where there is ground", (src.match(/grounded && <Meadow/g) || []).length === 2);

  // The reader asked that the cat's legs stay visible. The cat's paws land at
  // y≈107; the near fringe is scaled to 0.45 so it reaches its ankles, no more.
  const frontScale = Number(src.match(/\(back \? 1 : ([\d.]+)\)/)?.[1] ?? 1);
  check("the near fringe is short", frontScale > 0 && frontScale <= 0.5, String(frontScale));
  const maxTuft = 5 + 3;
  check("the near fringe cannot hide the cat's legs", GROUND - maxTuft * 1.25 * frontScale > 105, String(GROUND - maxTuft * 1.25 * frontScale));

  // Grass must not reach the top of the frame or it stops being grass.
  check("the far grass stays near the ground", GROUND - maxTuft * 1.25 > GROUND - 15);

  // Wind has a direction: a symmetric sway reads as a metronome, like the cat's
  // legs did before they were fixed.
  const sway = css.match(/@keyframes sky-grass-sway\s*\{([\s\S]*?)\n\}/)?.[1] ?? "";
  const angles = [...sway.matchAll(/rotate\((-?[\d.]+)deg\)/g)].map((m) => Number(m[1]));
  check("the sway is asymmetric, like wind", Math.abs(Math.max(...angles)) !== Math.abs(Math.min(...angles)), angles.join(","));
  check("the sway is gentle", Math.max(...angles.map(Math.abs)) <= 6, String(Math.max(...angles.map(Math.abs))));
  check("tufts rotate about their base", src.includes("transformOrigin: `${t.x}px ${baseline}px`"));

  // The meadow itself: layered depth rather than a single floor.
  check("the meadow has three depth bands", ["--sky-meadow-1", "--sky-meadow-2", "--sky-meadow-3"].every((t) => src.includes(t)));
  check("each band is a rolling edge, not a straight one", /function bandPath\(/.test(src) && src.includes("Q "));
  check("the bands are filled to the bottom of the frame", src.includes("L ${VIEW_W} ${VIEW_H} L 0 ${VIEW_H} Z"));
  check("the near band is where the cast walks", /near: GROUND,/.test(src));
  check("the bands are derived from the meadow's depth", /function meadowBands\(/.test(src));

  // Every flying thing and the height it rides at, read from the component.
  /** Every `{ y, …, depth }` entry in one named table. */
  const pathsIn = (table) => {
    const block = src.match(new RegExp(`const ${table} = \\[([\\s\\S]*?)\\n\\];`))?.[1] ?? "";
    return [...block.matchAll(/\{ y: (\d+),[\s\S]*?depth: ([\d.]+) \}/g)].map((m) => [Number(m[1]), Number(m[2])]);
  };

  const FLYERS = [
    ...pathsIn("CHOREOGRAPHY").map(([y, d], i) => [`bat ${i + 1}`, y, d]),
    ...pathsIn("GULL_PATHS").map(([y, d], i) => [`gull ${i + 1}`, y, d]),
    ...pathsIn("CRANE_PATHS").map(([y, d], i) => [`crane ${i + 1}`, y, d]),
    ...[...src.matchAll(/\{ y: (\d+), s: [\d.]+, dur: [\s\S]*?depth: ([\d.]+) \}/g)].map((m, i) => [
      `cloud ${i + 1}`,
      Number(m[1]),
      Number(m[2]),
    ]),
  ];
  check("every flyer's height was found in the source", FLYERS.length >= 9 && FLYERS.every(([, y, d]) => Number.isFinite(y) && Number.isFinite(d)), `${FLYERS.length} flyers`);

  // --- the horizon sits at the bottom, at every size --------------------
  //
  // The bug: the meadow held a fixed 22-unit depth however tall the frame got,
  // so on a full-height background it was a thin strip stranded halfway down
  // the screen with flat colour beneath it.
  for (const [label, vw, vh] of [
    ["desktop 2000", 2000, 1200],
    ["laptop 1440", 1440, 900],
    ["tablet 820", 820, 1180],
    ["phone 400", 400, 865],
    ["phone 320", 320, 690],
  ]) {
    const above = skyAbove(vw, vh);
    const total = VIEW_H + above;
    const depth = meadowDepthFor(above);
    const horizonPct = ((GROUND - depth + above) / total) * 100;
    const groundPct = ((GROUND + above) / total) * 100;
    check(`${label}: the grass is at the bottom, not the middle`, horizonPct > 60, `horizon ${horizonPct.toFixed(0)}% down`);
    check(`${label}: the meadow is a real band, not a sliver`, 100 - horizonPct > 15, `${(100 - horizonPct).toFixed(0)}% of the screen`);
    check(`${label}: the ground line reaches the bottom`, groundPct > 90, `${groundPct.toFixed(0)}%`);
    // The sun must still have sky to climb into.
    const arc = arcBounds(above);
    const zenithPct = ((arc.zenith + above) / total) * 100;
    check(`${label}: the sun climbs into the added sky`, zenithPct > 0 && zenithPct < 30, `zenith ${zenithPct.toFixed(0)}%`);

    // ...and must not sit down in the grass at its lowest. The arc's low end
    // rises faster than the ground does, so it clears the horizon rather than
    // grazing it — an hour after sunset the moon was among the tufts.
    const lowPct = ((arc.horizon + above) / total) * 100;
    check(
      `${label}: the moon never sinks into the grass`,
      lowPct < horizonPct - 2,
      `lowest ${lowPct.toFixed(0)}% vs grass at ${horizonPct.toFixed(0)}%`,
    );

    // Every flyer belongs in the upper half. Authored for a 120-tall scene and
    // left alone, they cluster in the bottom fifth — bats skimming the grass.
    //
    // The y/depth pairs are read out of the component, not written here. Typed
    // in by hand, this loop passed happily while the shipped crane sat on the
    // horizon — the check was testing its own copy of the numbers.
    for (const [who, y, depth] of FLYERS) {
      const pct = ((liftBy(y, above, depth) + above) / total) * 100;
      check(`${label}: the ${who} flies high`, pct < 50, `${pct.toFixed(0)}% down`);
      check(`${label}: the ${who} stays in frame`, pct > 0, `${pct.toFixed(0)}%`);
    }
  }

  // `liftBy` itself.
  check("no added sky means no lift", liftBy(30, 0, 0.7) === 30);
  check("a depth of 0 never moves anything", liftBy(30, 500, 0) === 30);
  check("a depth of 1 lifts by the whole added sky", liftBy(30, 500, 1) === -470);
  check("depth is clamped", liftBy(30, 100, 9) === liftBy(30, 100, 1) && liftBy(30, 100, -9) === 30);
  check("hostile lift input stays finite", [NaN, Infinity, -Infinity].every((v) => Number.isFinite(liftBy(v, 100, 0.5)) && Number.isFinite(liftBy(30, v, 0.5))));
  check("nothing is lifted below where it was drawn", [0, 50, 300].every((a) => liftBy(30, a, 0.5) <= 30));
  check("the card's own geometry is untouched", meadowDepthFor(0) === MEADOW_DEPTH);
  check("the card's arc is untouched", arcBounds(0).horizon === HORIZON_Y && arcBounds(0).zenith === ZENITH_Y);
  check("a deeper frame means a deeper meadow", meadowDepthFor(500) > meadowDepthFor(100));
  check("hostile input cannot collapse the meadow", [NaN, -50, Infinity].every((a) => meadowDepthFor(a) >= MEADOW_DEPTH));
  check("hostile input cannot break the arc", [NaN, -50].every((a) => Number.isFinite(arcBounds(a).horizon) && Number.isFinite(arcBounds(a).zenith)));
  check("there is a haze band at the horizon", src.includes("--sky-haze"));

  // Day and night: the ground has to darken with the sky, or a midnight card
  // shows a bright green field. One wash beats twelve more tokens.
  const tints = [...src.matchAll(/(morning|afternoon|evening|night): ([\d.]+),/g)].map((m) => [m[1], Number(m[2])]);
  const tint = Object.fromEntries(tints);
  check("every phase tints the ground", ["morning", "afternoon", "evening", "night"].every((p) => p in tint), JSON.stringify(tint));
  check("midday is the least tinted", tint.afternoon < tint.morning && tint.afternoon < tint.evening);
  check("night is the most tinted", tint.night > tint.evening && tint.evening > tint.morning, JSON.stringify(tint));
  check("no phase erases the meadow entirely", Object.values(tint).every((v) => v >= 0 && v <= 0.8));
  check("the wash uses the phase's own sky colour", src.includes("fill={`var(--sky-${phase ?? \"afternoon\"}-2)`}"));
  check("the tint crossfades rather than snapping", /transition: "opacity 1200ms var\(--ease\)"/.test(src));

  // The phase wash must be applied EXACTLY ONCE over the meadow. Drawn in both
  // layers it hit everything below y=102 twice, while the page-level meadow got
  // it once — a hard brown line across the background where the two met.
  const meadow = src.slice(src.indexOf("function Meadow("), src.indexOf("function Cloud("));
  const washes = (meadow.match(/opacity=\{tint\}/g) || []).length;
  check("the phase is washed over the meadow exactly once", washes === 1, `${washes} washes`);
  check("the wash covers the whole meadow, not just the near band", meadow.includes("y={band.far - band.depth * 0.4}"));

  // --- adaptive framing --------------------------------------------------
  //
  // "Adaptive without losing the details": the whole scene width has to survive
  // on every screen. A 10:3 strip cropped into a portrait band loses ~70%.
  for (const [label, bw, bh] of [
    ["desktop 1920", 1920, 576],
    ["laptop 1440", 1440, 432],
    ["tablet 820", 820, 543],
    ["phone 400", 400, 398],
    ["phone 320", 320, 317],
  ]) {
    const above = skyAbove(bw, bh);
    const viewBoxH = VIEW_H + above;
    // With the viewBox matched to the band's aspect, `meet` fills it exactly —
    // so the scale is width-driven and every horizontal unit is on screen.
    const aspectMatches = Math.abs(VIEW_W / viewBoxH - bw / bh) < 1e-6;
    check(`${label}: the frame adapts rather than cropping`, aspectMatches, `${above.toFixed(0)}u extra`);
    check(`${label}: extra sky is never negative`, above >= 0, String(above));
  }
  check("a card-shaped box needs no extra sky", skyAbove(400, 120) === 0);
  check("a wider-than-scene box needs no extra sky", skyAbove(2000, 300) === 0);
  check("a taller box gets more sky", skyAbove(400, 800) > skyAbove(400, 400));
  for (const bad of [[0, 0], [NaN, 100], [-5, -5], [100, Infinity]]) {
    check(`a ${JSON.stringify(bad)} box yields a real number`, Number.isFinite(skyAbove(bad[0], bad[1])), String(skyAbove(bad[0], bad[1])));
  }

  // The extra sky must not be left empty — clouds and stars spread into it.
  // One rule for every flyer, not five hand-written offsets.
  check("clouds rise into the added sky", /depth: [\d.]+/.test(src) && src.includes("liftBy(c.y, above, c.depth)"));
  check("stars rise into it too", src.includes("liftBy(y, above, depth)"));
  check("bats rise into it", src.includes("liftBy(b.y, above, b.depth)"));
  // The clouds map over `c` too, so matching `liftBy(c.y, …)` alone found
  // theirs. Anchored to the crane's own line, which carries `c.scale`.
  check("the crane rises into it", /liftBy\(c\.y, above, c\.depth\)\}px\) scale\(\$\{c\.scale\}/.test(src));

  /*
   * The crane was the odd one out: a plain on/off in the cast table with its
   * flight hardcoded in the JSX, while the two flyers either side of it had
   * counts. Every flyer works the same way now, and these keep it that way.
   */
  const flyerCount = (table, knob) => {
    const paths = (src.match(new RegExp(`const ${table} = \\[([\\s\\S]*?)\\n\\];`))?.[1] ?? "")
      .split("\n")
      .filter((l) => l.trim().startsWith("{")).length;
    check(`${table} defines flights`, paths >= 1, `${paths}`);
    check(`SCENE.${knob} is a sane count`, Number.isInteger(SCENE[knob]) && SCENE[knob] >= 0 && SCENE[knob] <= paths, `${SCENE[knob]} of ${paths}`);
    check(
      `the ${knob} count is clamped to its choreography`,
      new RegExp(`${table}\\.slice\\(0, Math\\.max\\(0, Math\\.min\\(SCENE\\.${knob}, ${table}\\.length\\)\\)\\)`).test(src),
    );
  };

  for (const [table, knob] of [["CHOREOGRAPHY", "bats"], ["GULL_PATHS", "gulls"], ["CRANE_PATHS", "cranes"]]) {
    flyerCount(table, knob);
  }

  // Perspective, for the cranes as for the others: further is smaller, slower
  // to cross and slower to beat. One of the three backwards is what makes a
  // scene feel wrong without anyone being able to say why.
  {
    const block = src.match(/const CRANE_PATHS = \[([\s\S]*?)\n\];/)?.[1] ?? "";
    const nums = (key, pattern) => [...block.matchAll(new RegExp(`${key}: ${pattern}`, "g"))].map((m) => Number(m[1]));
    const scales = nums("scale", "([\\d.]+)");
    const cross = nums("cross", '"(\\d+)s"');
    const flap = nums("flap", '"([\\d.]+)s"');
    check("cranes are ordered near to far", scales.join() === [...scales].sort((a, b) => b - a).join(), scales.join(", "));
    check("further cranes cross more slowly", cross.every((c, i) => i === 0 || c > cross[i - 1]), cross.join(", "));
    check("further cranes beat more slowly", flap.every((f, i) => i === 0 || f > flap[i - 1]), flap.join(", "));
    // A crane works its wings; a gull holds them. Their beats must not converge,
    // A crane has a slow, deep, deliberate wingbeat; a gull flaps quickly and
    // then holds. So the crane's cycle is the LONGER one — and if the two
    // converge they stop being distinguishable in the air, which is most of
    // what names them at this size.
    const gullFlap = [...(src.match(/const GULL_PATHS = \[([\s\S]*?)\n\];/)?.[1] ?? "").matchAll(/flap: "([\d.]+)s"/g)].map((m) => Number(m[1]));
    check("a crane beats slower and deeper than a gull", Math.min(...flap) > Math.min(...gullFlap), `crane ${Math.min(...flap)}s vs gull ${Math.min(...gullFlap)}s`);
  }

  // No flying thing is a bare boolean any more.
  check("the crane is no longer hardcoded", !/liftBy\(26, above, CRANE_DEPTH\)/.test(src));
  check("...and no flight time is inline", !/animation: "sky-fly 78s/.test(src));

  check("rain is spread through it", /liftBy\(0, above,/.test(src));
  {
    const bats = src.match(/const CHOREOGRAPHY = \[([\s\S]*?)\n\];/)?.[1] ?? "";
    check("every bat carries its own depth", (bats.match(/restX: \d+, depth: [\d.]+/g) || []).length === 3);
  }
  check("the card itself is unaffected", /const above = fit === "adapt" && measured \? skyAbove/.test(src));

  for (const token of ["--sky-meadow-1", "--sky-meadow-2", "--sky-meadow-3", "--sky-haze"]) {
    // Defined exactly once, outside every theme block — the scene does not
    // follow the theme, or an afternoon card goes navy in dark mode.
    check(`${token} is defined once, not per theme`, (css.match(new RegExp(`${token}:`, "g")) || []).length === 1);
  }

  // Nothing random: the server and the client must grow the same field.
  // Comments are stripped first — the comment *explaining* this rule names
  // `Math.random()`, and tripped the rule it documents.
  const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
  check("the field is not randomised", !/Math\.random/.test(code));
  check("tufts vary by index, not by chance", /const n = i \* 7 \+ seed \* 13/.test(src));
  const backCount = SCENE.grass.back;
  const frontCount = SCENE.grass.front;
  check("there is enough grass to read as a field", backCount >= 12 && frontCount >= 8, `${backCount}/${frontCount}`);
  // One animation per tuft, not per blade — three times the cost for no gain.
  check("the field stays under 50 animations", backCount + frontCount <= 50, `${backCount + frontCount}`);
  check("motion off leaves the grass still", /reduced \? undefined : `sky-grass-sway/.test(src));
  check("grass colours are tokens, not hex", !/#[0-9a-f]{3,6}/i.test(src.slice(src.indexOf("function Grass("), src.indexOf("function Grass(") + 1400)));
  for (const token of ["--sky-grass", "--sky-grass-2"]) {
    // Defined exactly once, outside every theme block — the scene does not
    // follow the theme, or an afternoon card goes navy in dark mode.
    check(`${token} is defined once, not per theme`, (css.match(new RegExp(`${token}:`, "g")) || []).length === 1);
  }
}

section("greeting sky — the cast by hour");
{
  const src = greetingSource();
  const css = readFileSync(new URL("../src/app/globals.css", import.meta.url), "utf8");

  const rowFor = (p) => SCENE.cast[p] ?? null;
  const has = (p, who) => rowFor(p)?.[who] === true;

  for (const p of ["morning", "afternoon", "evening", "night"]) {
    check(`${p} has a cast row`, !!rowFor(p) && Object.keys(rowFor(p)).length > 0);
  }

  // Every phase keeps at least one companion, or the card reads as empty.
  for (const p of ["morning", "afternoon", "evening", "night"]) {
    const any = ["crane", "squirrel", "cat", "bat"].some((w) => has(p, w));
    check(`${p} has at least one companion`, any);
  }

  // Nocturnal and diurnal habits, or the scene stops being believable.
  check("the cat appears after dark", has("night", "cat") && has("evening", "cat"));
  check("the cat is not out at midday", !has("morning", "cat") && !has("afternoon", "cat"));
  // Each of these keeps to one part of the day, deliberately.
  check("the crane is out in the morning", has("morning", "crane"));
  check(
    "the crane is out only in the morning",
    !has("afternoon", "crane") && !has("evening", "crane") && !has("night", "crane"),
  );
  check("the squirrel is out in the afternoon", has("afternoon", "squirrel"));
  check(
    "the squirrel is out only in the afternoon",
    !has("morning", "squirrel") && !has("evening", "squirrel") && !has("night", "squirrel"),
  );

  // Each animal is drawn and animated, not just listed.
  check("bats fly in the evening", has("evening", "bat"));
  check("bats fly at night", has("night", "bat"));
  check("no bats in daylight", !has("morning", "bat") && !has("afternoon", "bat"));
  check("the cat walks in the evening too", has("evening", "cat"));

  for (const who of ["Bat", "Crane", "Squirrel", "Cat"]) {
    check(`${who} is drawn`, new RegExp("function " + who + "\\(").test(src));
  }
  for (const kf of [
    "sky-bat-left", "sky-bat-right", "sky-bat-path",
    "sky-crane-left", "sky-crane-right", "sky-crane-tip-left", "sky-crane-tip-right",
    "sky-hop", "sky-tail-flick", "sky-tail-sway",
    "sky-thigh", "sky-shank", "sky-shank-hind", "sky-gait-bob", "sky-walk",
  ]) {
    check(`@keyframes ${kf} exists`, css.includes("@keyframes " + kf));
  }

  // Wings and limbs must move in opposition, never in lockstep.
  check("crane wings are opposed", css.includes("sky-crane-left") && css.includes("sky-crane-right"));
  check("crane wing tips are opposed", css.includes("sky-crane-tip-left") && css.includes("sky-crane-tip-right"));

  // --- the walk ---------------------------------------------------------
  //
  // The realism complaint was mostly gait. A leg that rotates symmetrically is
  // a pendulum; a leg that plants, holds, and then swings forward is a walk.
  // These pin the difference so it cannot quietly regress to a metronome.
  const kf = (name) => css.match(new RegExp(`@keyframes ${name}\\s*\\{([\\s\\S]*?)\\n\\}`))?.[1] ?? "";
  const stops = (name) => [...kf(name).matchAll(/(\d+)%/g)].map((m) => Number(m[1]));

  const thighTurn = stops("sky-thigh").find((p) => p > 0 && p < 100);
  check("the leg spends most of the stride planted", thighTurn >= 55, `turns at ${thighTurn}%`);
  check("the leg swings forward faster than it sweeps back", 100 - thighTurn < thighTurn, `${100 - thighTurn}% swing`);
  check("the shank is straight while it bears weight", /0%,\s*62%\s*\{\s*transform:\s*rotate\(0deg\)/.test(kf("sky-shank")));
  check("the shank folds to clear the ground", /rotate\(3\d deg\)|rotate\(3\d+deg\)/.test(kf("sky-shank").replace(/\s+/g, "")) || /rotate\(36deg\)/.test(kf("sky-shank")));
  check("the hock bends the other way to the knee", kf("sky-shank-hind").includes("rotate(-36deg)"));

  // A lateral-sequence walk: the four legs are a quarter-stride apart, so three
  // feet are down at any moment. Two legs sharing a phase is a trot.
  const catBlock = src.slice(src.indexOf("function Cat("), src.indexOf("function place("));
  const delays = [...catBlock.matchAll(/delay=\{?["`]-?\$?\{?(?:STRIDE \* )?([\d.]+)s?\}?["`]?\}?/g)].map((m) => Number(m[1]));
  const phases = [...catBlock.matchAll(/delay=(?:\{`-\$\{STRIDE \* ([\d.]+)\}s`\}|"0s")/g)].map((m) => Number(m[1] ?? 0));
  check("all four legs are drawn", (catBlock.match(/<CatLeg/g) || []).length === 4, String((catBlock.match(/<CatLeg/g) || []).length));
  check("no two legs share a phase", new Set(phases).size === phases.length, phases.join(","));
  check(
    "the legs are a quarter-stride apart",
    [...phases].sort().join(",") === "0,0.25,0.5,0.75",
    phases.join(","),
  );
  check("the gait and the bob share one stride constant", /const STRIDE = /.test(src) && !/1\.9s/.test(catBlock));
  check("the body rides the gait", src.includes("sky-gait-bob"));
  check("the bob is smaller than a pixel", /translateY\(-0\.\d+px\)/.test(kf("sky-gait-bob")));

  // --- anatomy ----------------------------------------------------------
  //
  // "Not realistic" was also shape. Each of these is a silhouette cue that the
  // first version missed, and each one is what the animal is recognised by.
  check("the cat's legs are jointed, not sticks", src.includes("function CatLeg("));
  check("the cat has a knee and a hock", src.includes("sky-shank-hind") && catBlock.includes("hind"));
  check("far-side legs read as further away", /far \? 0\.\d+ : 1/.test(src));
  check("the cat is not a bare ellipse", !/<ellipse cx="0" cy="0" rx="9"/.test(src));

  const squirrel = src.slice(src.indexOf("function Squirrel("), src.indexOf("function Cat("));
  // A squirrel is identified at distance by its tail alone, so it must be the
  // tallest thing on the animal — the first version drew a sliver.
  const tailTop = Math.min(...[...squirrel.matchAll(/-(\d+(?:\.\d+)?)\b/g)].map((m) => -Number(m[1])));
  check("the squirrel's tail is taller than its body", tailTop <= -15, `reaches ${tailTop}`);
  check("the squirrel has ears", (squirrel.match(/L [\d.-]+ -9/g) || []).length >= 1);

  const crane = src.slice(src.indexOf("function Crane("), src.indexOf("function Squirrel("));
  check("the crane's wing folds at the wrist", crane.includes("Outer wing") && crane.includes("sky-crane-tip-"));
  check("the crane flies with its neck extended", /M 3\.6 -0\.2 L 11\.4 -1\.4/.test(crane));
  check("the crane's legs trail past its tail", (crane.match(/L -1[34](?:\.\d+)? [\d.]+/g) || []).length >= 2);

  // Bounded by the squirrel: the crane moved to greeting-cast-birds.
  const bat = src.slice(src.indexOf("function Bat("), src.indexOf("function Squirrel("));
  check("the bat's wing has finger struts", bat.includes("--sky-membrane"));
  check("the bat has four fingers per wing", (bat.match(/M \$\{1\.2 \* dir\}/g) || []).length === 4);
  check("the membrane colour is a token, not a hex", !/#[0-9a-f]{3,6}/i.test(bat));

  // Every animation is opacity/transform only — anything else repaints per frame.
  const skyBlocks = [...css.matchAll(/@keyframes (sky-[\w-]+)\s*\{([\s\S]*?)\n\}/g)];
  const offenders = skyBlocks
    .filter(([, , body]) => /(?:^|\n)\s*(?!transform|opacity|scaleX)[a-z-]+:/.test(body.replace(/transform:[^;]*;|opacity:[^;]*;/g, "")))
    .map(([, name]) => name);
  check("sky keyframes animate transform/opacity only", offenders.length === 0, offenders.join(", "));

  // With motion off, every mover needs a resting position.
  check("the walking cat rests somewhere visible", /translateX\(\d+px\)/.test(src.slice(src.indexOf("CAST[phase].cat &&"))));
  check("the soaring crane rests somewhere visible", /transform: `translateX\(\$\{c\.restX\}px\)`/.test(src));
  check("...and every crane has one", (src.match(/const CRANE_PATHS = \[([\s\S]*?)\n\];/)?.[1] ?? "").match(/restX: \d+/g)?.length >= 1);
}

// ------------------------------------------------------------------ the sky

section("sky — where the sun and moon actually are");
{
  // A Date at the given local hour, so the real skyBodies() can be called.
  const at = (h) => {
    const d = new Date(2026, 5, 15, Math.floor(h), Math.round((h % 1) * 60));
    return skyBodies(d);
  };

  // Exactly one body holds the sky at any hour — never both, never neither.
  for (let h = 0; h < 24; h += 0.25) {
    const { sun, moon } = at(h);
    if (sun.up === moon.up) {
      check(`hour ${h}: exactly one body is up`, false, `sun ${sun.up}, moon ${moon.up}`);
      break;
    }
  }
  check("exactly one body is up at every hour", true);

  // The bug this fixes: a 19:00 sun was drawn blazing overhead.
  check("the sun is down at 19:00", at(19).sun.up === false);
  check("the moon is up at 19:00", at(19).moon.up === true);
  check("the sun is up at midday", at(12).sun.up === true);
  check("the moon is down at midday", at(12).moon.up === false);

  // A body rises in the east, peaks, and sets in the west.
  check("the sun is on the horizon at sunrise", at(SUNRISE).sun.altitude < 0.01);
  check("the sun is down the instant before sunrise", at(SUNRISE - 0.02).sun.up === false);
  check("the sun is down the instant after sunset", at(SUNSET).sun.up === false);
  check("the sun is highest at midday", at(12).sun.altitude > 0.99);
  check("the sun is low again by 17:00", at(17).sun.altitude < 0.3);
  check("the sun crosses from east to west", at(7).sun.x < at(16).sun.x);
  check("the moon crosses from east to west", at(19).moon.x < at(4).moon.x);

  // Altitude and position must stay in range no matter what the clock says.
  // Every minute of the day, plus the clocks a broken caller might hand over.
  let bad = 0;
  const inRange = (n) => Number.isFinite(n) && n >= 0 && n <= 1;
  const scan = (bodies) => {
    for (const b of [bodies.sun, bodies.moon]) {
      if (!inRange(b.x) || !inRange(b.altitude)) bad++;
    }
  };
  for (let m = 0; m < 24 * 60; m++) scan(at(m / 60));
  for (const d of [new Date(NaN), new Date(0), new Date(8.64e15), new Date(-1)]) scan(skyBodies(d));
  check("no clock can push a body off the canvas", bad === 0, `${bad} out of range`);
}

section("sky — the sun and moon stay where they can be seen");
{
  // The bug: the body's x swept east to west across the full scene, and the card
  // crops to the middle of that scene — so for most of its time up, the moon was
  // outside the crop. On the page it was drawn half off the left edge.
  const alts = Array.from({ length: 101 }, (_, i) => i / 100);

  // 1. It rises and sets vertically. Only the height may change.
  const xs = new Set(alts.map((a) => placeBody({ x: a, altitude: a, up: true }).cx));
  check("the horizontal position never changes", xs.size === 1, [...xs].join(","));
  check("a body's own x is ignored", placeBody({ x: 0, altitude: 0.5, up: true }).cx === placeBody({ x: 1, altitude: 0.5, up: true }).cx);

  check("on the horizon at rise and set", placeBody({ x: 0, altitude: 0, up: true }).cy === HORIZON_Y);
  check("at its highest at the zenith", placeBody({ x: 0, altitude: 1, up: true }).cy === ZENITH_Y);
  check("the zenith is above the horizon on screen", ZENITH_Y < HORIZON_Y);

  const ys = alts.map((a) => placeBody({ x: 0, altitude: a, up: true }).cy);
  check("rising altitude moves it up the screen", ys.every((v, i) => i === 0 || v < ys[i - 1]));
  check("it never drops below the ground line", ys.every((v) => v < GROUND), `${Math.max(...ys)} vs ${GROUND}`);
  check("it never leaves the top of the frame", ys.every((v) => v >= 0));

  // 2. It must be inside the crop — the actual defect the user reported.
  // Real card sizes, from a wide desktop column down to a phone.
  for (const [w, h] of [
    [620, 430],
    [560, 420],
    [460, 380],
    [400, 400],
    [366, 300],
    [320, 260],
    [280, 300],
  ]) {
    const [lo, hi] = visibleXRange(w, h);
    check(
      `the sun and moon are on screen in a ${w}×${h} card`,
      BODY_X > lo && BODY_X < hi,
      `x ${BODY_X} outside [${lo.toFixed(0)}, ${hi.toFixed(0)}]`,
    );
  }

  // 3. Not jammed against an edge either, which is the other half of the ask.
  const MARGIN = 40;
  check("it is not against the right edge", BODY_X < VIEW_W - MARGIN, `${VIEW_W - BODY_X} from the right`);
  check("it is not against the left edge", BODY_X > MARGIN, `${BODY_X} from the left`);
  // ...and clear of the greeting text, which occupies the left of the card.
  check("it is clear of the greeting text", BODY_X > VIEW_W * 0.5, String(BODY_X / VIEW_W));

  // 4. Hostile input cannot move it off the canvas.
  for (const bad of [{ altitude: NaN }, { altitude: Infinity }, { altitude: -5 }, { altitude: 99 }, {}, null]) {
    const p = placeBody(bad);
    const ok = Number.isFinite(p.cx) && Number.isFinite(p.cy) && p.cy >= ZENITH_Y && p.cy <= HORIZON_Y;
    check(`altitude ${JSON.stringify(bad?.altitude)} stays in frame`, ok, JSON.stringify(p));
  }

  // 4b. Small devices. A phone's card is tall and narrow, and `slice` crops it
  // to a strip barely 58 units wide — `BODY_X` alone landed 4.6 units from the
  // edge, with a disc of r=14 hanging over it. Passing the box pulls it inside.
  const DEVICES = [
    ["desktop column", 620, 430],
    ["laptop column", 560, 420],
    ["tablet landscape", 700, 300],
    ["tablet portrait", 660, 420],
    ["phone 390", 366, 430],
    ["phone tall card", 366, 560],
    ["phone small", 320, 520],
    ["phone 320 tall", 296, 620],
    ["absurdly narrow", 240, 800],
  ];
  const body = { x: 0, altitude: 0.6, up: true };
  for (const [label, w, h] of DEVICES) {
    const [lo, hi] = visibleXRange(w, h);
    const { cx } = placeBody(body, { width: w, height: h });
    const margin = Math.min(cx - lo, hi - cx);
    // Never on the boundary, and never so far in that it collapses to centre.
    check(`${label}: the body is inside the crop`, cx > lo && cx < hi, `${cx.toFixed(1)} in [${lo.toFixed(0)}, ${hi.toFixed(0)}]`);
    check(`${label}: it keeps clear of the crop edge`, margin >= Math.min(34, (hi - lo) * 0.2) - 1e-6, `margin ${margin.toFixed(1)}`);
  }

  // A wide box crops nothing, so the line must not be dragged off BODY_X.
  check("a wide card leaves the body where it is", placeBody(body, { width: 900, height: 240 }).cx === BODY_X);
  check("the desktop card is unchanged", placeBody(body, { width: 620, height: 430 }).cx === BODY_X);
  // Height is never touched by the box.
  check("the box cannot move it vertically", placeBody(body, { width: 296, height: 620 }).cy === placeBody(body).cy);

  // No box, or a nonsense one, falls back rather than producing NaN.
  for (const bad of [null, undefined, { width: 0, height: 0 }, { width: NaN, height: 100 }, { width: -50, height: -50 }]) {
    const { cx, cy } = placeBody(body, bad);
    check(`a ${JSON.stringify(bad)} box falls back safely`, Number.isFinite(cx) && Number.isFinite(cy) && cx > 0, `${cx}`);
  }

  // 4c. The veil. On a narrow viewport the gutters collapse to ~6% of the width
  // and the sky is only visible *through* the glass, so a heavy veil erases it.
  const narrow = veilAt(1, 390);
  const wide = veilAt(1, 1920);
  check("a phone keeps its sky", narrow <= 0.2, String(narrow));
  check("a wide monitor can afford a veil", wide >= 0.4, String(wide));
  check("the veil grows with the viewport", narrow < wide);
  check("a 1440px laptop is treated as narrow-ish", veilAt(1, 1440) < wide, String(veilAt(1, 1440)));
  check("the veil is lighter before the takeover", veilAt(0, 1920) < veilAt(1, 1920));
  check("the veil never becomes opaque", [390, 1024, 1920, 5000].every((w) => veilAt(1, w) <= 0.6));
  check("the veil is never negative", [0, 390, 1920].every((w) => veilAt(0, w) >= 0));
  check("hostile widths still yield a veil", [NaN, Infinity, -100].every((w) => { const v = veilAt(0.5, w); return Number.isFinite(v) && v >= 0 && v <= 1; }));
  check("hostile progress still yields a veil", [NaN, -5, 99].every((p) => { const v = veilAt(p, 1200); return Number.isFinite(v) && v >= 0 && v <= 1; }));

  // 5. The greeting text must not sit on the floor of the card, where it read
  // as an afterthought under the horizon.
  const card = greetingSource();
  check("the greeting text holds the middle of the card", /flex h-full flex-col justify-center/.test(card));
  check("the greeting is not pinned to the bottom", !/flex h-full flex-col justify-end/.test(card));

  // 6. The crop maths itself.
  check("a zero-sized box has no visible width", visibleXRange(0, 0)[0] === visibleXRange(0, 0)[1]);
  check("a very wide box shows the whole scene", visibleXRange(2000, 200)[0] <= 0 && visibleXRange(2000, 200)[1] >= VIEW_W);
  check("a square box shows only the middle", visibleXRange(400, 400)[0] > 100 && visibleXRange(400, 400)[1] < 300);
  check("the crop is centred", Math.abs(visibleXRange(500, 400)[0] + visibleXRange(500, 400)[1] - VIEW_W) < 1e-9);
}

section("sky — tonight's real moon phase");
{
  const SYNODIC = SYNODIC_MONTH;
  const KNOWN_NEW_MOON = Date.UTC(2000, 0, 6, 18, 14);
  const phaseAt = (ms) => moonPhase(new Date(ms));

  check("the reference new moon reads as new", illumination(phaseAt(KNOWN_NEW_MOON)) < 0.001);
  check("half a lunation later is full", illumination(phaseAt(KNOWN_NEW_MOON + (SYNODIC / 2) * 86400000)) > 0.999);
  check("a quarter in is half lit", Math.abs(illumination(phaseAt(KNOWN_NEW_MOON + (SYNODIC / 4) * 86400000)) - 0.5) < 0.01);
  check("a full lunation returns to new", illumination(phaseAt(KNOWN_NEW_MOON + SYNODIC * 86400000)) < 0.001);

  // Known full moons, to catch the epoch or the period being wrong.
  for (const [label, iso] of [["2026-01-03", "2026-01-03T10:03:00Z"], ["2026-03-03", "2026-03-03T11:38:00Z"]]) {
    const lit = illumination(phaseAt(Date.parse(iso)));
    check(`the full moon of ${label} reads as nearly full`, lit > 0.97, lit.toFixed(3));
  }

  // The phase must be a real number in [0,1) for any date at all.
  let outOfRange = 0;
  for (let d = -4000; d < 4000; d += 7) {
    const p = phaseAt(KNOWN_NEW_MOON + d * 86400000);
    if (!Number.isFinite(p) || p < 0 || p >= 1) outOfRange++;
  }
  check("the phase stays in [0,1) across 20 years", outOfRange === 0, `${outOfRange} bad`);
  check("an invalid date does not produce NaN", Number.isFinite(moonPhase(new Date(NaN))));

  // Every eighth of the cycle gets a name, and the names are distinct.
  const nameFor = moonName;
  check("new reads as new", nameFor(0) === "New moon", nameFor(0));
  check("full reads as full", nameFor(0.5) === "Full moon", nameFor(0.5));
  check("first quarter is named", nameFor(0.25) === "First quarter", nameFor(0.25));
  check("last quarter is named", nameFor(0.75) === "Last quarter", nameFor(0.75));
  check("every phase resolves to a name", Array.from({ length: 200 }, (_, i) => nameFor(i / 200)).every(Boolean));
}

section("sky — the drawn moon matches the computed phase");
{
  check("a full moon draws no shadow", moonShadowPath(13, 0.5) === null);
  check("a new moon draws a full shadow", typeof moonShadowPath(13, 0) === "string");
  check("a zero radius is refused", moonShadowPath(0, 0.25) === null);
  check("a negative radius is refused", moonShadowPath(-5, 0.25) === null);

  // The terminator's half-width is the whole shape of the month in one number:
  // a full disc at new, nothing at the quarters, a full disc again at full.
  // It is the second arc of the path — `A <rx> 100 …`.
  const NUM = "[-+]?[\\d.]+(?:e[-+]?\\d+)?";
  const rxAt = (p) => {
    const d = moonShadowPath(100, p);
    if (d === null) return 0;
    const m = d.match(new RegExp(`A (${NUM}) 100 0 0 \\d 0 -100 Z$`));
    return m ? Number(m[1]) : NaN;
  };
  check("the terminator is widest at new", Math.abs(rxAt(0.001) - 100) < 2, String(rxAt(0.001)));
  check("the terminator vanishes at first quarter", rxAt(0.25) === 0, String(rxAt(0.25)));
  check("the terminator vanishes at last quarter", rxAt(0.75) === 0, String(rxAt(0.75)));
  check("it is half-width at the eighths", Math.abs(rxAt(0.125) - 70.711) < 0.01, String(rxAt(0.125)));

  // It must shrink monotonically from new to the quarter, with no float spikes.
  let jumps = 0;
  let prev = Infinity;
  for (let i = 0; i <= 100; i++) {
    const w = rxAt(i / 400); // 0 → 0.25
    if (!(w <= prev + 1e-6)) jumps++;
    prev = w;
  }
  check("the terminator only narrows towards the quarter", jumps === 0, `${jumps} spikes`);

  // No phase may emit an exponent, a NaN, or an Infinity into an SVG path.
  let broken = 0;
  for (let i = 0; i <= 400; i++) {
    const d = moonShadowPath(13, i / 400);
    if (d !== null && (typeof d !== "string" || /NaN|Infinity|e-|e\+/.test(d))) broken++;
  }
  check("every phase yields a clean path", broken === 0, `${broken} broken`);
}

section("sky — weather is real or absent, never invented");
{
  const src = readFileSync(new URL("../src/lib/weather.ts", import.meta.url), "utf8");
  check("responses are cached", src.includes("TTL_MS"));
  check("the request cannot hang the render", src.includes("AbortSignal.timeout"));
  check("nothing is fabricated", !/Math\.random/.test(src));

  // Behavioural, not textual: call it and watch whether it reaches the network.
  // A bad point must never reach the URL, and no failure may become a guess.
  const realFetch = globalThis.fetch;
  let fetches = 0;
  globalThis.fetch = async (...args) => {
    fetches++;
    return realFetch(...args);
  };

  for (const [label, lat, lon] of [
    ["unset", undefined, undefined],
    ["blank", "", ""],
    ["not a number", "north", "east"],
    ["latitude past the pole", "91", "0"],
    ["longitude past the meridian", "0", "181"],
  ]) {
    if (lat === undefined) delete process.env.WEATHER_LAT;
    else process.env.WEATHER_LAT = lat;
    if (lon === undefined) delete process.env.WEATHER_LON;
    else process.env.WEATHER_LON = lon;

    const before = fetches;
    const got = await currentWeather();
    check(`${label}: no weather is reported`, got === null, JSON.stringify(got));
    check(`${label}: nothing is fetched`, fetches === before, `${fetches - before} request(s)`);
  }
  globalThis.fetch = realFetch;

  // Every WMO code must map to something the scene can draw.
  const SKIES = ["clear", "cloudy", "overcast", "rain", "snow", "storm", "fog"];
  const unmapped = [];
  for (let c = 0; c <= 99; c++) if (!SKIES.includes(skyForCode(c).sky)) unmapped.push(c);
  check("every WMO code 0..99 maps to a drawable sky", unmapped.length === 0, unmapped.slice(0, 5).join(", "));
  check("a nonsense code still yields a sky", SKIES.includes(skyForCode(NaN).sky) && SKIES.includes(skyForCode(-1).sky));
  check("every mapping carries a label", [0, 3, 45, 61, 71, 95].every((c) => skyForCode(c).label.length > 0));
}

section("sky — the scroll takeover opens from the card");
{
  // A realistic card: 1200px viewport, the health card 24px down the page.
  const CARD = { docTop: 24, left: 12, width: 560, height: 420 };
  const VIEW = { width: 1200, height: 800 };
  const RADIUS = 20;

  check("a measured card is usable", anchorIsUsable(CARD));
  for (const [label, bad] of [
    ["null", null],
    ["undefined", undefined],
    ["zero width", { ...CARD, width: 0 }],
    ["zero height", { ...CARD, height: 0 }],
    ["negative width", { ...CARD, width: -10 }],
    ["NaN top", { ...CARD, docTop: NaN }],
    ["Infinite height", { ...CARD, height: Infinity }],
  ]) {
    check(`${label} is refused before it reaches the maths`, anchorIsUsable(bad) === false);
  }

  // --- progress ---------------------------------------------------------
  check("the takeover has not started at the top", takeoverProgress(0, CARD) === 0);
  check("it completes as the card clears the screen", takeoverProgress(CARD.docTop + CARD.height, CARD) === 1);
  check("it is half done halfway", Math.abs(takeoverProgress(takeoverEnd(CARD) / 2, CARD) - 0.5) < 1e-9);
  check("scrolling further cannot exceed 1", takeoverProgress(99999, CARD) === 1);
  check("scrolling up cannot go below 0", takeoverProgress(-5000, CARD) === 0);

  let nonMonotonic = 0;
  let prev = -1;
  for (let y = 0; y <= 2000; y += 5) {
    const p = takeoverProgress(y, CARD);
    if (p < prev) nonMonotonic++;
    prev = p;
  }
  check("progress never goes backwards while scrolling down", nonMonotonic === 0, `${nonMonotonic}`);

  // A card measured mid-layout is the divide-by-zero case; MIN_SPAN is the floor.
  const FLAT = { docTop: 0, left: 0, width: 100, height: 0 };
  check("a zero-height card cannot divide by zero", Number.isFinite(takeoverProgress(1, FLAT)));
  check("a zero-height card does not snap to full on one pixel", takeoverProgress(1, FLAT) < 0.01, String(takeoverProgress(1, FLAT)));
  check("the span has a floor", takeoverEnd(FLAT) === MIN_SPAN, String(takeoverEnd(FLAT)));

  for (const hostile of [NaN, Infinity, -Infinity, undefined, null, "700"]) {
    const p = takeoverProgress(hostile, CARD);
    check(`scrollY ${String(hostile)} still yields a real progress`, Number.isFinite(p) && p >= 0 && p <= 1, String(p));
  }

  // --- easing -----------------------------------------------------------
  check("easing is pinned at both ends", ease(0) === 0 && ease(1) === 1);
  check("easing clamps its input", ease(-3) === 0 && ease(9) === 1);
  check("easing is monotonic", Array.from({ length: 200 }, (_, i) => ease(i / 199)).every((v, i, a) => i === 0 || v >= a[i - 1]));
  check("easing starts gently", ease(0.1) < 0.1);

  // --- the window -------------------------------------------------------
  //
  // The whole illusion rests on this: at rest the window is *exactly* the card,
  // so the layer behind it is completely hidden and no second sky is visible.
  const atRest = insetAt(CARD, VIEW, 0, 0);
  check("at rest the window is the card's top edge", atRest.top === CARD.docTop, String(atRest.top));
  check("at rest the window is the card's left edge", atRest.left === CARD.left, String(atRest.left));
  check(
    "at rest the window is the card's right edge",
    atRest.right === VIEW.width - (CARD.left + CARD.width),
    String(atRest.right),
  );
  check(
    "at rest the window is the card's bottom edge",
    atRest.bottom === VIEW.height - (CARD.docTop + CARD.height),
    String(atRest.bottom),
  );

  const done = insetAt(CARD, VIEW, 500, 1);
  check("fully open, the window is the whole viewport", [done.top, done.right, done.bottom, done.left].every((v) => v === 0));

  // The window follows the card up the screen while it opens — that is what
  // makes it read as growing *out of the card* rather than fading in over it.
  const LOWER = { ...CARD, docTop: 300 };
  check("the window tracks the card as it scrolls", insetAt(LOWER, VIEW, 120, 0).top === 180, String(insetAt(LOWER, VIEW, 120, 0).top));
  check("the window's bottom edge tracks with it", insetAt(LOWER, VIEW, 120, 0).bottom === VIEW.height - (180 + CARD.height));
  check("a card scrolled past does not invert", insetAt(CARD, VIEW, 5000, 0).top === 0);

  // A negative inset is not a bigger window — clip-path drops the whole rule.
  let negative = 0;
  for (let y = -500; y <= 3000; y += 25) {
    for (let i = 0; i <= 20; i++) {
      const ins = insetAt(CARD, VIEW, y, i / 20);
      for (const v of [ins.top, ins.right, ins.bottom, ins.left]) {
        if (!Number.isFinite(v) || v < 0) negative++;
      }
    }
  }
  check("no inset is ever negative or non-finite", negative === 0, `${negative} bad`);

  // --- it maximises, it does not unveil ---------------------------------
  //
  // Every edge must give way by the *same fraction* at the same moment. Running
  // the sides ahead of the top and bottom covers the wide gutters sooner and
  // reads as a curtain: the horizontal edges arrive long before the vertical
  // ones and the eye follows the mismatch.
  //
  // Measured at scrollY = 0, so the card's own travel up the page does not
  // muddy the comparison — this is purely about the opening.
  const XL_CARD = { docTop: 150, left: 276, width: 1352, height: 430 };
  const XL_VIEW = { width: 1917, height: 1010 };
  const restIns = insetAt(XL_CARD, XL_VIEW, 0, 0);
  let skew = 0;
  for (let i = 0; i <= 100; i++) {
    const p = i / 100;
    const ins = insetAt(XL_CARD, XL_VIEW, 0, p);
    const fracs = [ins.top / restIns.top, ins.right / restIns.right, ins.bottom / restIns.bottom, ins.left / restIns.left];
    if (Math.max(...fracs) - Math.min(...fracs) > 1e-9) skew++;
  }
  check("all four edges open by the same fraction", skew === 0, `${skew} of 101 steps skewed`);

  // ...and the whole screen is covered without needing a long scroll to do it.
  const coverage = (y) => {
    const i = insetAt(XL_CARD, XL_VIEW, y, takeoverProgress(y, XL_CARD));
    return {
      w: ((XL_VIEW.width - i.left - i.right) / XL_VIEW.width) * 100,
      h: ((XL_VIEW.height - i.top - i.bottom) / XL_VIEW.height) * 100,
    };
  };
  check("an XL screen is fully covered inside a third of a screen", coverage(310).w >= 99.9 && coverage(310).h >= 99.9, `${coverage(310).w.toFixed(0)}% × ${coverage(310).h.toFixed(0)}%`);
  check("the takeover does not drag on for a whole screen", takeoverEnd(XL_CARD) < 400, `${takeoverEnd(XL_CARD).toFixed(0)}px`);
  // The two axes start at different coverage — the card is wide and short — so
  // compare how much of each axis's REMAINING gap has closed. Comparing raw
  // percentages just measures the card's shape.
  const closed = (y) => {
    const c = coverage(y);
    const w0 = coverage(0).w;
    const h0 = coverage(0).h;
    return { w: ((c.w - w0) / (100 - w0)) * 100, h: ((c.h - h0) / (100 - h0)) * 100 };
  };
  check(
    "both axes close their gap in step",
    [60, 120, 180, 240].every((y) => Math.abs(closed(y).w - closed(y).h) < 6),
    [60, 120, 180, 240].map((y) => (closed(y).w - closed(y).h).toFixed(1)).join(", "),
  );
  check("the span still honours its floor", takeoverEnd({ docTop: 0, left: 0, width: 100, height: 0 }) === MIN_SPAN);

  // At rest the window is still exactly the card on every side.
  check("at rest every edge sits on the card", restIns.left === XL_CARD.left && restIns.right === XL_VIEW.width - (XL_CARD.left + XL_CARD.width) && restIns.top === XL_CARD.docTop);

  // The window only ever opens.
  let shrank = 0;
  let last = Infinity;
  for (let i = 0; i <= 100; i++) {
    const ins = insetAt(CARD, VIEW, 0, i / 100);
    if (ins.left > last) shrank++;
    last = ins.left;
  }
  check("the window never closes as progress rises", shrank === 0, `${shrank}`);

  // --- the soft edge ----------------------------------------------------
  //
  // The reason the window is a mask and not a `clip-path`: a clip is a binary
  // test per pixel, so the sky met the page in a razor-sharp rectangle that read
  // as a rendering fault. Alpha is what makes the growth look continuous.
  const win = (p) => {
    const i = insetAt(CARD, VIEW, 0, p);
    return { w: VIEW.width - i.left - i.right, h: VIEW.height - i.top - i.bottom };
  };
  const featherFor = (p) => featherAt(p, win(p).w, win(p).h);

  check("the edge is softest while the window is opening", featherFor(0.35) > 40, String(featherFor(0.35)));
  check("the edge is fully closed once the sky fills the page", featherAt(1, VIEW.width, VIEW.height) === 0);
  check("the feather only ever narrows", Array.from({ length: 100 }, (_, i) => featherFor(i / 99)).every((v, i, a) => i === 0 || v <= a[i - 1] + 1e-9));
  check("the feather is never negative", Array.from({ length: 100 }, (_, i) => featherFor(i / 99)).every((v) => v >= 0));

  // A feather wider than the window would meet in the middle and mask the whole
  // layer away — the sky would simply vanish on a small card.
  const TINY = { docTop: 10, left: 10, width: 120, height: 90 };
  check("the feather cannot swallow a small window", featherAt(0, 120, 90) < 90 / 2, String(featherAt(0, 120, 90)));
  check("a tiny card still yields a mask", typeof maskImageAt(TINY, VIEW, 0, 0) === "string");

  check("there is no zoom at rest", zoomAt(0) === 1);
  check("the scene pushes in as it takes over", zoomAt(1) === 1 + MAX_ZOOM);
  check("the zoom is bounded", Array.from({ length: 50 }, (_, i) => zoomAt(i / 49)).every((z) => z >= 1 && z <= 1 + MAX_ZOOM));
  check("the zoom is subtle enough not to blur the scene", MAX_ZOOM <= 0.15, String(MAX_ZOOM));

  check("there is no parallax at the top", parallaxAt(0) === 0);
  check("the sky trails the page", parallaxAt(1000) > 0 && parallaxAt(1000) < 1000);
  check("parallax is capped", parallaxAt(1e6) === PARALLAX_MAX);
  check("parallax never runs backwards", parallaxAt(-9999) === 0);
  check("hostile scroll cannot move the sky off screen", [NaN, Infinity, -Infinity].every((v) => parallaxAt(v) >= 0 && parallaxAt(v) <= PARALLAX_MAX));

  // --- the string that actually reaches the style attribute --------------
  //
  // A malformed `mask-image` is silently dropped by the browser, which unmasks
  // the layer rather than throwing — the sky would snap to full-screen with
  // nothing in the console. It has to be checked as bytes.
  const GRADIENT = String.raw`linear-gradient\(to (?:right|left|bottom|top), transparent [\d.]+px, #000 [\d.]+px\)`;
  const WELL_FORMED = new RegExp(`^${GRADIENT}, ${GRADIENT}, ${GRADIENT}, ${GRADIENT}$`);

  let malformed = 0;
  for (let y = -400; y <= 3000; y += 17) {
    const m = maskImageAt(CARD, VIEW, y, takeoverProgress(y, CARD));
    if (m === null) continue;
    if (!WELL_FORMED.test(m)) malformed++;
    if (/NaN|Infinity|e-|e\+|--/.test(m)) malformed++;
  }
  check("every scroll position yields a valid mask", malformed === 0, `${malformed} bad`);
  check(
    "a hostile scroll still yields a valid mask",
    [NaN, Infinity, -Infinity].every((y) => WELL_FORMED.test(maskImageAt(CARD, VIEW, y, 0.5) ?? "")),
  );

  // One gradient per edge, and they must be ANDed — stacked they would union
  // into a full-screen mask and the window would not exist at all.
  const rest = maskImageAt(CARD, VIEW, 0, 0);
  check("the mask has one gradient per edge", (rest.match(/linear-gradient/g) || []).length === 4);
  check("each edge runs its own direction", ["to right", "to left", "to bottom", "to top"].every((d) => rest.includes(d)));
  // `to right` fades in from the LEFT edge, so it carries the left inset.
  check("at rest the left edge starts on the card", rest.includes(`to right, transparent ${CARD.left}px`), rest.slice(0, 60));
  check("at rest the top edge starts on the card", rest.includes(`to bottom, transparent ${CARD.docTop}px`));
  check("at rest the right edge starts on the card", rest.includes(`to left, transparent ${VIEW.width - (CARD.left + CARD.width)}px`));
  check("at rest the bottom edge starts on the card", rest.includes(`to top, transparent ${VIEW.height - (CARD.docTop + CARD.height)}px`));

  // Once open there is nothing left to fade, so the mask is dropped outright
  // rather than left as a no-op the compositor keeps evaluating.
  check("a filled viewport needs no mask at all", maskImageAt(CARD, VIEW, 500, 1) === null);

  // --- smoothness -------------------------------------------------------
  //
  // The complaint this section exists for. A takeover is only smooth if the
  // geometry has no step in it: sample every edge finely and assert nothing
  // jumps. A discontinuity here is a visible tear on screen.
  let jump = 0;
  let worst = 0;
  let prevEdges = null;
  for (let y = 0; y <= 700; y += 1) {
    const p = takeoverProgress(y, CARD);
    const i = insetAt(CARD, VIEW, y, p);
    const edges = [i.top, i.right, i.bottom, i.left, featherFor(p)];
    if (prevEdges) {
      for (let k = 0; k < edges.length; k++) {
        const step = Math.abs(edges[k] - prevEdges[k]);
        worst = Math.max(worst, step);
        if (step > 6) jump++;
      }
    }
    prevEdges = edges;
  }
  check("no edge jumps between adjacent scroll positions", jump === 0, `${jump} jumps, worst ${worst.toFixed(2)}px`);

  // The rate ceiling is *derived*, not picked. An edge moves at
  //   edge × ease'(p) / span
  // and smoothstep's derivative peaks at 1.5, so the fastest any edge may move
  // is the widest gutter × 1.5 / the takeover's span. Anything above
  // that is a jump rather than a fast open — and hardcoding a number here would
  // just have to be nudged upward every time the lead changed, which is not a
  // check, it is a rubber stamp.
  const widestEdge = Math.max(CARD.docTop, CARD.left, VIEW.width - (CARD.left + CARD.width), VIEW.height - (CARD.docTop + CARD.height));
  const ceiling = (widestEdge * 1.5) / takeoverEnd(CARD);
  check("no edge outruns its own geometry", worst <= ceiling + 0.01, `${worst.toFixed(2)}px vs ceiling ${ceiling.toFixed(2)}px`);
  check("the ceiling is a sane rate to begin with", ceiling < 8, `${ceiling.toFixed(2)}px per scroll pixel`);

  // Easing must not introduce a kink either — the second difference stays small.
  let kinks = 0;
  for (let i = 2; i <= 200; i++) {
    const a = ease((i - 2) / 200);
    const b = ease((i - 1) / 200);
    const c = ease(i / 200);
    if (Math.abs(c - 2 * b + a) > 0.001) kinks++;
  }
  check("the easing curve has no kink", kinks === 0, `${kinks}`);

  // `getBoundingClientRect()` returns fractional pixels on any scaled display,
  // and easing multiplies them out to a long float tail. Round numbers in a
  // fixture hide that entirely — this one is deliberately ugly.
  const REAL_CARD = { docTop: 23.671875, left: 12.328125, width: 559.34375, height: 419.15625 };
  const REAL_VIEW = { width: 1193.6, height: 799.4 };
  const TIDY = /^(?:linear-gradient\(to (?:right|left|bottom|top), transparent \d+(?:\.\d{1,2})?px, #000 \d+(?:\.\d{1,2})?px\)(?:, )?){4}$/;
  let untidy = 0;
  let sample = "";
  for (let y = 0; y <= 1200; y += 7) {
    const m = maskImageAt(REAL_CARD, REAL_VIEW, y, takeoverProgress(y, REAL_CARD));
    if (m === null) continue;
    if (!TIDY.test(m)) {
      untidy++;
      sample ||= m;
    }
  }
  check("fractional pixels are rounded, not written out in full", untidy === 0, sample);

  // A phone: the card is nearly the whole width, so the side insets are tiny
  // but must still be exact, and must still reach zero.
  const PHONE_VIEW = { width: 390, height: 844 };
  const PHONE_CARD = { docTop: 18, left: 12, width: 366, height: 520 };
  check("the window is exact on a phone", insetAt(PHONE_CARD, PHONE_VIEW, 0, 0).right === 12);
  check("the takeover still completes on a phone", maskImageAt(PHONE_CARD, PHONE_VIEW, 900, 1) === null);
  check("the feather fits a phone's narrow card", featherAt(0, 366, 520) < 366 / 2, String(featherAt(0, 366, 520)));
}

section("sky — the takeover component's guards");
{
  const backdrop = readFileSync(new URL("../src/components/sky-backdrop.tsx", import.meta.url), "utf8");
  check("the takeover is driven by scroll", backdrop.includes("useScroll"));
  check("it is sprung, not stepped", backdrop.includes("useSpring"));
  check("it never intercepts a pointer", backdrop.includes("pointer-events-none"));
  check("it sits behind the content", backdrop.includes("-z-["));
  check("it is hidden from assistive tech", backdrop.includes("aria-hidden"));

  // The maths is imported, not written inline — the whole point of lib/takeover.
  check("the component does not do its own maths", backdrop.includes('from "@/lib/takeover"'));
  check("no arithmetic leaked into the component", !/scrollY\s*\/\s*\(/.test(backdrop));

  // Guards.
  check("an unmeasured or zero-sized card renders nothing", backdrop.includes("anchorIsUsable"));
  check("it bails before painting when there is no card", /if \(!phase \|\| !now \|\| !usable\) return null/.test(backdrop));
  check("a detached card is dropped", backdrop.includes("isConnected"));
  // `innerWidth` includes the scrollbar; a `fixed inset-0` layer does not. Using
  // it leaves ~15px of permanent error down the right edge, so the window's
  // right inset never quite reaches zero and the sky never quite meets the edge.
  check("the viewport is measured without the scrollbar", backdrop.includes("root.clientWidth") && backdrop.includes("root.clientHeight"));
  check("innerWidth is not used to size the window", !/setViewport\(\{ width: window\.innerWidth/.test(backdrop));
  check("it re-measures when the card resizes", backdrop.includes("ResizeObserver"));
  check("it re-measures when the window resizes", backdrop.includes('addEventListener("resize"'));
  check("both listeners are torn down", backdrop.includes("observer.disconnect()") && backdrop.includes('removeEventListener("resize"'));
  check("it re-runs when the card finally mounts", /}, \[anchor\]\)/.test(backdrop));
  check("it does not touch window during SSR", backdrop.includes('typeof window === "undefined"'));
  check("the hour is read on the client only", backdrop.includes("useEffect") && backdrop.includes("setPhase"));
  check("the minute timer is cleared", backdrop.includes("clearInterval"));

  // Hooks must not be conditional — the anchor check happens after them.
  const firstReturnNull = backdrop.indexOf("return null");
  check("no hook is called after the early return", backdrop.indexOf("useTransform", firstReturnNull) === -1);

  // Reduced motion: no takeover at all, not a slower one.
  check("reduced motion pins the takeover shut", backdrop.includes("reduced ? still : progress"));
  check("reduced motion kills the parallax too", /reduced \? 0 : parallaxAt/.test(backdrop));

  // The edge must be a mask. A clip alone is the hard rectangle that made the
  // growth read as a rendering fault.
  check("the window is a mask, so its edge can fade", backdrop.includes("maskImage"));
  check("the four edge gradients are intersected", backdrop.includes('maskComposite: "intersect"'));
  check("older engines get the webkit spelling", backdrop.includes('WebkitMaskComposite: "source-in"'));
  check("a clip still contains the layer if intersect is ignored", backdrop.includes("clipPath"));

  // It draws the same scene as the card, rather than a second one.
  check("it renders the card's own sky", /import {[^}]*\bSky\b[^}]*} from ".\/greeting"/.test(backdrop));
  // ...but at full-bleed the ground cast is several feet tall.
  // The card and the background must show the SAME landscape. When these were
  // one flag, turning off the giant full-bleed cat also deleted the meadow, and
  // the background silently stayed on the previous design.
  // The background shows the card's whole landscape — meadow and animals.
  // These were one `grounded` flag, and turning off the giant full-bleed cat
  // also deleted the meadow, so the background silently kept the old design.
  check("the background keeps the meadow the card has", !/grounded={false}/.test(backdrop));
  check("the background keeps the animals too", !/cast={false}/.test(backdrop));
  // One scene filling the layer — no band plus a painted-on meadow underneath,
  // which is what put the horizon halfway down the screen.
  check("the scene fills the layer", /<div className="absolute inset-0">\s*<Sky/.test(backdrop));
  check("no meadow is painted on separately", !backdrop.includes("--sky-meadow-3"));
  const greetingSrc = greetingSource();
  check("the card keeps its ground by default", /grounded = true/.test(greetingSrc));
  check("the card keeps its cast by default", /cast = true/.test(greetingSrc));
  check("the meadow and the animals are separate switches", /grounded\?: boolean;/.test(greetingSrc) && /cast\?: boolean;/.test(greetingSrc));

  /*
   * Read the cast's shape out of the source rather than listing the animals
   * here. A hardcoded count silently stopped meaning anything the moment an
   * animal was removed — it went on passing while asserting a number that no
   * longer matched the scene.
   */
  const castShape = Object.fromEntries(
    (greetingSrc.match(/const CAST: Record<Phase, \{([^}]*)\}>/)?.[1] ?? "")
      .split(";")
      .map((part) => part.trim().split(":")[0].trim())
      .filter(Boolean)
      .map((name) => [name, true]),
  );
  check("the cast table names its animals", Object.keys(castShape).length >= 3, Object.keys(castShape).join(", "));
  check(
    "every animal in the cast table is gated on the cast, not the ground",
    Object.keys(castShape).every((who) => new RegExp(`CAST\\[phase\\]\\.${who}`).test(greetingSrc)) &&
      (greetingSrc.match(/cast &&[\s\S]{0,48}CAST\[phase\]/g) || []).length === Object.keys(castShape).length,
    Object.keys(castShape).join(", "),
  );
  for (const who of ["crane", "squirrel", "cat"]) {
    check(
      `the ${who} only appears when the cast is out`,
      new RegExp(`cast &&[\\s\\S]{0,24}phase &&[\\s\\S]{0,24}CAST\\[phase\\]\\.${who}`).test(greetingSrc),
    );
  }
  // The scene is banded rather than stretched over the whole viewport.
  // `vh` on mobile is the tallest the viewport ever gets, not what you can see:
  // the band would overhang behind the URL bar and resize as it hides.
  check("the band is sized in dvh, not vh", !/h-\[\d+vh\]/.test(backdrop));

  // Anchored to the JSX element, NOT to the bare string. `fit="adapt"` also
  // appears in the doc comment above it, so `includes()` passed on the comment
  // alone and the check survived the prop being changed to "slice" — the
  // check-that-cannot-fail trap, one more time.
  check("the full-bleed sky never crops", /<Sky[\s\S]{0,200}?fit="adapt"/.test(backdrop));
  check("no fit branch is left cropping the background", !/fit=\{[^}]*slice/.test(backdrop));
  // The band is a share of width on wide screens, of height on narrow ones —
  // a 30vw band on a phone would be a 120px sliver.
  const greeting = greetingSource();
  check("that scene is exported once, not copied", /export function Sky\(/.test(greeting));

  // The board has to stay readable once the sky is behind all of it.
  check("a veil keeps the panels readable", backdrop.includes("veil"));
  check("the veil is a token, not a hex", !/#[0-9a-f]{3,6}/i.test(backdrop));

  // The card must actually be findable.
  const ring = ["health-ring.tsx", "health-drivers.ts"].map((f) => readFileSync(new URL(`../src/components/${f}`, import.meta.url), "utf8")).join("\n");
  check("the health card exposes itself as the anchor", ring.includes("data-sky-anchor") && ring.includes("ref={ref}"));
  const dash = readFileSync(new URL("../src/components/dashboard-client.tsx", import.meta.url), "utf8");
  check("the anchor is wired from the card to the backdrop", dash.includes("ref={setSkyAnchor}") && dash.includes("anchor={skyAnchor}"));
  check("the anchor lives in state, so mounting re-measures", dash.includes("useState<HTMLElement | null>(null)"));
}

section("the footer");
{
  const footer = readFileSync(new URL("../src/components/footer.tsx", import.meta.url), "utf8");
  check("the footer states what it knows", ["Tracked", "PODs", "Last sync"].every((s) => footer.includes(s)));
  check("the footer invents no links", !/href="#"|facebook|twitter|instagram/i.test(footer));
  check("sync time is relative, not a raw timestamp", footer.includes("function relative"));
}


// --------------------------------------------------------------- the roster

section("the roster — onboarded people appear even with nothing assigned");
{
  // The reported bug: adding five members to a POD changed nothing on the
  // dashboard, because the leaderboard is built by aggregating work items and a
  // person with none simply is not in the aggregation. It reads as "adding
  // members didn't work" rather than "nobody has any bugs yet".
  const agg = [
    { name: "Ananya Rao", email: "ananya.rao@x.com", total: 12, active: 8, critical: 2, aged: 3, avgAgeDays: 14, severity: [] },
    { name: "Kabir Menon", email: "", total: 5, active: 3, critical: 0, aged: 1, avgAgeDays: 6, severity: [] },
  ];
  const roster = [
    { name: "Ananya Rao", email: "ananya.rao@x.com", designation: "Senior QA" },
    { name: "Kabir Menon", designation: "Developer" },
    { name: "Priya Nair", email: "priya@x.com", designation: "Tech Lead" },
    { name: "Zoya Khan", email: "zoya@x.com", designation: "QA" },
  ];
  const merged = mergeRoster(agg, roster);
  const by = (n) => merged.find((r) => r.name === n);

  check("everyone on the roster is on the board", roster.every((p) => by(p.name)), merged.map((r) => r.name).join(", "));
  check("people with no items appear at zero", by("Priya Nair")?.active === 0 && by("Priya Nair")?.total === 0);
  check("they are flagged as carrying nothing", by("Priya Nair")?.onRosterOnly === true);
  check("people with items keep their counts", by("Ananya Rao")?.active === 8 && by("Ananya Rao")?.total === 12);
  check("people with items are not flagged", by("Ananya Rao")?.onRosterOnly === undefined);
  check("nobody is duplicated", merged.length === 4, String(merged.length));

  // Matching. Email is the only identifier both sides genuinely share.
  check("matching is by email", by("Ananya Rao")?.designation === "Senior QA");
  check("matching falls back to name", by("Kabir Menon")?.designation === "Developer" && !by("Kabir Menon")?.onRosterOnly);
  check(
    "email match is case-insensitive",
    mergeRoster([{ ...agg[0], email: "ANANYA.RAO@X.COM" }], [{ name: "Someone Else", email: "ananya.rao@x.com" }]).length === 1,
  );
  check(
    "name match is case-insensitive",
    mergeRoster([agg[1]], [{ name: "  kabir MENON  " }]).length === 1,
  );

  // Ranking must survive. The roster is not allowed to reshuffle who is
  // carrying the most — that is the one thing the leaderboard is for.
  const order = merged.map((r) => r.name);
  check("aggregated rows keep their order", order[0] === "Ananya Rao" && order[1] === "Kabir Menon");
  check("zero rows come after them", order.indexOf("Priya Nair") > order.indexOf("Kabir Menon"));
  check("zero rows are alphabetical", order.indexOf("Priya Nair") < order.indexOf("Zoya Khan"));

  // Guards.
  check("a blank roster row is not a person", mergeRoster(agg, [{ name: "", email: "" }]).length === 2);
  check("a whitespace-only row is not a person", mergeRoster(agg, [{ name: "   " }]).length === 2);
  check("the same person twice appears once", mergeRoster(agg, [{ name: "Dup", email: "d@x.com" }, { name: "Dup", email: "d@x.com" }]).length === 3);
  check("the same person across two PODs appears once", mergeRoster([], [{ name: "A", email: "a@x.com" }, { name: "A Longer Name", email: "a@x.com" }]).length === 1);
  check("an email-only member still appears", mergeRoster([], [{ name: "", email: "ghost@x.com" }])[0]?.name === "ghost@x.com");
  for (const [label, bad] of [["null roster", null], ["undefined roster", undefined], ["a string", "nope"], ["a number", 7]]) {
    check(`${label} cannot break the board`, mergeRoster(agg, bad).length === 2);
  }
  for (const [label, bad] of [["null assignees", null], ["undefined assignees", undefined], ["a string", "nope"]]) {
    check(`${label} still yields the roster`, mergeRoster(bad, roster).length === 4);
  }
  // A *fresh* fixture, deliberately. Reusing `agg` here meant it had already
  // been mutated by the call at the top of this block, so a second call added
  // nothing and the check passed on a function that mutates its input.
  check("the input is never mutated", (() => {
    const fresh = [{ name: "Ananya Rao", email: "ananya.rao@x.com", total: 1, active: 1, critical: 0, aged: 0, avgAgeDays: 1, severity: [] }];
    const original = JSON.stringify(fresh);
    mergeRoster(fresh, [{ name: "Ananya Rao", email: "ananya.rao@x.com", designation: "Senior QA" }]);
    return JSON.stringify(fresh) === original;
  })());
  check("a zero row carries every field the UI reads", (() => {
    const r = by("Zoya Khan");
    return ["name", "email", "total", "active", "critical", "aged", "avgAgeDays", "severity"].every((k) => k in r);
  })());
}

// ------------------------------------------------------------- the constants

section("constants — the hardcoded values live in one place");
{
  /*
   * `constants.ts` is a barrel over `constants/` now — one 320-line file held
   * storage caps, session policy and the greeting's cast schedule, which have
   * nothing to do with each other. The rules are about the set, not the file.
   */
  const CONSTANTS_DIR = new URL("../src/lib/constants/", import.meta.url);
  const constants = [
    readFileSync(new URL("../src/lib/constants.ts", import.meta.url), "utf8"),
    ...readdirSync(CONSTANTS_DIR).filter((f) => f.endsWith(".ts")).sort().map((f) => readFileSync(new URL(f, CONSTANTS_DIR), "utf8")),
  ].join("\n");
  check("the file documents the env-versus-here rule", /belongs in the repository/.test(constants));

  // Every group exists and is frozen at the type level.
  for (const group of ["LIMITS", "PAGE", "TIMING", "AZURE", "AGEING", "UPLOAD"]) {
    check(`${group} is exported`, constants.includes(`export const ${group} = {`));
    check(`${group} is a const assertion`, new RegExp(`export const ${group} = \\{[\\s\\S]*?\\} as const;`).test(constants));
  }

  // Values have to be sane, not just present.
  check("limits are positive", Object.values(LIMITS).every((v) => Number.isFinite(v) && v > 0));
  check("page sizes are positive", Object.values(PAGE).every((v) => Number.isFinite(v) && v > 0));
  check("the drill ceiling is above its default", PAGE.drillMax > PAGE.drillDefault);
  check("timings are positive", Object.values(TIMING).every((v) => Number.isFinite(v) && v > 0));
  check("the ageing window is a real range", AGEING.min >= 1 && AGEING.max > AGEING.min && AGEING.defaultThresholdDays >= AGEING.min && AGEING.defaultThresholdDays <= AGEING.max);
  check("azure's batch is its documented cap", AZURE.batchSize === 200);
  check("the upload cap and its label agree", UPLOAD.maxLabel === `${UPLOAD.maxBytes / 1024 / 1024} MB`, `${UPLOAD.maxLabel} vs ${UPLOAD.maxBytes}`);
  // The old binary .xls format cannot be read by exceljs. Offering it in
  // the file picker would accept files that then fail on the server.
  check("the picker offers only formats that can be read", !/\.xls([^xm]|$)/.test(UPLOAD.accept), UPLOAD.accept);

  // The literals must actually be *used*, or this is a file of dead numbers.
  const users = [
    ["../src/lib/teams.ts", "LIMITS"],
    ["../src/lib/metrics.ts", "PAGE"],
    ["../src/lib/azure.ts", "AZURE"],
    ["../src/lib/types.ts", "AGEING"],
    ["../src/app/api/upload/route.ts", "UPLOAD"],
    ["../src/app/admin/admin-client.tsx", "TIMING"],
    ["../src/components/greeting-choreography.ts", "SCENE"],
    ["../src/components/greeting-grass.ts", "SCENE"],
  ];
  for (const [file, group] of users) {
    const src = readFileSync(new URL(file, import.meta.url), "utf8");
    check(`${file.split("/").pop()} uses ${group}`, new RegExp(`\\b${group}\\.`).test(src));
  }

  // ...and the old literals must be gone, or both copies drift.
  const teamsSrc = readFileSync(new URL("../src/lib/teams.ts", import.meta.url), "utf8");
  check("teams.ts no longer hardcodes its caps", !/slice\(0, (200|120|500)\)/.test(teamsSrc));
  const metricsSrc = readFileSync(new URL("../src/lib/metrics.ts", import.meta.url), "utf8");
  check("metrics.ts no longer hardcodes its page sizes", !/size: (12|50),/.test(metricsSrc));
}

// ------------------------------------------------------- passwords and cancel

section("every password field can be revealed");
{
  const ui = uiSource();
  check("there is one shared password field", /export function PasswordField\(/.test(ui));
  check("it toggles the input type", ui.includes('type={shown ? "text" : "password"}'));
  check("the toggle is labelled for a screen reader", ui.includes('aria-label={shown ? "Hide password" : "Show password"}'));
  check("the toggle reports its state", ui.includes("aria-pressed={shown}"));
  // A button with no explicit type submits the form it sits in — asking to see
  // your password would have tried to log you in.
  // Scoped to PasswordField. `ui.tsx` has other type="button" elements, so
  // testing the whole file passed even with the reveal button unguarded.
  const pwField = ui.slice(ui.indexOf("export function PasswordField("));
  check("the reveal toggle cannot submit the form", /<button\s+type="button"/.test(pwField));

  // No bare password input may survive anywhere.
  for (const [label, src] of [
    ["the login form", readFileSync(new URL("../src/app/login/login-form.tsx", import.meta.url), "utf8")],
    ["the admin screen", adminSource()],
    ["the change-password dialog", readFileSync(new URL("../src/components/change-password.tsx", import.meta.url), "utf8")],
  ]) {
    check(`${label} has no bare password input`, !/type="password"/.test(src));
    check(`${label} uses the shared field`, src.includes("<PasswordField"));
  }
}

section("destructive and abandonable actions have a way out");
{
  const admin = adminSource();

  // Cancel out of a POD edit, with unsaved work protected.
  check("the POD editor can be cancelled", admin.includes("const closeDraft ="));
  check("cancelling a clean form asks nothing", admin.includes("if (!dirty) return setDraft(null)"));
  check("unsaved changes are noticed", admin.includes("const dirty ="));
  check("save is disabled when there is nothing to save", admin.includes('disabled={busy === "save" || !dirty}'));

  // Deleting a POD takes every work item with it.
  // The delete button specifically — `confirmThen(` is also used by cancel, and
  // `del-` also appears in the busy flag, so testing for either passed with the
  // delete button wired straight to removeTeam.
  check("deleting a POD needs two clicks", /onClick={\(\) => confirmThen\(`del-/.test(admin));
  check("delete is not wired straight through", !/onClick={\(\) => removeTeam\(team\)}/.test(admin));
  check("the armed state says what happens next", admin.includes('"Sure?"'));
  check("an armed confirmation lapses on its own", admin.includes("TIMING.confirmMs"));
  check("the arming timer is cleared", /return \(\) => clearTimeout\(t\);/.test(admin));

  // A half-filled user form can be abandoned.
  check("the new-user form can be cleared", /Clear\s*<\/Button>/.test(admin));
  check("clear only appears when there is something to clear", admin.includes("{(form.email || form.name || form.password) && ("));
}

// ----------------------------------------------------------- azure from env

section("azure connects from the environment alone");
{
  const azure = readFileSync(new URL("../src/lib/azure.ts", import.meta.url), "utf8");
  const teams = readFileSync(new URL("../src/lib/teams.ts", import.meta.url), "utf8");
  const sync = readFileSync(new URL("../src/lib/sync.ts", import.meta.url), "utf8");

  // Each field falls back independently, so a POD may set only a project.
  check("the connection resolves field by field", azure.includes("export function resolveCreds"));
  for (const v of ["AZDO_ORG_URL", "AZDO_PROJECT", "AZDO_PAT"]) {
    check(`${v} is a fallback`, azure.includes(`process.env.${v}`));
  }
  check("connectability is one shared test", azure.includes("export function isConnectable"));
  // Checking only the org URL let a POD with a URL but no PAT into the sync
  // loop, where it failed on every run.
  check("sync filters on a full connection", sync.includes("teams.filter(isConnectable)"));
  check("sync no longer checks the org URL alone", !/t\.azure\.orgUrl \|\| process\.env\.AZDO_ORG_URL/.test(sync));

  // With no POD there is nothing to sync, so a configured environment still
  // showed an empty board until somebody opened admin and made one by hand.
  check("a POD is provisioned from the environment", teams.includes("async function ensureDefaultTeam"));
  check("all three variables are required first", teams.includes("export function azureConfiguredInEnv"));
  check("two out of three is not enough", /AZDO_ORG_URL\?\.trim\(\) && process\.env\.AZDO_PROJECT\?\.trim\(\) && process\.env\.AZDO_PAT\?\.trim\(\)/.test(teams));
  // Once anyone has onboarded a real POD this must never run again, or deleting
  // your last POD would conjure another.
  check("it only ever runs on an empty install", teams.includes("if (existing.length > 0 || !azureConfiguredInEnv()) return existing"));
  check("a failure to provision cannot blank the dashboard", /catch \{[\s\S]{0,200}return existing;/.test(teams));
  check("the provisioned POD leaves its own fields blank", teams.includes("Created from the environment"));
}

// --------------------------------------------------------- the upload format

section("the upload format is documented and matches the importer");
{
  const doc = readFileSync(new URL("../docs/excel-upload.md", import.meta.url), "utf8");
  // COLUMN_ALIASES lives in normalize/columns.ts; read the whole group.
  const NORM_DIR = new URL("../src/lib/normalize/", import.meta.url);
  const normalize = [
    readFileSync(new URL("../src/lib/normalize.ts", import.meta.url), "utf8"),
    ...readdirSync(NORM_DIR).filter((f) => f.endsWith(".ts")).sort().map((f) => readFileSync(new URL(f, NORM_DIR), "utf8")),
  ].join("\n");

  // Every alias the importer accepts has to appear in the document, or someone
  // formats a sheet from the docs and half their columns are silently ignored.
  const aliases = [...normalize.matchAll(/^\s{2}(\w+): \[([^\]]+)\]/gm)].flatMap(([, , list]) =>
    list.split(",").map((a) => a.trim().replace(/^"|"$/g, "")),
  );
  const lower = doc.toLowerCase();
  const undocumented = aliases.filter((a) => a && !lower.includes(a.toLowerCase()));
  check("every accepted column alias is documented", undocumented.length === 0, undocumented.slice(0, 6).join(", "));
  check("the importer's aliases were actually found", aliases.length >= 30, `${aliases.length} aliases`);

  // The vocabulary the values resolve to.
  for (const v of ["Critical", "Major", "Minor", "IT-UAT", "BIZ-UAT", "CUG", "Production", "For QA Validation", "Not a Bug"]) {
    check(`the ${v} value is documented`, doc.includes(v));
  }

  // The behaviours that surprise people.
  check("re-uploading is explained", /Upload the same file twice/.test(doc));
  check("the row-number fallback is warned about", /no id column/i.test(doc));
  check("the created-date default is stated", /falls back to today|\*\*today\*\*/i.test(doc));
  check("closed-date precedence is stated", /closed date wins over the status/i.test(doc));
  check("kind derivation is explained", /Bug, ticket or CR/i.test(doc));
  check("the POD it lands in is stated", /Which POD it lands in/i.test(doc));
  check("the size cap matches the code", doc.includes(UPLOAD.maxLabel));
  check("a worked example is given", /\| 10432 \|/.test(doc));

  // ...and it is reachable from the app, not only from the repository.
  const topbar = readFileSync(new URL("../src/components/topbar.tsx", import.meta.url), "utf8");
  check("the format is on the upload control", /[Oo]nly a Title column is required/.test(topbar));
  check("the picker uses the shared accept list", topbar.includes("accept={UPLOAD.accept}"));
}

section("the search suggests predictably");
{
  const names = ["Ananya Rao", "Kabir Menon", "Priya Nair", "Raosaheb Kulkarni", "Arjun Pillai"];

  // A native datalist matched differently in every browser — Chrome anywhere
  // in the string, Safari only from the start — and neither showed which part
  // matched. A list you cannot predict is worse than no list.
  const values = (q, n = names) => suggest(q, n).map((s) => s.value);

  check("typing the start of a name offers it", values("ana").includes("Ananya Rao"));
  check("typing a surname offers it", values("rao").includes("Ananya Rao"));
  check("matching is case-insensitive", values("PRIYA").includes("Priya Nair"));
  check("the name being typed comes first", values("rao")[0] === "Raosaheb Kulkarni", values("rao").join(", "));
  check("a surname being typed comes next", values("rao")[1] === "Ananya Rao", values("rao").join(", "));
  // Both beat anything that merely contains the letters, which is the tier below.
  // A word being started beats a mere substring. The names are chosen so that
  // alphabetical order would give the *opposite* answer — otherwise deleting
  // the word-start tier changes nothing and the check passes on broken code.
  const tiers = values("nair", ["Anairam Bose", "Zara Nair"]);
  check("a word being typed beats a mere substring", tiers[0] === "Zara Nair", tiers.join(", "));
  check("nothing matching gives nothing", values("zzzz").length === 0);

  // Focusing an empty box and being shown who is on the board is how a reader
  // discovers the box takes names at all.
  check("an empty query offers the board", values("").length > 0);
  check("an empty query is alphabetical", values("")[0] === "Ananya Rao", values("").join(", "));
  // Input order deliberately reversed: without the tie-break, sort stability
  // would hand these back exactly as given and the check would still pass.
  check(
    "equal matches break alphabetically",
    values("", ["Zoya Khan", "Ananya Rao"])[0] === "Ananya Rao",
    values("", ["Zoya Khan", "Ananya Rao"]).join(", "),
  );

  // Exactly what is typed is not a suggestion, it is what is already there.
  check("the exact name is not re-offered", !values("Ananya Rao").includes("Ananya Rao"));
  check("...regardless of case or padding", !values("  ananya rao ").includes("Ananya Rao"));

  // Two PODs listing the same person, or Azure and a spreadsheet spelling them
  // differently, must not fill the list with them.
  check("duplicates collapse", suggest("", ["Ananya Rao", "ananya rao", "ANANYA RAO"]).length === 1);
  check("blank names are dropped", suggest("", ["", "   ", "Real Person"]).length === 1);

  check("the list is capped", suggest("", Array.from({ length: 200 }, (_, i) => `Person ${i}`), 8).length === 8);
  check("a zero cap yields nothing", suggest("a", names, 0).length === 0);
  check("a negative cap cannot throw", suggest("a", names, -5).length === 0);

  // Guards — none of these may throw while somebody is typing.
  for (const [label, bad] of [["null", null], ["undefined", undefined], ["a string", "nope"], ["a number", 7]]) {
    check(`a ${label} name list cannot break the box`, Array.isArray(suggest("a", bad)));
  }
  check("hostile entries are skipped", suggest("", [null, undefined, 7, "Real"]).length >= 1);
  check("a hostile query cannot throw", [null, undefined, 7].every((q) => Array.isArray(suggest(q, names))));

  // The match range, so the UI can show *why* a row is in the list without
  // doing its own string maths and getting the offsets wrong.
  const hit = suggest("rao", names).find((h) => h.value === "Ananya Rao");
  check("the match position is reported", hit.at === "Ananya ".length, String(hit.at));
  check("the match length is reported", hit.length === 3);
  const [before, match, after] = highlight(hit.value, hit.at, hit.length);
  check("the highlight splits the name", before + match + after === hit.value);
  check("the highlighted run is the match", match.toLowerCase() === "rao", match);
  check("no match highlights nothing", highlight("Ananya", -1, 0)[1] === "");
  check("an out-of-range offset cannot throw", highlight("Ananya", 99, 3)[0] === "Ananya");
}

section("the search box itself");
{
  const box = readFileSync(new URL("../src/components/search-box.tsx", import.meta.url), "utf8");
  const topbar = readFileSync(new URL("../src/components/topbar.tsx", import.meta.url), "utf8");

  // Typing used to fire a request per keystroke, each re-keying SWR and
  // re-rendering every panel on the board. That is most of what made it heavy.
  check("the query is debounced", box.includes("TIMING.searchDebounceMs"));
  check("the input itself stays instant", box.includes("setText(e.target.value)"));
  check("the debounce is cleared", /return \(\) => clearTimeout\(t\);/.test(box));
  check("a debounce long enough to help", TIMING.searchDebounceMs >= 150, String(TIMING.searchDebounceMs));
  check("...and short enough not to feel laggy", TIMING.searchDebounceMs <= 500, String(TIMING.searchDebounceMs));
  // Picking a suggestion should search now, not in another 250ms.
  check("choosing a suggestion searches at once", /const choose = [\s\S]{0,200}onChange\(name\);/.test(box));

  // Said properly, so it is navigable without sight.
  check("it is a combobox", box.includes('role="combobox"'));
  check("it reports whether the list is open", box.includes("aria-expanded={open && options.length > 0}"));
  check("it points at the list it controls", box.includes("aria-controls={listId}"));
  const boxCode = box.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
  check("it announces the current row", boxCode.includes("aria-activedescendant={"));
  check("the list is a listbox", box.includes('role="listbox"'));
  check("its rows are options", box.includes('role="option"') && box.includes("aria-selected={i === active}"));
  check("the input is labelled", box.includes('aria-label="Search every work item"'));
  check("it can be cleared", box.includes('aria-label="Clear the search"'));
  check("the browser does not add its own list", box.includes('autoComplete="off"'));

  // Keyboard.
  check("arrows move through the list", box.includes('e.key === "ArrowDown"') && box.includes('"ArrowUp"'));
  check("the list wraps", box.includes("% options.length"));
  check("Enter takes the highlighted row", /e\.key === "Enter"[\s\S]{0,220}choose\(options\[active\]\.value\)/.test(box));
  check("Enter with nothing highlighted searches what was typed", /setOpen\(false\);\s*\n\s*onChange\(text\);/.test(box));
  // Closing and clearing in one keystroke throws away a query somebody kept.
  check("Escape closes before it clears", /if \(open\) setOpen\(false\);\s*\n\s*else if \(text\) clear\(\);/.test(box));

  // The input blurs first on click, which would close the list before the
  // choice registered.
  check("choosing uses mousedown, not click", box.includes("onMouseDown={(e) => {") && !box.includes("onClick={() => choose"));
  check("that default is prevented", /onMouseDown[\s\S]{0,80}e\.preventDefault\(\)/.test(box));
  check("an outside press closes the list", box.includes('addEventListener("pointerdown"'));
  check("that listener is torn down", box.includes('removeEventListener("pointerdown"'));

  // Opaque, like the menu — a list you can read the board through is not a list.
  const listClass = box.match(/className="absolute top-full[^"]*"/)?.[0] ?? "";
  check("the list className was found", listClass.length > 0);
  check("the list is opaque", /bg-\[var\(--panel\)\](?!\/)/.test(listClass), listClass.slice(0, 90));
  check("nothing shows through it", !/backdrop-blur/.test(listClass));
  check("a long list scrolls rather than growing", box.includes("overflow-y-auto") && /max-h-\d+/.test(box));
  check("the match is shown", box.includes("<mark"));
  check("reduced motion gets a plain fade", /initial=\{reduced \?/.test(box) && /animate=\{reduced \?/.test(box));

  // It follows the board when the search changes elsewhere — but never while
  // somebody is mid-word.
  check("it follows an external change", box.includes("if (document.activeElement !== input.current) setText(value)"));

  // Wiring, and the phone layout that was fixed earlier.
  check("the topbar uses it", topbar.includes("<SearchBox value={search} onChange={onSearch} names={suggestions} />"));
  const stripComments = (src) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
  check(
    "the native datalist is gone",
    !stripComments(topbar).includes("<datalist") && !stripComments(box).includes("<datalist"),
  );
  const wrapper = topbar.match(/<div className="[^"]*basis-full[^"]*">\s*\n\s*<SearchBox/)?.[0] ?? "";
  check("the search wrapper was found", wrapper.length > 0);
  check("it takes a whole row on a phone", /\bbasis-full\b/.test(wrapper));
  check("it shares the row on wider screens", /sm:basis-auto/.test(wrapper));
  check("it is not the only thing that can shrink", !/flex-1/.test(wrapper));
}
section("the downloaded report can be uploaded straight back");
{
  // The contract of the download button: the file it writes is not a report
  // *about* the board, it is the board in the shape the importer reads. If a
  // single header drifted, a downloaded sheet would come back in with that
  // column silently ignored — and nobody would notice until the numbers moved.
  const headers = EXPORT_COLUMNS.map((c) => c.header);
  const mapped = mapHeaders(headers);

  const unrecognised = headers.filter((h, i) => mapped[i] === undefined);
  check("every exported header is one the importer knows", unrecognised.length === 0, unrecognised.join(", "));

  const wrong = EXPORT_COLUMNS.filter((c, i) => mapped[i] !== c.field).map((c) => c.header);
  check("each header maps back to its own field", wrong.length === 0, wrong.join(", "));

  check("no column is exported twice", new Set(headers).size === headers.length, headers.join(", "));
  check("the fields are distinct too", new Set(EXPORT_COLUMNS.map((c) => c.field)).size === EXPORT_COLUMNS.length);
  check("columns have widths", EXPORT_COLUMNS.every((c) => Number.isFinite(c.width) && c.width > 0));

  // The columns that carry meaning must be there. A report missing severity is
  // not a smaller report, it is a different one.
  for (const field of ["workItemId", "title", "assignee", "severity", "environment", "status", "createdDate", "closedDate"]) {
    check(`${field} is exported`, EXPORT_COLUMNS.some((c) => c.field === field));
  }
  // Title first-ish and id first: the importer rejects a sheet with no title
  // column, and warns that a sheet with no id duplicates on re-upload.
  check("the id leads the sheet", EXPORT_COLUMNS[0].field === "workItemId");
  check("the title is beside it", EXPORT_COLUMNS[1].field === "title");
}

section("a row survives the round trip");
{
  const item = {
    id: "amc:42", workItemId: "42", teamId: "amc", source: "azure", kind: "bug",
    type: "Bug", title: "Statement PDF fails to download", url: "https://dev.azure.com/x/_workitems/edit/42",
    assignee: "Ananya Rao", assigneeEmail: "ananya@x.com", severity: "Critical",
    environment: "Production", status: "Open", state: "Active", priority: 1,
    tags: ["prod", "payments"], createdDate: "2026-08-01T09:00:00.000Z",
    changedDate: "2026-08-02T09:00:00.000Z", closedDate: null, isActive: true,
  };
  const row = toRow(item);
  const at = (field) => row[EXPORT_COLUMNS.findIndex((c) => c.field === field)];

  check("a row has one cell per column", row.length === EXPORT_COLUMNS.length, `${row.length} vs ${EXPORT_COLUMNS.length}`);
  check("the id is written", at("workItemId") === "42");
  check("the title is written", at("title") === item.title);
  check("the severity is written", at("severity") === "Critical");
  check("dates are written as real dates", at("createdDate") instanceof Date);
  check("that date is the right one", at("createdDate").toISOString() === item.createdDate);
  // Tags join on semicolons: the parser splits on `;` or `,`, and a comma
  // inside a CSV cell is the one separator that will not survive.
  check("tags use a separator that survives CSV", at("tags") === "prod; payments");

  // Absent is absent — not the string "null", which would re-import as a date.
  check("an open item has no closed date", at("closedDate") === null);
  const noPriority = toRow({ ...item, priority: null });
  check("a missing priority is blank", noPriority[EXPORT_COLUMNS.findIndex((c) => c.field === "priority")] === null);

  // Hostile and malformed items must not throw mid-download: one bad row would
  // fail the whole export, and the reader has no way to find which row it was.
  const nasty = [
    ["no tags", { ...item, tags: [] }],
    ["an unparseable created date", { ...item, createdDate: "not a date" }],
    ["an unparseable closed date", { ...item, closedDate: "soon" }],
    ["an empty title", { ...item, title: "" }],
  ];
  for (const [label, bad] of nasty) {
    let out = null;
    try { out = toRow(bad); } catch { out = null; }
    check(`${label} still yields a row`, Array.isArray(out) && out.length === EXPORT_COLUMNS.length, label);
  }
  check("an unparseable date becomes blank, not Invalid Date", toRow({ ...item, createdDate: "not a date" })[EXPORT_COLUMNS.findIndex((c) => c.field === "createdDate")] === null);
}

section("the export route and its button");
{
  const route = readFileSync(new URL("../src/app/api/export/route.ts", import.meta.url), "utf8");

  // It reads real work items, so it is behind the same boundary as everything
  // else that does — a member must not be able to export a POD they cannot see.
  check("the export requires a signed-in user", route.includes("await requireUser()"));
  check("it scopes through the shared filter boundary", route.includes("filtersFromRequest(req, user)"));
  check("it honours the board's filters", route.includes("streamItems(filters"));
  // One request for the whole cap is refused by OpenSearch above
  // `index.max_result_window` — 10,000 by default — which failed on every board,
  // not just large ones. It pages with `search_after` instead.
  check("it pages rather than asking for everything at once", route.includes("for await (const page of streamItems"));
  check("the page size stays under the result window", EXPORT.pageSize <= 10_000, String(EXPORT.pageSize));
  check("the row count is reported back", route.includes('"X-Row-Count"'));
  check("it shares one column definition with the importer", route.includes("EXPORT_COLUMNS") && route.includes("toRow"));

  // Guards.
  check("the row count is bounded", route.includes("EXPORT.maxRows"));
  check("errors go through the shared handler", route.includes("return errorResponse(err)"));
  check("a snapshot is never cached", route.includes('"Cache-Control": "no-store"'));
  check("it is served as a spreadsheet", route.includes("spreadsheetml.sheet"));
  check("it downloads rather than renders", route.includes("attachment; filename="));
  // A POD name reaches the filename, and a Content-Disposition header is parsed.
  check("the filename is sanitised", route.includes('replace(/[^a-z0-9-]+/g, "-")'));
  check("the filename is bounded", /\.slice\(0, \d+\)/.test(route));
  check("the filename carries the date", route.includes("toISOString().slice(0, 10)"));

  const topbar = readFileSync(new URL("../src/components/topbar.tsx", import.meta.url), "utf8");
  check("there is a download button", topbar.includes("/api/export?"));
  check("it downloads the filtered view", topbar.includes("new URLSearchParams(baseQuery)"));
  // A real link, so the browser streams the file to disk rather than the page
  // assembling a 20,000-row blob in a JavaScript string.
  check("the download is a link, so the browser streams it", /href=\{`\/api\/export[\s\S]{0,80}download/.test(topbar));
  check("it says what it gives you", topbar.includes("same filters, same columns"));
  const dash = readFileSync(new URL("../src/components/dashboard-client.tsx", import.meta.url), "utf8");
  check("the button gets the live filters", dash.includes("baseQuery={baseQuery}"));
}

section("the For you menu");
{
  const ui = uiSource();
  /*
   * The Menu has its own file now, so read it rather than slicing it out of a
   * concatenation — the old bound was 'up to MenuSection', which stopped
   * working the moment MenuSection moved to a file that sorts earlier.
   */
  const menu = readFileSync(new URL("../src/components/ui/menu.tsx", import.meta.url), "utf8");
  const menuItems = readFileSync(new URL("../src/components/ui/menu-item.tsx", import.meta.url), "utf8");

  check("there is a menu component", menu.length > 0);

  // It is a menu, and it says so. A div that toggles is not a menu to anyone
  // who is not looking at it.
  check("the trigger declares a popup", menu.includes('aria-haspopup="menu"'));
  check("the trigger reports open or shut", menu.includes("aria-expanded={open}"));
  check("the panel is a menu", menu.includes('role="menu"'));
  check("the panel is named", menu.includes("aria-label={label}"));
  const item = ui.slice(ui.indexOf("export function MenuItem("));
  check("its rows are menu items", item.includes('role="menuitem"'));

  // Keyboard. A menu you cannot leave with the keyboard is a trap.
  check("Escape closes it", menu.includes('e.key === "Escape"'));
  check("Escape returns focus to the trigger", /Escape[\s\S]{0,220}trigger\.current\?\.focus\(\)/.test(menu));
  check("arrow keys move between rows", menu.includes('"ArrowDown"') && menu.includes('"ArrowUp"'));
  check("Home and End jump to the ends", menu.includes('e.key === "Home"') && menu.includes('e.key === "End"'));
  check("arrow keys wrap around", menu.includes("% items.length"));
  check("arrowing does not scroll the page", menu.includes("e.preventDefault()"));
  // Counted, not merely present: the selector appears in both the arrow-key
  // handler and the open-with-keyboard path, so `includes` passed with one of
  // them focusing disabled rows.
  check(
    "disabled rows are skipped everywhere they are gathered",
    (menu.match(/\[data-menuitem\]/g) || []).length === (menu.match(/\[data-menuitem\]:not\(\[disabled\]\)/g) || []).length,
    `${(menu.match(/\[data-menuitem\]/g) || []).length} selectors`,
  );
  check("opening with the keyboard lands on a row", menu.includes("openWith(true)"));
  check("opening with a pointer does not steal focus", menu.includes("openWith(false)"));

  // Dismissal. `click` fires after the thing it landed on has already run, so
  // a press outside would act *and* leave the menu open.
  check("an outside press closes it", menu.includes('addEventListener("pointerdown"'));
  check("it listens on pointerdown, not click", !menu.includes('addEventListener("click"'));
  check("both listeners are torn down", /removeEventListener\("pointerdown"[\s\S]{0,160}removeEventListener\("keydown"/.test(menu));
  check("nothing is bound while it is shut", menu.includes("if (!open) return;"));
  check("choosing a row closes it", item.includes("onClick={close}") && /onClick\?\.\(\);\s*\n\s*close\(\);/.test(item));

  // It has to be beautiful, and it has to behave when motion is off.
  check("it animates in and out", menu.includes("<AnimatePresence>") && menu.includes("exit="));
  check("it springs rather than easing", menu.includes('type: "spring"'));
  check("it grows from the trigger", menu.includes("transformOrigin"));
  check("the chevron turns", menu.includes("rotate-180"));
  // All three, not any one: testing for the pattern anywhere passed while
  // `initial` animated regardless, because `exit` still honoured it.
  check(
    "reduced motion gets a plain fade",
    ["initial", "animate", "exit"].every((prop) => new RegExp(`${prop}=\\{reduced \\?`).test(menu)),
    ["initial", "animate", "exit"].filter((p) => !new RegExp(`${p}=\\{reduced \\?`).test(menu)).join(", "),
  );

  // --- it has to be readable, and on screen ---------------------------
  //
  // A menu you can read the dashboard through is unreadable. `--panel` is the
  // token for exactly this case: "solid popovers, drawers, menus".
  // The className, not the whole component: `bg-[var(--panel)]/70` still
  // *contains* `bg-[var(--panel)]`, so a substring test passed on a
  // translucent panel.
  const panelClass = menu.match(/className={`absolute top-full[\s\S]*?`}/)?.[0] ?? "";
  check("the panel className was found", panelClass.length > 0);
  check("the panel is opaque", /bg-\[var\(--panel\)\](?!\/)/.test(panelClass), panelClass.slice(0, 80));
  check("nothing shows through it", !/backdrop-blur/.test(panelClass));
  check("the panel is not glass", !/className={`glass/.test(menu) && !/ glass /.test(menu.split("role=\"menu\"")[1] ?? ""));
  check("it still reads as a surface", menu.includes("border-[var(--glass-border)]") && menu.includes("shadow-[var(--glass-shadow)]"));

  // A fixed-width panel anchored right runs off the left edge of a 320px phone.
  check("the panel cannot overflow a phone", menu.includes("w-[min(19rem,calc(100vw-1.5rem))]"));
  check("it sits above the bar it hangs from", menu.includes("z-40"));

  // The trigger is at the left of the bar on a phone and near the right on a
  // desktop, so one anchor sends the panel off one edge or the other.
  check("the anchor flips by breakpoint", menu.includes("left-0 sm:right-0 sm:left-auto"));
  // ...and a measured nudge catches whatever the anchor does not.
  check("the panel is measured against the viewport", menu.includes("getBoundingClientRect()"));
  check("it measures before paint", menu.includes("useLayoutEffect"));
  check("it nudges itself back into view", menu.includes("setShift((current) => current + dx)"));
  // Both props, by line. Testing the component as a whole passed with `animate`
  // stripped, because `initial` still carried it — so the panel measured
  // correctly and then animated away from the position it had measured.
  const propLine = (name) => menu.split("\n").find((l) => l.trim().startsWith(`${name}=`)) ?? "";
  check(
    "the nudge is applied to the panel",
    ["initial", "animate"].every((p) => propLine(p).includes("x: shift")),
    ["initial", "animate"].filter((p) => !propLine(p).includes("x: shift")).join(", "),
  );
  check("it leaves a margin at the edge", /const margin = \d+;/.test(menu));
  check("it measures usable width, not innerWidth", menu.includes("documentElement.clientWidth"));
  check("it re-fits on resize", /addEventListener\("resize", fit\)/.test(menu) && /removeEventListener\("resize", fit\)/.test(menu));
  check("the nudge resets when it closes", /if \(!open\) \{\s*\n\s*setShift\(0\);/.test(menu));
}

section("what stays on the bar, and what folds away");
{
  const topbar = readFileSync(new URL("../src/components/topbar.tsx", import.meta.url), "utf8");

  check("the menu is labelled For you", topbar.includes('<Menu label="For you"'));

  // The actions all moved inside. None of them may be left on the bar as well,
  // or the menu is decoration and the icon wall is still there.
  const menuStart = topbar.indexOf('<Menu label="For you"');
  const menuEnd = topbar.indexOf("</Menu>");
  const inMenu = topbar.slice(menuStart, menuEnd);
  const onBar = topbar.slice(0, menuStart) + topbar.slice(menuEnd);
  check("the menu block was found", menuStart > 0 && menuEnd > menuStart);

  for (const action of ["Sync now", "Download report", "Upload a spreadsheet"]) {
    check(`${action} is in the menu`, inMenu.includes(action));
  }
  check("admin is in the menu", inMenu.includes('label="Admin"'));
  check("no stray Sync button on the bar", !/<Button[^>]*\n?[^>]*onClick=\{onSync\}/.test(onBar));
  check("no stray export link on the bar", !onBar.includes("/api/export?"));
  check("no stray upload button on the bar", !/onClick=\{\(\) => fileRef\.current\?\.click\(\)\}/.test(onBar));
  check("no stray admin link on the bar", !/href="\/admin"/.test(onBar));

  // Desktop keeps: POD picker, kind filter, search, theme, sign out.
  check("the POD picker stays on the bar", onBar.includes('id="pod-picker"'));
  check("the kind filter stays on the bar", /groupId="kind-filter"/.test(onBar));
  check("the search stays on the bar", onBar.includes("<SearchBox"));
  check("the theme toggle stays on the bar", onBar.includes("<ThemeToggle />"));
  check("sign out stays on the bar", onBar.includes('href="/api/auth/signout"'));

  // ...and on a phone the filters fold in too, leaving only what a reader
  // needs at a glance.
  check("the bar filters are hidden on a phone", /hidden items-center gap-2 sm:flex/.test(topbar));
  check("the menu carries the filters on a phone", inMenu.includes('className="sm:hidden"'));
  check("the menu POD picker has its own id", inMenu.includes('id="pod-picker-menu"'));
  check("the two pickers do not share an id", topbar.includes('id="pod-picker"') && topbar.includes('id="pod-picker-menu"'));
  // Two SegmentedControls animate a shared pill by layoutId; the same id in
  // both would make the pill fly between the bar and the menu.
  check("the two kind filters have distinct layout ids", topbar.includes('groupId="kind-filter"') && topbar.includes('groupId="kind-filter-menu"'));
  check("both pickers change the same POD", (topbar.match(/onChange=\{\(e\) => onTeam\(e\.target\.value\)\}/g) || []).length === 2);
  check("both filters change the same kind", (topbar.match(/onChange=\{onKind\}/g) || []).length === 2);

  // Guards that were on the old buttons must survive the move.
  check("upload still needs a POD", inMenu.includes("disabled={uploading || !teamId}"));
  check("the download still needs a scope", inMenu.includes("disabled={!teamId && !canSeeAllPods}"));
  check("sync is disabled while syncing", inMenu.includes("disabled={syncing}"));
  check("the download still carries the filters", inMenu.includes("new URLSearchParams(baseQuery)"));
  check("the last sync time is still shown", inMenu.includes("lastSyncedAt"));
  check("admin is still gated", /\{isAdmin && \(/.test(topbar));
  check("sign out is still gated", /\{authEnabled && \(/.test(topbar));
}

section("forms: what is rejected before it is sent");
{
  const pod = { name: "AMC POD", ageingThresholdDays: 7, members: [] };

  check("a filled-in POD passes", validateTeam(pod) === null, String(validateTeam(pod)));
  check("a nameless POD is refused", validateTeam({ ...pod, name: "" }) !== null);
  check("a whitespace name is refused", validateTeam({ ...pod, name: "   " }) !== null);
  check("nothing at all is refused", validateTeam(null) !== null && validateTeam(undefined) !== null);

  // The threshold reaches OpenSearch as date maths, where a negative fails to
  // parse and takes the whole dashboard with it.
  check("a zero threshold is refused", validateTeam({ ...pod, ageingThresholdDays: 0 }) !== null);
  check("a negative threshold is refused", validateTeam({ ...pod, ageingThresholdDays: -3 }) !== null);
  check("an absurd threshold is refused", validateTeam({ ...pod, ageingThresholdDays: 9999 }) !== null);
  check("a fractional threshold is refused", validateTeam({ ...pod, ageingThresholdDays: 7.5 }) !== null);
  check("a NaN threshold is refused", validateTeam({ ...pod, ageingThresholdDays: NaN }) !== null);
  check("the documented bounds are accepted", validateTeam({ ...pod, ageingThresholdDays: 1 }) === null && validateTeam({ ...pod, ageingThresholdDays: 365 }) === null);

  // The form ships with one blank member row, and the save path strips it.
  // Refusing it would mean a new POD could never be saved.
  check("a blank member row is not an error", validateTeam({ ...pod, members: [{ name: "", email: "" }] }) === null);
  check("several blank rows are not an error", validateTeam({ ...pod, members: [{}, {}, {}] }) === null);

  // ...but a half-filled one is a person who would be dropped silently.
  const emailOnly = validateTeam({ ...pod, members: [{ name: "", email: "a@b.com" }] });
  check("an email with no name is refused", emailOnly !== null);
  check("that message says which row", /Member 1/.test(String(emailOnly)), String(emailOnly));
  check("a name with no email is fine", validateTeam({ ...pod, members: [{ name: "Ananya Rao" }] }) === null);
  check("a malformed email is refused", validateTeam({ ...pod, members: [{ name: "A", email: "not-an-email" }] }) !== null);
  check("the bad email is quoted back", /not-an-email/.test(String(validateTeam({ ...pod, members: [{ name: "A", email: "not-an-email" }] }))));

  // Two people on one email would both match the same work items.
  const dupe = validateTeam({ ...pod, members: [{ name: "A", email: "x@y.com" }, { name: "B", email: "X@Y.com" }] });
  check("two members sharing an email are refused", dupe !== null, String(dupe));
  check("that check ignores case", /x@y\.com/i.test(String(dupe)));

  check("a non-array members field cannot throw", validateTeam({ ...pod, members: "nope" }) === null);
  check("a hostile member row cannot throw", validateTeam({ ...pod, members: [null, undefined, 7] }) === null);
}

section("forms: accounts");
{
  const user = { email: "ananya@x.com", name: "Ananya", password: "", role: "member" };

  check("an SSO account with no password is valid", validateUser(user) === null, String(validateUser(user)));
  check("no email is refused", validateUser({ ...user, email: "" }) !== null);
  check("a malformed email is refused", validateUser({ ...user, email: "ananya" }) !== null);
  check("the bad email is quoted back", /ananya/.test(String(validateUser({ ...user, email: "ananya" }))));
  check("nothing at all is refused", validateUser(null) !== null);

  // Blank is meaningful — it is how an SSO user is created. Only a password
  // somebody actually typed has to clear the bar.
  check("a short password is refused", validateUser({ ...user, password: "abc" }) !== null);
  check("a long enough password is fine", validateUser({ ...user, password: "a".repeat(MIN_PASSWORD) }) === null);
  check("the minimum is stated in the message", new RegExp(String(MIN_PASSWORD)).test(String(validateUser({ ...user, password: "abc" }))));

  check("an unknown role is refused", validateUser({ ...user, role: "superuser" }) !== null);
  check("both real roles are accepted", validateUser({ ...user, role: "admin" }) === null && validateUser({ ...user, role: "member" }) === null);

  // Re-adding somebody is a mistake worth catching before the round trip.
  check("an existing account is refused", validateUser(user, ["ananya@x.com"]) !== null);
  check("that check ignores case and spacing", validateUser(user, ["  ANANYA@X.COM "]) !== null);
  check("a different account is fine", validateUser(user, ["someone@else.com"]) === null);
  check("a hostile existing list cannot throw", validateUser(user, [null, undefined, 7]) === null);

  // Deliberately loose: the failure mode of a strict pattern is rejecting a
  // real address, which is worse than accepting a typo the server rejects.
  for (const good of ["a@b.co", "first.last+tag@sub.domain.org", "x_y@z-w.com"]) {
    check(`${good} is accepted`, isEmail(good));
  }
  for (const bad of ["", "   ", "a@b", "a b@c.com", "@b.com", "a@", "a.com", null, undefined]) {
    check(`${JSON.stringify(bad)} is rejected`, !isEmail(bad));
  }
}

section("forms: success clears, failure keeps");
{
  const admin = adminSource();

  // The bug: `save` returned undefined on both paths and the caller cleared
  // the form in a `.then()`, so a rejected account still wiped everything the
  // reader had typed while a red toast flashed past.
  check("saving reports whether it worked", /Promise<boolean>/.test(admin));
  check("it returns false when the server refuses", /flash\(body\.error[\s\S]{0,80}return false;/.test(admin));
  check("it returns true only after success", /flash\(message\);[\s\S]{0,80}return true;/.test(admin));
  check("the form clears only on success", admin.includes("if (saved) setForm({"));
  check("nothing clears in a bare .then()", !/\.then\(\(\) =>\s*\n?\s*setForm\(/.test(admin));

  // A dropped connection is not a rejected form.
  check("a network failure keeps the input", /catch \{[\s\S]{0,160}Could not reach the server/.test(admin));
  check("the busy flag always clears", /finally \{[\s\S]{0,60}setBusy\(false\);/.test(admin));

  // Validation runs before the request, and says why.
  check("accounts are checked before sending", admin.includes("const problem = validateUser(form"));
  check("PODs are checked before sending", admin.includes("const problem = validateTeam(draft)"));
  // Every validated form reports the same way. Counted against the number of
  // validators actually called, so adding a form does not silently skip this.
  const validated = (admin.match(/const problem = validate\w+\(/g) || []).length;
  check("every checked form shows an error toast", (admin.match(/return flash\(problem, "bad"\)/g) || []).length === validated, `${validated} validators`);
  check("the existing accounts are passed in", admin.includes("users.map((u) => u.email)"));

  // The Add button used to need an "@" before it would even light up, so the
  // reader got a dead button and no explanation.
  check("the button lights up whenever there is something to judge", admin.includes("disabled={busy || !form.email.trim()}"));
  check("it no longer gates on an @", !admin.includes('form.email.includes("@")'));

  // The POD editor keeps the draft on failure — it is an editor, and losing an
  // edit is worse than an unsaved one.
  check("a failed POD save keeps the draft", !/catch[\s\S]{0,120}setDraft\(null\)/.test(admin));
  check("a successful POD save shows what was stored", admin.includes("setDraft(body.team)"));
  check("creating and updating say different things", admin.includes("creating ? `Created"));
}

section("uploads work without Excel installed");
{
  const bytes = (...parts) =>
    new Uint8Array(parts.flatMap((p) => (typeof p === "string" ? [...p].map((c) => c.charCodeAt(0)) : p)));

  const ZIP = [0x50, 0x4b, 0x03, 0x04];
  const OLE2 = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];
  const pad = (n) => new Array(n).fill(0);

  // The whole point: the *bytes* decide, not the filename. Branching on the
  // extension assumes the reader has Excel and names files the way Excel does.
  check("an xlsx is recognised", detectSheet(bytes(ZIP, pad(26), "xl/workbook.xml"), "board.xlsx") === "xlsx");
  check("a CSV is recognised", detectSheet(bytes("Title,Assignee\n1,Ananya"), "board.csv") === "csv");
  check("a CSV named .txt is still a CSV", detectSheet(bytes("Title,Assignee\n1,A"), "board.txt") === "csv");
  check("a CSV with no extension is still a CSV", detectSheet(bytes("Title,Assignee\n1,A"), "board") === "csv");
  check("a tab-separated file is read as delimited", detectSheet(bytes("Title\tAssignee\n1\tA"), "b.tsv") === "csv");
  check("a semicolon-separated file is too", detectSheet(bytes("Title;Assignee\n1;A"), "b.csv") === "csv");
  check("a single-column sheet is still a CSV", detectSheet(bytes("Title\nOne\nTwo"), "b.csv") === "csv");
  check("an xlsx named .csv is read as xlsx", detectSheet(bytes(ZIP, pad(26), "[Content_Types].xml"), "board.csv") === "xlsx");

  // The formats people actually have when they do not have Excel. Each is
  // named, because "could not read it" is useless when the fix is two menu
  // items away.
  const numbers = bytes(ZIP, pad(26), "Index/Document.iwa");
  check("a Numbers package is identified", detectSheet(numbers, "board.numbers") === "numbers");
  check("Numbers gets told how to export", /Numbers/.test(whyNotReadable("numbers", "board.numbers")));
  check("that message names the menu path", /Export To/.test(whyNotReadable("numbers", "b.numbers")));

  const ods = bytes(ZIP, pad(26), "mimetypeapplication/vnd.oasis.opendocument.spreadsheet");
  check("an OpenDocument sheet is identified", detectSheet(ods, "board.ods") === "ods");
  check("LibreOffice gets told how to export", /LibreOffice/.test(whyNotReadable("ods", "b.ods")));

  check("the old binary .xls is identified", detectSheet(bytes(OLE2, pad(16)), "board.xls") === "legacy-xls");
  check("it says to re-save it", /re-save/.test(whyNotReadable("legacy-xls", "b.xls")));

  // Guards. None of these may throw mid-upload.
  check("an empty file is unknown", detectSheet(new Uint8Array(0), "x.csv") === "unknown");
  check("a stray zip is unknown unless named", detectSheet(bytes(ZIP, pad(26), "random/thing"), "x.zip") === "unknown");
  check("...but a named xlsx zip is trusted", detectSheet(bytes(ZIP, pad(26), "random/thing"), "x.xlsx") === "xlsx");
  check("binary rubbish is unknown", detectSheet(new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7]), "x.csv") === "unknown");
  check("a blank first line is unknown", detectSheet(bytes("\n\n\n"), "x.csv") === "unknown");
  check("a lone byte cannot be mistaken for a zip", !isZip(new Uint8Array([0x50])));
  check("a short file cannot be mistaken for OLE2", !isLegacyXls(new Uint8Array([0xd0, 0xcf])));
  check("every kind yields a message", ["xlsx", "csv", "numbers", "ods", "legacy-xls", "unknown"].every((k) => whyNotReadable(k, "f").length > 20));
  check("a missing filename still reads", /that file/.test(whyNotReadable("unknown", "")));

  // The route has to use it.
  const route = ["route.ts", "sheets.ts"].map((f) => readFileSync(new URL(`../src/app/api/upload/${f}`, import.meta.url), "utf8")).join("\n");
  check("the upload sniffs the bytes", route.includes("detectSheet(new Uint8Array(bytes), file.name)"));
  check("it no longer branches on the filename", !/file\.name\.toLowerCase\(\)\.endsWith\(".csv"\)/.test(route));
  check("an unreadable file is explained", route.includes("whyNotReadable(kind, file.name)"));
  check("a corrupt file is a 400, not a 500", /whyNotReadable\("unknown"[\s\S]{0,80}status: 400/.test(route));

  // The picker must not grey out a file the server would happily accept.
  check("the picker offers MIME types as well as extensions", UPLOAD.accept.includes("text/csv"));
  check("it offers the spreadsheet MIME type", UPLOAD.accept.includes("spreadsheetml.sheet"));
  check("it offers plain text, for CSVs the OS types oddly", UPLOAD.accept.includes("text/plain"));
  check("it still offers the extensions", [".csv", ".xlsx"].every((e) => UPLOAD.accept.includes(e)));
}

section("health is the share of the board that is closed");
{
  const T = (over = {}) => ({ total: 100, active: 0, ...over });

  /* ---------------------------------------------------------- the ratio -- */

  check("a cleared board is fully closed", closedRatio(T({ active: 0 })) === 1);
  check("a wholly open board is not closed at all", closedRatio(T({ active: 100 })) === 0);
  check("half open is half closed", closedRatio(T({ active: 50 })) === 0.5);
  check("2 of 5 open is 3 of 5 closed", closedRatio({ total: 5, active: 2 }) === 0.6);

  /* ---------------------------------------------------------- the score -- */

  check("a cleared board scores 100", healthScore(T({ active: 0 })) === 100);
  check("a wholly open board scores 0", healthScore(T({ active: 100 })) === 0);
  check("half open scores 50", healthScore(T({ active: 50 })) === 50);
  check("a quarter open scores 75", healthScore(T({ active: 25 })) === 75);

  /*
   * The whole calculation, on a real board. A reader can do this division
   * themselves from the two numbers printed on the card — which is the reason
   * the weighted heuristic was removed in favour of it.
   */
  check("138 closed of 244 reads 57", healthScore({ total: 244, active: 106 }) === 57, `=${healthScore({ total: 244, active: 106 })}`);
  check("72 closed of 120 reads 60", healthScore({ total: 120, active: 48 }) === 60);
  check("3 closed of 5 reads 60", healthScore({ total: 5, active: 2 }) === 60);
  check("the score is closed over tracked, rounded", healthScore({ total: 244, active: 106 }) === Math.round((138 / 244) * 100));

  /*
   * What the score deliberately cannot see. Age and severity moved out of it
   * entirely; the card shows them beside the ring instead, because they are the
   * numbers this one is blind to.
   */
  check("age cannot reach the score", healthScore({ total: 100, active: 50, avgAgeDays: 9999 }) === 50);
  check("severity cannot reach the score", healthScore({ total: 100, active: 50, criticalAged: 99 }) === 50);
  check("the threshold cannot reach the score", healthScore({ total: 100, active: 50 }) === healthScore({ total: 100, active: 50 }, 365));

  /* ------------------------------------------------------------- guards -- */

  // An empty board is not unhealthy, it is empty — and 0/0 is not a number.
  check("an empty board is fully closed", closedRatio({ total: 0, active: 0 }) === 1);
  check("an empty board scores 100", healthScore({ total: 0, active: 0 }) === 100);
  // Nothing tracked but something open is incoherent — a half-written
  // aggregation. Dividing by the zero would put Infinity on the dial.
  check("open items with nothing tracked still scores 100", healthScore({ total: 0, active: 5 }) === 100);
  // More open than tracked would make `closed` negative and the score < 0.
  check("more open than tracked cannot go negative", healthScore({ total: 5, active: 500 }) === 0);
  check("...and its ratio is floored at zero", closedRatio({ total: 5, active: 500 }) === 0);
  // A negative open count would make `closed` exceed the board.
  check("a negative open count cannot exceed 100", healthScore({ total: 5, active: -20 }) === 100);
  check("...and its ratio is capped at one", closedRatio({ total: 5, active: -20 }) === 1);

  check("the score is always a whole number", Number.isInteger(healthScore({ total: 7, active: 2 })));
  check("the score stays within 0..100", [0, 1, 3, 7, 244, 9999].every((total) =>
    [0, 1, 2, 5, 100, 9999].every((active) => {
      const s = healthScore({ total, active });
      return Number.isFinite(s) && s >= 0 && s <= 100;
    })));

  for (const [label, bad] of [["null", null], ["undefined", undefined], ["an empty object", {}]]) {
    check(`${label} totals score 100 without throwing`, healthScore(bad) === 100);
  }
  check("NaN fields cannot reach the score", healthScore({ total: NaN, active: NaN }) === 100);
  check("string fields cannot reach the score", healthScore({ total: "5", active: "2" }) === 100);
  check("an Infinite total cannot reach the score", healthScore({ total: Infinity, active: 5 }) === 100);

  /* --------------------------------------------------------- the wiring -- */

  const health = readFileSync(new URL("../src/lib/health.ts", import.meta.url), "utf8");
  /*
   * `constants.ts` is a barrel over `constants/` now — one 320-line file held
   * storage caps, session policy and the greeting's cast schedule, which have
   * nothing to do with each other. The rules are about the set, not the file.
   */
  const CONSTANTS_DIR = new URL("../src/lib/constants/", import.meta.url);
  const constants = [
    readFileSync(new URL("../src/lib/constants.ts", import.meta.url), "utf8"),
    ...readdirSync(CONSTANTS_DIR).filter((f) => f.endsWith(".ts")).sort().map((f) => readFileSync(new URL(f, CONSTANTS_DIR), "utf8")),
  ].join("\n");
  const metrics = readFileSync(new URL("../src/lib/metrics.ts", import.meta.url), "utf8");

  check("metrics imports the score", /import \{ healthScore \} from "\.\/health"/.test(metrics));
  check("metrics keeps no copy of the arithmetic", !/closedRatio|\/ t\.total/.test(metrics));
  // The threshold still drives the aged tile and the filters, but no longer the
  // score — passing it would imply it does.
  check("the score is called with totals alone", /healthScore\(totals\)/.test(metrics));

  /*
   * The penalty model is gone, not merely unused. Dead constants and an
   * unreachable second formula are what make a file impossible to trust later.
   */
  for (const gone of ["criticalPerItem", "criticalCap", "ageThresholdMultiple", "ageCap", "backlogCap"]) {
    check(`${gone} is gone from the constants`, !constants.includes(gone));
    check(`${gone} is gone from the score`, !health.includes(gone));
  }
  check("there is no scoring mode left to switch", !health.includes("HealthMode") && !constants.includes("HealthMode"));
  check("there is no penalty breakdown left", !/healthPenalties|HealthBreakdown/.test(health));
  check("nothing still imports the removed constants", !/HEALTH/.test(health));
  check("one scoring expression, not two", (health.match(/Math\.round\(closedRatio/g) ?? []).length === 1);

  /*
   * The ring reads as a percentage, not as "N OF 100".
   *
   * The caption sat a few rows above "106 of 244" — a real count of real items
   * — so the score read as another tally rather than a proportion. Anchored to
   * the JSX rather than to the file, because the comment explaining this rule
   * quotes the very string the rule forbids.
   */
  const dial = readFileSync(new URL("../src/components/health-dial.tsx", import.meta.url), "utf8");
  check("the ring carries a percent sign", />\s*%\s*<\/span>/.test(dial));
  check("the of-100 caption is gone", !/\?\s*"of 100"/.test(dial));
  check("the caption says what is counted", /\{explored === null \? "closed" : "exploring"\}/.test(dial));
  check("screen readers hear the same caption", /aria-valuetext=\{`\$\{Math\.round\(shown\)\}% closed/.test(dial));
  check("the dial still reports 0..100 to assistive tech", /aria-valuemin=\{0\}/.test(dial) && /aria-valuemax=\{100\}/.test(dial));
  check("the dial no longer reads a scoring mode", !/HEALTH/.test(dial));

  // The card has to print the denominator, or the score cannot be checked.
  const ring = ["health-ring.tsx", "health-drivers.ts"].map((f) => readFileSync(new URL(`../src/components/${f}`, import.meta.url), "utf8")).join("\n");
  check("the summary says how many of how many", /\$\{data\.totals\.active\} of \$\{data\.totals\.total\} open/.test(ring));
  check("the still-open tile carries its denominator", /of: data\.totals\.total > 0/.test(ring));
  check("the denominator is rendered, not just computed", /\{d\.of && </.test(ring));
  check("the drill subtitle reads as a percentage", /health \$\{data\.health\}%/.test(ring));
  check("the scrubbed value reads as a percentage", /\{explored\}%<\/span>/.test(ring));
  check("...and so does the value it returns to", /Release to return to \{data\.health\}%/.test(ring));

  /*
   * Only one tile feeds the score now, so the card must not still claim the
   * three of them are what it is made of.
   */
  check("the card does not claim three drivers", !/what the score is made of/i.test(ring));
  check("the open tile is the one that moves it", /Still open/.test(ring));
}


section("the scene's counts are tunable from one file");
{
  /*
   * A constant nothing reads is worse than no constant: it looks like a knob,
   * turning it does nothing, and the next person trusts it. Checking the value
   * is sane is only half the job — these check the component actually *asks*.
   */
  const card = greetingSource();
  const world = greetingSource();

  check("the cast comes from the constant", /const CAST[^=]*= SCENE\.cast;/.test(card));
  check("the cloud counts come from the constant", /const CLOUD_COUNT[^=]*= SCENE\.clouds;/.test(card));
  check("the unconfigured count comes from it too", /CLOUDS_UNKNOWN = SCENE\.clouds\.unknown/.test(card));
  check("the bat count comes from the constant", /SCENE\.bats/.test(card));
  check("the grass counts come from the constant", /tufts\(SCENE\.grass\.back/.test(world) && /tufts\(SCENE\.grass\.front/.test(world));

  /*
   * And that the old hardcoded tables did not quietly come back beside them.
   * A literal cast row or cloud table in the component would keep every value
   * check passing while the knob in `constants.ts` did nothing at all.
   */
  check("no cast table is hardcoded in the card", !/morning: \{ crane:/.test(card));
  check("no cloud table is hardcoded in the card", !/\{ clear: \d/.test(card));
  check("no tuft count is hardcoded in the world", !/tufts\(\d+,/.test(world));

  // The knobs are reachable together, in the group that documents them.
  check("every scene knob lives in one group", ["cast", "bats", "grass", "clouds"].every((k) => k in SCENE), Object.keys(SCENE).join(", "));
  check("the cast covers every phase", ["morning", "afternoon", "evening", "night"].every((p) => SCENE.cast[p]));
  check("the grass counts are whole numbers", Number.isInteger(SCENE.grass.back) && Number.isInteger(SCENE.grass.front));
}

section("a Numbers file is read, not refused");
{
  /*
   * These fixtures are built by `scripts/lib/numbers-fixture.mjs`, which writes
   * the format from the zip/Snappy/Protobuf specs rather than from the parser.
   * A fixture derived from the code under test proves only that the code agrees
   * with itself — a mistake this suite has made before.
   */
  const HEAD = ["Work Item ID", "Title", "Severity", "Created Date"];
  const raised = new Date(Date.UTC(2026, 7, 1));
  const book = numbersBundle([HEAD, ["10432", "Statement PDF fails", "Critical", raised]]);
  const [sheet] = readNumbers(new Uint8Array(book));

  check("a Numbers bundle yields a table", !!sheet);
  check("its name comes back", sheet?.name === "Table 1", sheet?.name);
  check("the header row is row 1", JSON.stringify(sheet?.rows[0]) === JSON.stringify(HEAD));
  check("text cells resolve through the string pool", sheet?.rows[1][1] === "Statement PDF fails");
  check("a repeated value is not confused for another", sheet?.rows[1][2] === "Critical");

  // Numbers counts seconds from 2001, so a Unix-epoch reading would land 31
  // years early — close enough to look plausible on a chart and be wrong.
  check("dates decode against the 2001 epoch", sheet?.rows[1][3] instanceof Date && sheet.rows[1][3].getTime() === raised.getTime(),
    String(sheet?.rows[1][3]));

  // Numbers splits a table into tiles of 256 rows. Reading them out of order
  // would shuffle the board silently.
  const many = [HEAD.slice(0, 2), ...Array.from({ length: 400 }, (_, i) => [`${i}`, `Item ${i}`])];
  const [big] = readNumbers(new Uint8Array(numbersBundle(many)));
  check("a table spanning tiles keeps every row", big?.rows.length === 401, `=${big?.rows.length}`);
  check("rows keep their order across a tile boundary", big?.rows[256][1] === "Item 255" && big?.rows.at(-1)[1] === "Item 399");

  // Numbers pads a table to its full height; those cells are empty, not blank
  // strings, so the importer's "no title" rule can tell them apart.
  const [padded] = readNumbers(new Uint8Array(numbersBundle([HEAD.slice(0, 2), ["1", null]])));
  check("an empty cell is null, not an empty string", padded?.rows[1][1] === null);

  /*
   * The one refusal that matters. Older cell layouts differ in ways that still
   * decode into plausible-looking values, so an unrecognised version must yield
   * nothing — a wrong severity imported silently is worse than a file refused.
   */
  const old = readNumbers(new Uint8Array(numbersBundle([HEAD.slice(0, 2), ["1", LEGACY]])));
  check("an unknown cell layout yields nothing, not a guess", old[0]?.rows[1][1] === null);

  // A cell pointing at a string the table does not hold is missing data, and
  // must read as missing — an empty string would import as a real blank value.
  const dangling = readNumbers(new Uint8Array(numbersBundle([HEAD.slice(0, 2), ["1", stringCell(9999)]])));
  check("a cell citing a string that is not there is null", dangling[0]?.rows[1][1] === null);

  // Only the archive's type separates a tile from anything else the model
  // references in the same shape. The decoy sorts ahead of the real tile, so
  // reading it would push its row above the header.
  const decoyed = readNumbers(new Uint8Array(numbersBundle([HEAD.slice(0, 2), ["1", "Real"]], { decoy: "DECOY" })));
  check("an object that is not a tile is not read as one", decoyed[0]?.rows[0][0] === "Work Item ID", JSON.stringify(decoyed[0]?.rows[0]));
  check("...and no decoy row survives", !JSON.stringify(decoyed[0]?.rows ?? []).includes("DECOY"));

  // Guards. A bad file must come back empty so the caller can advise CSV; it
  // must never throw a 500 out of the upload route.
  for (const [label, bytes] of [
    ["an empty file", new Uint8Array(0)],
    ["a truncated zip", new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0, 0])],
    ["plain text", new TextEncoder().encode("Title,Assignee\n1,A")],
    ["a zip with no IWA files", new Uint8Array(zip({ "Data/preview.jpg": Buffer.alloc(64) }))],
    ["a bundle whose IWA is rubbish", new Uint8Array(zip({ "Index/Document.iwa": Buffer.alloc(300, 0x41) }))],
  ]) {
    let threw = false;
    let out = null;
    try { out = readNumbers(bytes); } catch { threw = true; }
    check(`${label} cannot throw`, !threw);
    check(`${label} yields no tables`, Array.isArray(out) && out.length === 0);
  }

  /*
   * The bug that made a real file unreadable: a `.numbers` bundle leads with
   * several hundred kilobytes of preview artwork, so `Index/` sits far past any
   * sane head-read and the file was typed "unknown". The central directory at
   * the tail names every entry, which is exactly the question being asked.
   */
  const buried = new Uint8Array(numbersBundle([HEAD.slice(0, 2), ["1", "Buried"]], {
    lead: { "Data/PresetImageFill0.jpg": Buffer.alloc(200_000, 0x37) },
  }));
  check("a bundle behind 200 KB of artwork is still a Numbers file", detectSheet(buried, "board.numbers") === "numbers");
  check("...and it still reads", readNumbers(buried)[0]?.rows[1][1] === "Buried");
  check("...even with the extension stripped", detectSheet(buried, "board") === "numbers");

  // The route has to actually use it, and fall back to advice when it cannot.
  const route = readFileSync(new URL("../src/app/api/upload/route.ts", import.meta.url), "utf8");
  check("the upload route reads Numbers files", route.includes("readNumbers(new Uint8Array(bytes))"));
  check("Numbers is no longer refused outright", /kind !== "numbers"/.test(route));
  check("an unreadable bundle still points at CSV", /could not be read as a Numbers file[\s\S]{0,120}Export To/.test(route));
  check("the picker offers .numbers", UPLOAD.accept.includes(".numbers"));
}

section("the report downloads as CSV too");
{
  const route = readFileSync(new URL("../src/app/api/export/route.ts", import.meta.url), "utf8");
  const topbar = readFileSync(new URL("../src/components/topbar.tsx", import.meta.url), "utf8");

  // Not everybody has Excel, and CSV is the format nothing can refuse.
  check("CSV is an option", route.includes('searchParams.get("format") === "csv"'));
  check("it writes a real CSV", route.includes("workbook.csv.writeBuffer()"));
  check("it is served as CSV", route.includes('"text/csv; charset=utf-8"'));
  check("the extension follows the format", route.includes('wantsCsv ? "csv" : "xlsx"'));
  check("xlsx is still the default", route.includes("workbook.xlsx.writeBuffer()"));

  check("the menu offers a CSV download", topbar.includes('label="Download as CSV"'));
  check("it asks for the csv format", topbar.includes('format: "csv"'));
  check("it carries the same filters", topbar.includes("...baseQuery, format:"));
  check("the upload hint mentions CSV", topbar.includes("Excel or CSV"));
}

section("the data is found whichever tab it is on");
{
  const data = { name: "Work items", headers: ["Work Item ID", "Title", "Assignee"] };
  const notes = { name: "Notes", headers: ["Exported from the tracker"] };
  const blank = { name: "Sheet1", headers: [] };

  // Taking `worksheets[0]` failed on workbooks whose data sits one tab over —
  // a Notes sheet in front of it, a chart sheet, or a cover page from whatever
  // exported it.
  check("a single data sheet is found", pickDataSheet([data])?.index === 0);
  check("a cover tab is skipped", pickDataSheet([notes, data])?.index === 1);
  check("an empty tab is skipped", pickDataSheet([blank, data])?.index === 1);
  check("several dead tabs are skipped", pickDataSheet([notes, blank, blank, data])?.index === 3);
  check("the chosen tab is named", pickDataSheet([notes, data])?.name === "Work items");
  check("the first data sheet wins", pickDataSheet([data, { ...data, name: "Copy" }])?.name === "Work items");

  // Title is the one column the importer cannot do without, so "can I read
  // this tab" and "is this the tab" are the same question.
  check("a sheet without a title column is not the one", pickDataSheet([notes]) === null);
  check("no sheets at all yields nothing", pickDataSheet([]) === null);
  check("the columns come back with it", pickDataSheet([data])?.columns && Object.values(pickDataSheet([data]).columns).includes("title"));
  check("a header alias still counts", pickDataSheet([{ name: "s", headers: ["Summary"] }])?.index === 0);

  // Guards — a malformed workbook must not throw mid-upload.
  for (const [label, bad] of [["null", null], ["undefined", undefined], ["a string", "nope"]]) {
    check(`a ${label} sheet list cannot throw`, pickDataSheet(bad) === null);
  }
  check("a sheet with no headers array cannot throw", pickDataSheet([{ name: "x" }]) === null);
  check("hostile sheet entries cannot throw", pickDataSheet([null, undefined, data])?.index === 2);

  const route = ["route.ts", "sheets.ts"].map((f) => readFileSync(new URL(`../src/app/api/upload/${f}`, import.meta.url), "utf8")).join("\n");
  check("the route reads every tab", /workbook\.worksheets\.map\(/.test(route));
  check("it no longer takes the first tab blindly", !/const sheet = workbook\.worksheets\[0\]/.test(route));
  check("it picks the data sheet", /pickDataSheet\(headers\)/.test(route));
  check("it reports which tab it used", route.includes("sheet: picked.name"));
  check("ignored headers come from that tab", route.includes("headers[picked.index].headers"));

  // "That workbook has no sheets" was a dead end. The way out is the format
  // nothing can get wrong.
  check("an empty workbook is explained", route.includes("contained no readable sheets"));
  check("it points at CSV", /Export it as CSV instead/.test(route));
  check("the old dead-end message is gone", !route.includes("That workbook has no sheets"));

  // When no tab has a Title, say what was on each one — the reader can then
  // see whether the headers are wrong or the header row is not row 1.
  check("every tab is listed when none matches", /\$\{sheet\.name\}: \$\{sheet\.headers\.filter\(Boolean\)\.join\(", "\) \|\| "\(empty\)"\}/.test(route));
  check("it says row 1 must be the header", /Row 1 must be the header row/.test(route));
}

section("tooltips explain the bars, and cannot be clipped");
{
  const ui = uiSource();

  /*
   * The browser's own `title=` attribute was the previous answer everywhere.
   * It looks like nothing else in the product, waits about a second, cannot be
   * styled, and never appears on a touch screen at all.
   */
  check("a tooltip component exists", /export function Tooltip\(/.test(ui));

  /*
   * Every panel is `overflow: hidden` so its glass edge stays crisp, which
   * clips whatever a child draws outside its box — a tooltip on the top row of
   * a chart would be sliced in half. A portal to `document.body` is the only
   * thing an ancestor cannot clip.
   */
  check("it escapes the panel through a portal", ui.includes("createPortal("));
  check("...into the document body", /createPortal\([\s\S]*?document\.body,/.test(ui));
  check("it is positioned fixed, not absolute", /className="pointer-events-none fixed/.test(ui));
  check("it never eats the pointer", /pointer-events-none/.test(ui));

  // Off-screen is the same failure as clipped: the reader cannot read it.
  check("it is pulled back inside the viewport", /Math\.max\(margin, Math\.min\(x, viewportW - self\.width - margin\)\)/.test(ui));
  check("it flips below when the top is in the way", /const below = target\.top - self\.height - gap < margin/.test(ui));
  check("it measures before paint", /useLayoutEffect\(\(\) => \{\s*\n\s*if \(!at\) return;/.test(ui));
  check("the placement loop converges", /Only re-render on a real move/.test(ui));

  // Keyboard and pointer both, or the information is mouse-only.
  check("it opens on focus", ui.includes("onFocusCapture={open}"));
  check("it closes on blur", ui.includes("onBlurCapture={close}"));
  check("escape dismisses it", /e\.key === "Escape" && setAt\(null\)/.test(ui));
  check("it is announced as a tooltip", /role="tooltip"/.test(ui));
  check("a scroll dismisses rather than chases", /window\.addEventListener\("scroll", dismiss, true\)/.test(ui));
  check("touch does not trigger a hover-only surface", /e\.pointerType !== "touch"/.test(ui));
  check("reduced motion skips the entrance", /initial=\{reduced \? false :/.test(ui));
  check("an empty label renders nothing extra", /if \(!label\) return <>\{children\}<\/>;/.test(ui));

  /*
   * Every chart that carries a bar or a point explains it. A number with no
   * denominator and no unit is the thing readers ask about first.
   */
  /** Every file making up one visual surface, so a split does not hide a rule. */
  const filesFor = (stem) =>
    readdirSync(new URL("../src/components/", import.meta.url))
      .filter((f) => f === `${stem}.tsx` || f.startsWith(`${stem}-`))
      .sort()
      .map((f) => readFileSync(new URL(`../src/components/${f}`, import.meta.url), "utf8"))
      .join("\n");

  const surfaces = {
    "breakdown-card.tsx": /<Tooltip label=\{`\$\{row\.key\} — \$\{row\.count\} of \$\{total\}/,
    "ageing-spine.tsx": /<Tooltip key=\{b\.key\} label=\{`\$\{b\.count\} open item/,
    "leaderboard.tsx": /<Tooltip key=\{seg\.key\} label=\{`\$\{seg\.count\} open · \$\{seg\.key\}/,
    "stat-rail.tsx": /<Tooltip key=\{tile\.label\} label=\{`\$\{tile\.label\}: \$\{tile\.note\}/,
    "team-rollup.tsx": /<Tooltip label=\{label\}>/,
  };
  for (const [file, pattern] of Object.entries(surfaces)) {
    const src = filesFor(file.replace(/\.tsx$/, ""));
    check(`${file} explains its marks`, pattern.test(src));
    check(`${file} imports the tooltip`, /import \{[^}]*Tooltip[^}]*\} from "\.\/ui"/.test(src));
  }

  /*
   * The slow native tooltip is gone from every data surface. Panel titles are a
   * different `title` — a prop, not an attribute — so this only looks for the
   * JSX attribute form on an element.
   */
  for (const file of ["breakdown-card.tsx", "health-ring.tsx", "leaderboard.tsx", "stat-rail.tsx", "team-rollup.tsx", "trend-chart.tsx"]) {
    const src = filesFor(file.replace(/\.tsx$/, ""));
    const native = [...src.matchAll(/^\s+title=\{`/gm)].length;
    check(`${file} uses no native title tooltips`, native === 0, `${native} left`);
  }

  /*
   * The trend chart is the exception: its points have no element to wrap, so it
   * draws its own readout at a computed x inside its own box. The crosshair
   * existed already and said nothing — a reader could see Tuesday was higher
   * than Monday without learning by how much.
   */
  const trend = filesFor("trend");
  check("the trend crosshair carries a readout", /role="tooltip"[\s\S]*?fmtDay\(point\.date\)/.test(trend));
  check("...and the chart actually renders it", /<TrendReadout/.test(trend));
  check("it names both series", /\{point\.raised\}<\/span> raised/.test(trend) && /\{point\.closed\}<\/span> closed/.test(trend));
  check("it carries a colour swatch per series", /background: TREND_COLOR\.raised/.test(trend) && /background: TREND_COLOR\.closed/.test(trend));
  check("it flips before it leaves the chart", /flip=\{hover > points\.length \/ 2\}/.test(trend) && /left: flip \? undefined : x \+ 12/.test(trend));
  check("it does not eat the hit targets", /pointer-events-none absolute z-20/.test(trend));
  check("it says what a click does", /Click to list what was raised/.test(trend));
}

section("the greeting is three files, each with one job");
{
  /*
   * One 880-line file held the card, the world it looks out on, and every
   * animal in it. A reader looking for the grass scrolled past a cat's leg
   * joints to find it. Splitting it is the change; these keep it split.
   */
  const card = readFileSync(new URL("../src/components/greeting.tsx", import.meta.url), "utf8");
  const scene = greetingSource();
  const cast = greetingSource();

  /*
   * Every module, not just the greeting's. Two hundred lines is roughly where a
   * file stops being one thing a reader can hold in their head — past it, they
   * are scrolling to remember what they were looking at.
   */
  {
    /*
     * Two hundred lines is roughly where a file stops being one thing a reader
     * can hold in their head. Past it they are scrolling to remember what they
     * were looking at.
     *
     * The list below is **debt, not permission**. Each entry is a screen that
     * genuinely resists splitting — the parts share so much state that pulling
     * one out means threading eight props, which trades a long file for a
     * confusing one. They are named so the number can only go down: a new file
     * over the limit fails, and a listed file that grows past its recorded size
     * fails too.
     */
    const ALLOWED = {
      "topbar.tsx": 287,
      "greeting.tsx": 292,
      "trend-chart.tsx": 284,
      "dashboard-client.tsx": 273,
      "people-panel.tsx": 252,
      "admin-client.tsx": 272,
      "drill-drawer.tsx": 228,
      "search-box.tsx": 223,
      "leaderboard.tsx": 222,
    };

    const walk = (dir) =>
      readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
        e.isDirectory()
          ? walk(new URL(`${e.name}/`, dir))
          : /\.tsx?$/.test(e.name)
            ? [[e.name, readFileSync(new URL(e.name, dir), "utf8").split("\n").length]]
            : [],
      );

    const measured = walk(new URL("../src/", import.meta.url));

    const unlisted = measured.filter(([f, n]) => n > 200 && !(f in ALLOWED));
    check("no new module runs past 200 lines", unlisted.length === 0, unlisted.map(([f, n]) => `${f}:${n}`).join(", "));

    // A listed file may shrink. It may not grow.
    const grown = measured.filter(([f, n]) => f in ALLOWED && n > ALLOWED[f]);
    check("the long files are not getting longer", grown.length === 0, grown.map(([f, n]) => `${f}:${n} > ${ALLOWED[f]}`).join(", "));

    // And once one is split, it comes off the list rather than lingering.
    const stale = Object.keys(ALLOWED).filter((f) => !measured.some(([g, n]) => g === f && n > 200));
    check("the debt list has no stale entries", stale.length === 0, stale.join(", "));
  }

  // Each file owns its subject outright, or the split bought nothing.
  for (const who of ["Bat", "Crane", "Squirrel", "Cat"]) {
    check(`${who} lives with the cast`, new RegExp(`export function ${who}\\(`).test(cast));
    check(`${who} is not still in the card`, !new RegExp(`^function ${who}\\(`, "m").test(card));
  }
  for (const what of ["Meadow", "Cloud", "Sun", "Moon"]) {
    check(`${what} lives with the scene`, new RegExp(`export function ${what}\\(`).test(scene));
    check(`${what} is not still in the card`, !new RegExp(`^function ${what}\\(`, "m").test(card));
  }

  // The card composes them; it does not redefine them.
  check("the card imports its cast", /import \{ Bat, Cat, Crane, Gull, Squirrel \} from "\.\/greeting-cast"/.test(card));
  check("the card imports its scene", /from "\.\/greeting-scene"/.test(card));
  check("who appears when is declared once", /export const CAST: Record<Phase,/.test(greetingSource()));

  // Neither half reaches for data. The scene is drawn, never measured.
  for (const [name, src] of [["the scene", scene], ["the cast", cast]]) {
    check(`${name} fetches nothing`, !/fetch\(|useSWR|\/api\//.test(src));
  }
  {
    const castOnly = readdirSync(new URL("../src/components/", import.meta.url))
      .filter((f) => f.startsWith("greeting-cast"))
      .map((f) => readFileSync(new URL(`../src/components/${f}`, import.meta.url), "utf8"))
      .join("\n");
    check("the cast holds no scene geometry", !/meadowBands|bandPath|tufts\(/.test(castOnly));
  }

  // Both halves are client components, or the animations never run.
  for (const [name, src] of [["the scene", scene], ["the cast", cast]]) {
    check(`${name} is a client component`, src.startsWith('"use client";'));
  }
}

section("passwords can be changed, and only by the right person");
{
  const ok = (draft) => validatePasswordChange(draft) === null;

  // The happy path, and each rule that guards it.
  check("a good change is accepted", ok({ current: "old-one-here", next: "newPassword1", confirm: "newPassword1" }));
  check("the current password is required", /current password/i.test(validatePasswordChange({ next: "newPassword1", confirm: "newPassword1" }) ?? ""));
  check("a new password is required", /new password/i.test(validatePasswordChange({ current: "old-one-here" }) ?? ""));
  check("the new password must be long enough", validatePasswordChange({ current: "old-one-here", next: "short", confirm: "short" }) !== null);
  check("exactly the minimum is enough", ok({ current: "old-one-here", next: "x".repeat(MIN_PASSWORD), confirm: "x".repeat(MIN_PASSWORD) }));
  check("one under the minimum is not", validatePasswordChange({ current: "o".repeat(12), next: "x".repeat(MIN_PASSWORD - 1), confirm: "x".repeat(MIN_PASSWORD - 1) }) !== null);
  check("the two new passwords must match", /do not match/i.test(validatePasswordChange({ current: "old-one-here", next: "newPassword1", confirm: "newPassword2" }) ?? ""));

  /*
   * Reusing the current password is refused before the mismatch is mentioned:
   * being told to retype a password that was never going to be accepted is the
   * wrong thing to hear first.
   */
  check("reusing the current password is refused", /same as the current/i.test(validatePasswordChange({ current: "sameOne12345", next: "sameOne12345", confirm: "sameOne12345" }) ?? ""));
  check("...and that is said before any mismatch", /same as the current/i.test(validatePasswordChange({ current: "sameOne12345", next: "sameOne12345", confirm: "different999" }) ?? ""));

  // An unbounded password is an unbounded bcrypt, triggered by a form field.
  check("an absurd password is refused", validatePasswordChange({ current: "old-one-here", next: "x".repeat(LIMITS.password + 1), confirm: "x".repeat(LIMITS.password + 1) }) !== null);
  check("a long but sane passphrase is fine", ok({ current: "old-one-here", next: "correct horse battery staple", confirm: "correct horse battery staple" }));

  // Guards. None of these may throw on the way to a message.
  for (const [label, bad] of [["null", null], ["undefined", undefined], ["an empty object", {}]]) {
    check(`${label} yields a message, not a crash`, typeof validatePasswordChange(bad) === "string");
  }

  /* ------------------------------------------------------ the admin reset -- */

  const reset = (draft) => validatePasswordReset(draft);
  check("an admin reset needs no current password", reset({ email: "a@b.com", next: "newPassword1" }) === null);
  check("it still needs a long enough one", reset({ email: "a@b.com", next: "short" }) !== null);
  check("it needs to know whose", /whose password/i.test(reset({ next: "newPassword1" }) ?? ""));
  check("a non-email is refused", reset({ email: "not-an-email", next: "newPassword1" }) !== null);
  check("an absurd password is refused here too", reset({ email: "a@b.com", next: "x".repeat(LIMITS.password + 1) }) !== null);
  for (const [label, bad] of [["null", null], ["undefined", undefined], ["an empty object", {}]]) {
    check(`a ${label} reset yields a message`, typeof reset(bad) === "string");
  }

  /* ------------------------------------------------------------ the routes -- */

  const self = readFileSync(new URL("../src/app/api/account/password/route.ts", import.meta.url), "utf8");
  const byAdmin = readFileSync(new URL("../src/app/api/users/password/route.ts", import.meta.url), "utf8");
  const users = readFileSync(new URL("../src/lib/users.ts", import.meta.url), "utf8");

  /*
   * The three properties that make the self-service route safe. Each is a way
   * the route could be written that compiles, runs, and is an account takeover.
   */
  check("the self route verifies the current password", /verifyPassword\(session\.email, current\)/.test(self));
  check("a wrong current password is a 403", /not your current password[\s\S]{0,60}status: 403/.test(self));
  check("the account comes from the session, never the body", /getUser\(session\.email\)/.test(self) && !/body\??\.email/.test(self));
  check("it writes only the hash", self.includes("setPassword(") && !self.includes("saveUser("));

  // The admin route is the mirror image: no current password, admin-only.
  check("the admin route requires an admin", /requireAdmin\(\)/.test(byAdmin));
  check("...and does so before reading the body", byAdmin.indexOf("requireAdmin()") < byAdmin.indexOf("req.json()"));
  check("the admin route also writes only the hash", byAdmin.includes("setPassword(") && !byAdmin.includes("saveUser("));

  /*
   * `setPassword` exists precisely so neither route goes through `saveUser`,
   * which would happily rewrite the role and POD list from the same body — a
   * member changing their own password must not be able to smuggle a role.
   */
  check("setPassword touches nothing but the hash", /passwordHash: await bcrypt\.hash\(password, 10\)/.test(users));
  check("...spreading the stored user, not the input", /putDoc\(IDX\.users, id, \{\s*\.\.\.user,/.test(users));
  check("...and stamping when it changed", /passwordChangedAt: new Date\(\)\.toISOString\(\)/.test(users));

  // An SSO account has no local password; creating one is a second way in.
  check("the self route refuses SSO accounts", /user\.passwordHash[\s\S]{0,200}single sign-on/.test(self));
  check("the admin route refuses them too", /user\.passwordHash[\s\S]{0,200}single sign-on/.test(byAdmin));

  // With auth off there are no accounts, so there is nothing to change.
  check("both routes refuse when auth is off", /AUTH_MODE === "off"/.test(self) && /AUTH_MODE === "off"/.test(byAdmin));

  // Neither route hands back anything about the account.
  check("the self route returns nothing but ok", /return Response\.json\(\{ ok: true \}\)/.test(self));

  /* ----------------------------------------------------------------- the UI -- */

  const dialog = readFileSync(new URL("../src/components/change-password.tsx", import.meta.url), "utf8");
  const bar = readFileSync(new URL("../src/components/topbar.tsx", import.meta.url), "utf8");
  const admin = adminSource();

  check("the menu offers it", /label="Change password"/.test(bar));
  check("only when there are passwords to change", /authEnabled && \(\s*<MenuItem/.test(bar));
  check("the dialog is mounted", /<ChangePassword open=\{changingPassword\}/.test(bar));

  check("the dialog asks for the current password", /label="Current password"/.test(dialog));
  check("it asks the new one twice", (dialog.match(/autoComplete="new-password"/g) ?? []).length === 2);
  check("the confirmation is never sent", /JSON\.stringify\(\{ current, next \}\)/.test(dialog));
  check("fields are cleared on open", /setCurrent\(""\);\s*\n\s*setNext\(""\);/.test(dialog));
  // The trap is its own hook now — the rule is that the dialog uses one.
  const trap = readFileSync(new URL("../src/components/use-focus-trap.ts", import.meta.url), "utf8");
  check("focus is trapped while it is open", /e\.key !== "Tab"/.test(trap) && /useFocusTrap\(open, panel, onClose\)/.test(dialog));
  check("escape closes it", /e\.key === "Escape"/.test(trap));
  check("it is a real dialog", /role="dialog"/.test(dialog) && /aria-modal="true"/.test(dialog));

  // The admin's reset is offered only where it can work.
  check("admin can reset a password", /resetPassword\(user\.email\)/.test(admin));
  check("...only for accounts that have one", /user\.hasPassword && \(/.test(admin));
  check("one row is open at a time", /setResetting\(resetting === user\.email \? null : user\.email\)/.test(admin));
  check("the admin is told nobody is notified", /not notified/i.test(admin));
}

section("the signing secret cannot be a public constant");
{
  const prod = (raw) => resolveAuthSecret(raw, true);
  const dev = (raw) => resolveAuthSecret(raw, false);
  const REAL = "Yk8vQm4wZ3JlYWxzZWNyZXRoZXJlMTIzNDU2Nzg5MA==";

  /*
   * This was `process.env.AUTH_SECRET || "dev-only-insecure-secret"`, and it is
   * the worst bug this codebase has had — precisely because nothing looked
   * broken. Sign-in worked. Every check passed. And a deployment that forgot
   * the variable signed its tokens with a string committed to the repo, so
   * anybody who could read the source could forge `role: "admin"`.
   */
  check("a real secret is accepted in production", prod(REAL).ok === true);
  check("...and used verbatim", prod(REAL).secret === REAL);
  check("...without claiming to be generated", prod(REAL).generated === false);

  // Fail closed. Refusing to boot is loud and cheap; booting forgeable is silent
  // and total.
  check("production refuses to start with no secret", prod(undefined).ok === false);
  check("...and says how to make one", /openssl rand -base64 32/.test(prod(undefined).reason ?? ""));
  check("...and says what the risk was", /forge/i.test(prod(undefined).reason ?? ""));
  check("an empty secret is the same as none", prod("").ok === false);
  check("whitespace is not a secret", prod("   ").ok === false);

  /*
   * The placeholder case is the likely one: `.env.example` ships a value, and
   * copying that file without editing it leaves a secret that is "set" and
   * publicly known.
   */
  check("the shipped placeholder is refused", prod("change-me-openssl-rand-base64-32").ok === false);
  check("the old hardcoded fallback is refused", prod("dev-only-insecure-secret").ok === false);
  check("...as are the obvious ones", ["changeme", "secret", "please-change-me"].every((p) => prod(p).ok === false));
  check("the placeholder message names the value", /placeholder/i.test(prod("changeme").reason ?? ""));

  // Short is weak; weak is the link an attacker picks.
  check("a short secret is refused in production", prod("abc123").ok === false);
  check(`${MIN_SECRET_LENGTH} characters is the floor`, prod("x".repeat(MIN_SECRET_LENGTH)).ok === true);
  check("one under it is refused", prod("x".repeat(MIN_SECRET_LENGTH - 1)).ok === false);

  /*
   * Development must stay frictionless, so a missing secret generates one —
   * but a *random* one, per process, never a constant that could follow the
   * code into production.
   */
  check("development generates one instead", dev(undefined).ok === true);
  check("...and says that it did", dev(undefined).generated === true);
  check("...and it is long enough to be real", (dev(undefined).secret ?? "").length >= MIN_SECRET_LENGTH);
  check("two boots do not share a generated secret", dev(undefined).secret !== dev(undefined).secret);
  check("a placeholder in development is replaced, not used", dev("changeme").secret !== "changeme" && dev("changeme").generated === true);
  check("a real secret in development is respected", dev(REAL).secret === REAL);

  // The wiring: the resolved verdict must actually be what NextAuth signs with.
  const auth = readFileSync(new URL("../src/auth.ts", import.meta.url), "utf8");
  check("auth.ts resolves the secret", /resolveAuthSecret\(process\.env\.AUTH_SECRET, isProduction\)/.test(auth));
  check("a bad verdict stops the process", /if \(!verdict\.ok\) throw new Error/.test(auth));
  check("the resolved secret is the one used", /secret: verdict\.secret/.test(auth));
  check("no hardcoded fallback survives", !/AUTH_SECRET \|\|/.test(auth) && !auth.includes("dev-only-insecure-secret"));
}

section("sessions expire, and stop when they should");
{
  const now = 1_700_000_000_000;
  const hour = 3_600_000;
  const live = (over = {}) => ({ signedInAt: now - hour, passwordAt: now - 10 * hour, ...over });

  check("a fresh session is valid", checkSession(live(), true, null, now).valid === true);

  /*
   * Two clocks, because one is not enough. The idle clock is renewed by
   * activity, so a stolen token that is *used* never expires under it — which
   * is exactly the token you most want to expire.
   */
  check("a session past the absolute limit is over", checkSession({ signedInAt: now - (SESSION.absoluteSeconds + 1) * 1000 }, true, null, now).valid === false);
  check("...and says why", checkSession({ signedInAt: now - (SESSION.absoluteSeconds + 1) * 1000 }, true, null, now).reason === "expired-absolute");
  check("one second inside the limit still stands", checkSession({ signedInAt: now - (SESSION.absoluteSeconds - 1) * 1000 }, true, null, now).valid === true);
  check("the absolute limit is longer than the idle one", SESSION.absoluteSeconds > SESSION.idleSeconds);
  check("a session refreshes more often than it idles out", SESSION.refreshSeconds < SESSION.idleSeconds);

  /*
   * Changing a password because it leaked has to end the intruder's session.
   * A token issued before the change belongs to whoever knew the old password.
   */
  const changedAt = new Date(now - 5 * hour).toISOString();
  check("a token older than the password change is refused", checkSession({ signedInAt: now - 10 * hour, passwordAt: now - 10 * hour }, true, changedAt, now).valid === false);
  check("...and says why", checkSession({ signedInAt: now - 10 * hour, passwordAt: now - 10 * hour }, true, changedAt, now).reason === "password-changed");
  check("a token issued after it is fine", checkSession({ signedInAt: now - hour, passwordAt: now - 4 * hour }, true, changedAt, now).valid === true);
  check("a token with no password stamp is refused when one exists", checkSession({ signedInAt: now - hour }, true, changedAt, now).valid === false);
  check("no stamp and no change is fine", checkSession({ signedInAt: now - hour }, true, null, now).valid === true);

  // A deleted account keeps no session — 403s everywhere with a signed-in shell
  // is a confusing way to learn your account is gone.
  check("a deleted account ends the session", checkSession(live(), false, null, now).valid === false);
  check("...and says why", checkSession(live(), false, null, now).reason === "no-account");

  // Guards. A malformed token is not a trusted one.
  check("a token with no sign-in time is refused", checkSession({}, true, null, now).reason === "malformed", checkSession({}, true, null, now).reason);
  check("a token stamped in the future is refused", checkSession({ signedInAt: now + 10 * hour }, true, null, now).reason === "malformed");
  check("a small clock skew is tolerated", checkSession({ signedInAt: now + 30_000 }, true, null, now).valid === true);
  for (const [label, bad] of [["null", null], ["undefined", undefined], ["a string stamp", { signedInAt: "yesterday" }], ["NaN", { signedInAt: NaN }]]) {
    check(`${label} is refused rather than throwing`, checkSession(bad, true, null, now).reason === "malformed", String(checkSession(bad, true, null, now).reason));
  }
  check("an unparseable change date does not lock everybody out", checkSession(live(), true, "not-a-date", now).valid === true);

  check("the countdown never goes negative", secondsRemaining({ signedInAt: now - 99 * SESSION.absoluteSeconds * 1000 }, now) === 0);
  check("a malformed token has no time left", secondsRemaining(null, now) === 0);

  // The wiring.
  const auth = readFileSync(new URL("../src/auth.ts", import.meta.url), "utf8");
  check("the idle window is configured", /maxAge: SESSION\.idleSeconds/.test(auth));
  check("the refresh cadence is configured", /updateAge: SESSION\.refreshSeconds/.test(auth));
  check("the policy runs on every refresh", /checkSession\(token as TokenClaims/.test(auth));
  check("a failed check ends the session", /if \(!verdict\.valid\) return null;/.test(auth));
  check("the sign-in time is stamped once, at sign-in", /trigger === "signIn"[\s\S]{0,120}signedInAt = Date\.now\(\)/.test(auth));
}

section("the session cookie keeps the token away from JavaScript");
{
  const dev = authCookies(false);
  const prod = authCookies(true);

  /*
   * These flags are the difference between "an XSS bug is a bug" and "an XSS
   * bug is every account". NextAuth's defaults are already these values; they
   * are stated explicitly so they can be checked rather than inherited.
   */
  check("the token is httpOnly", prod.sessionToken.options.httpOnly === true);
  check("...in development too", dev.sessionToken.options.httpOnly === true);
  check("it is SameSite=Lax, which blocks cross-site POSTs", prod.sessionToken.options.sameSite === "lax");
  check("it is secure in production", prod.sessionToken.options.secure === true);
  check("...and not in development, where there is no https", dev.sessionToken.options.secure === false);
  check("it is scoped to the whole app", prod.sessionToken.options.path === "/");
  check("its lifetime matches the idle window", prod.sessionToken.options.maxAge === SESSION.idleSeconds);

  /*
   * `__Secure-` makes the browser refuse the cookie unless it is set over
   * https, so a plain-http origin cannot overwrite the session. `__Host-` is
   * stricter still — same origin, no domain — and is right for the CSRF token.
   */
  check("production prefixes the session cookie", prod.sessionToken.name.startsWith("__Secure-"));
  check("...and the CSRF cookie more strictly", prod.csrfToken.name.startsWith("__Host-"));
  check("development uses no prefix, since there is no https", !dev.sessionToken.name.startsWith("__"));

  // Every cookie, not just the session one.
  for (const [name, cookie] of Object.entries(prod)) {
    check(`${name} is httpOnly`, cookie.options.httpOnly === true);
    check(`${name} is secure in production`, cookie.options.secure === true);
    check(`${name} is SameSite=Lax at least`, cookie.options.sameSite === "lax");
  }

  // Strict would break the redirect back from Entra, landing SSO in a loop.
  check("SameSite is lax, not strict, so SSO can return", prod.sessionToken.options.sameSite !== "strict");

  const auth = readFileSync(new URL("../src/auth.ts", import.meta.url), "utf8");
  check("auth.ts applies them", /cookies: authCookies\(isProduction\)/.test(auth));
}

section("password guessing is slowed down");
{
  resetThrottle();
  const who = "target@example.com";

  check("a fresh account is not locked", lockedFor(who) === 0);

  // bcrypt already costs ~100ms a guess. That is a bad rate, not no rate.
  let locked = 0;
  for (let i = 0; i < LOGIN.maxAttempts; i++) locked = recordFailure(who);
  check("it locks at the configured attempt", locked === LOGIN.lockoutSeconds, `${locked}s`);
  check("...and reports the time left", lockedFor(who) > 0);
  check("...which is at most the lockout", lockedFor(who) <= LOGIN.lockoutSeconds);

  // The lock is per account: one attacker must not lock out the whole company.
  check("another account is unaffected", lockedFor("someone-else@example.com") === 0);

  resetThrottle();
  // One short of the limit is not a lockout — a few typos must not lock a real
  // person out of their own dashboard.
  for (let i = 0; i < LOGIN.maxAttempts - 1; i++) recordFailure(who);
  check("one attempt short does not lock", lockedFor(who) === 0);
  check("a correct password clears the count", (recordSuccess(who), lockedFor(who) === 0));
  recordFailure(who);
  check("...and the next failure starts over", lockedFor(who) === 0);

  resetThrottle();
  // A quiet spell forgets, so this morning's typo does not combine with this
  // afternoon's into a lockout.
  const start = Date.now();
  for (let i = 0; i < LOGIN.maxAttempts - 1; i++) recordFailure(who, start);
  check("a stale count is forgotten", recordFailure(who, start + (LOGIN.windowSeconds + 1) * 1000) === 0);

  resetThrottle();
  check("a lockout expires on its own", lockedFor(who, Date.now() + (LOGIN.lockoutSeconds + 1) * 1000) === 0);
  check("a blank email is not tracked", recordFailure("") === 0 && lockedFor("") === 0);
  check("the email is matched case-insensitively", (resetThrottle(), Array.from({ length: LOGIN.maxAttempts }).forEach(() => recordFailure("Mixed@Case.com")), lockedFor("mixed@case.com") > 0));
  resetThrottle();

  // The settings have to be usable, not just present.
  check("the attempt limit leaves room for typos", LOGIN.maxAttempts >= 5 && LOGIN.maxAttempts <= 12, `${LOGIN.maxAttempts}`);
  check("the lockout is long enough to matter", LOGIN.lockoutSeconds >= 5 * 60, `${LOGIN.lockoutSeconds}s`);

  const auth = readFileSync(new URL("../src/auth.ts", import.meta.url), "utf8");
  {
    const lock = auth.indexOf("lockedFor(email)");
    const hash = auth.indexOf("verifyPassword(email, password)");
    check("the lock is checked at all", lock !== -1);
    check("...and before the hash, so a locked account costs nothing", lock !== -1 && hash !== -1 && lock < hash, `${lock} vs ${hash}`);
  }
  check("a failure is recorded", /recordFailure\(email\)/.test(auth));
  check("a success clears the count", /recordSuccess\(email\)/.test(auth));
}

section("it is deployable with nothing but environment variables");
{
  const config = readFileSync(new URL("../next.config.ts", import.meta.url), "utf8");
  const health = readFileSync(new URL("../src/app/api/health/route.ts", import.meta.url), "utf8");
  const users = readFileSync(new URL("../src/lib/users.ts", import.meta.url), "utf8");
  const auth = readFileSync(new URL("../src/auth.ts", import.meta.url), "utf8");
  const env = readFileSync(new URL("../.env.example", import.meta.url), "utf8");

  /*
   * A dashboard behind a login is exactly the sort of thing worth framing on
   * somebody else's page. Each of these closes a specific hole, and none is
   * decoration.
   */
  check("framing is denied", /X-Frame-Options[\s\S]{0,60}DENY/.test(config));
  check("MIME sniffing is off", /X-Content-Type-Options[\s\S]{0,60}nosniff/.test(config));
  check("referrers do not leak filters cross-origin", /Referrer-Policy[\s\S]{0,80}strict-origin/.test(config));
  check("HSTS is sent", /Strict-Transport-Security[\s\S]{0,80}max-age=\d/.test(config));
  // Preloading a host is close to irreversible, and is the operator's call.
  // Anchored to the header value, not the file: the comment above it explains
  // why preloading is the operator's call, and says the word.
  check("HSTS does not preload on the operator's behalf", !/max-age=[^"]*preload/.test(config));
  check("a CSP is set", /Content-Security-Policy/.test(config));
  check("...and it blocks framing too", /^\s+"frame-ancestors .none.",$/m.test(config));
  check("...and plugins", /^\s+"object-src .none.",$/m.test(config));
  check("...and only reaches the weather provider", /connect-src 'self' https:\/\/api\.open-meteo\.com/.test(config));
  check("the camera and microphone are refused", /camera=\(\)/.test(config));
  check("every route carries them", /source: "\/:path\*"/.test(config));

  /*
   * A container image that has to `pnpm install` at start is an image that can
   * fail at start. `standalone` bundles the server it needs.
   */
  check("the build is standalone, for a small image", /output: "standalone"/.test(config));

  /* ------------------------------------------------------- first run -- */

  /*
   * The whole claim being tested: add env vars, deploy, sign in. Without this
   * a fresh password-mode deployment has zero users and **nobody can sign in**,
   * because the seeder is a local convenience rather than something you run at
   * a production database.
   */
  check("the first admin comes from the environment", /export async function ensureFirstAdmin/.test(users));
  check("...only when nobody exists at all", /if \(\(await countUsers\(\)\) > 0\) return;/.test(users));
  check("...and only with both variables set", /if \(!email \|\| !password\) return;/.test(users));
  check("sign-in triggers it", /await ensureFirstAdmin\(\);/.test(auth));
  check("...before the password is checked", auth.indexOf("ensureFirstAdmin()") < auth.indexOf("verifyPassword(email, password)"));

  /* ---------------------------------------------------------- health -- */

  check("there is a health endpoint", /export async function GET/.test(health));
  check("liveness does no I/O", /if \(!new URL\(req\.url\)\.searchParams\.has\("ready"\)\)/.test(health));
  check("readiness pings the store", /os\(\)\.ping\(\)/.test(health));
  check("an unreachable store is 503, not 500", /status: "unavailable"[\s\S]{0,80}status: 503/.test(health));

  /*
   * The bug this was written for: a misconfigured AUTH_SECRET makes every real
   * page 500, but the health route did not import auth — so it answered 200 and
   * the orchestrator sent live traffic to an instance that could not serve a
   * single page. A health check that only proves *itself* healthy turns an
   * obvious outage into a silent one.
   */
  check("health fails when the app cannot serve", /resolveAuthSecret\(process\.env\.AUTH_SECRET/.test(health));
  check("...as a 503", /status: "misconfigured"[\s\S]{0,60}status: 503/.test(health));
  check("...without naming the variable to a stranger", /console\.error\(`\[health\] not serving/.test(health));
  check("health is never cached", (health.match(/no-store/g) ?? []).length >= 1);

  /* ------------------------------------------------------- the image -- */

  const docker = readFileSync(new URL("../Dockerfile", import.meta.url), "utf8");
  check("there is a Dockerfile", docker.length > 0);
  check("it builds in stages, so no compiler ships", (docker.match(/^FROM /gm) ?? []).length >= 3);
  check("it runs as a non-root user", /USER nextjs/.test(docker));
  check("it uses the standalone output", /\.next\/standalone/.test(docker));
  check("it has a healthcheck", /^HEALTHCHECK /m.test(docker));
  check("...pointed at readiness, not liveness", /health\?ready=1/.test(docker));
  check("the build-time secret is marked as unused at runtime", /not-used-at-runtime/.test(docker));

  const ignored = readFileSync(new URL("../.dockerignore", import.meta.url), "utf8");
  check("secrets are not copied into the image", /^\.env\*/m.test(ignored));
  check("...but the template is", /^!\.env\.example/m.test(ignored));

  /* ----------------------------------------------------- what to set -- */

  for (const key of [
    "OPENSEARCH_URL",
    "AUTH_MODE",
    "AUTH_SECRET",
    "AUTH_TRUST_HOST",
    "ADMIN_EMAIL",
    "ADMIN_PASSWORD",
    "AZDO_ORG_URL",
    "AZDO_PROJECT",
    "AZDO_PAT",
    "SYNC_POLL_SECONDS",
    "AZDO_WEBHOOK_TOKEN",
    "WEATHER_LAT",
  ]) {
    check(`${key} is in the template`, new RegExp(`^${key}=`, "m").test(env));
  }
  check("the template says which are required", /REQUIRED/.test(env));
  check("it says the app refuses to start without a secret", /REFUSES TO START/.test(env));
  check("it no longer claims the admin needs a seed run", !/run seed/.test(env));
  check("it does not tell anyone to use the other package manager", !/\bnpm run\b/.test(env));

  /*
   * An unset webhook token rejecting everything is the safe default, and the
   * template must not ship a value that looks set but is public.
   */
  check("the webhook token ships empty rather than shared", /^AZDO_WEBHOOK_TOKEN=$/m.test(env));

  /* --------------------------------------------------- error surfaces -- */

  const errorPage = readFileSync(new URL("../src/app/error.tsx", import.meta.url), "utf8");
  check("a render failure has a page", /export default function Error/.test(errorPage));
  // A thrown OpenSearch error carries the cluster URL and sometimes the query.
  check("it does not print the error to the reader", !/\{error\.message\}/.test(errorPage));
  check("...but does log it", /console\.error/.test(errorPage));
  check("it offers a way out", /onClick=\{reset\}/.test(errorPage));
  check("a missing page has one too", readFileSync(new URL("../src/app/not-found.tsx", import.meta.url), "utf8").includes("Nothing here"));
}


section("a board's own words resolve, without false positives");
{
  const team = {
    id: "t", name: "T",
    azure: { orgUrl: "", project: "", pat: "", areaPath: "", workItemTypes: [] },
    fieldMap: { severity: "S", environment: "E", status: "System.State" },
    valueMap: { severity: {}, environment: {}, status: {} },
    ageingThresholdDays: 7,
  };
  const item = (fields) =>
    fromAzure(
      { id: 1, fields: { "System.WorkItemType": "Bug", "System.Title": "t", "System.State": "New", "System.CreatedDate": "2026-01-01T00:00:00Z", ...fields } },
      team,
    );

  /*
   * The bug a real board found. `it` -> IT-UAT matched **inside** ordinary
   * words, so every item under an area path named
   * "…Investment Mall and microsites" was labelled IT-UAT. The substring pass
   * is word-bounded now.
   */
  const REAL_AREA = "3in1_Agile_Projects\\365_Bajaj AMC Learning center Investment Mall and microsites";
  check("a real area path guesses no environment", item({ "System.AreaPath": REAL_AREA }).environment === "Unknown", item({ "System.AreaPath": REAL_AREA }).environment);
  for (const word of ["microsites", "monitoring", "credit", "editor", "digital", "suite", "audit"]) {
    check(`"${word}" is not read as an environment`, item({ "System.AreaPath": word }).environment === "Unknown", item({ "System.AreaPath": word }).environment);
  }

  // ...while everything the pass exists for still resolves.
  for (const [value, want] of [
    ["Production", "Production"], ["Deployed to Prod", "Production"], ["live", "Production"],
    ["IT-UAT", "IT-UAT"], ["ituat", "IT-UAT"], ["BIZ-UAT", "BIZ-UAT"], ["UAT", "BIZ-UAT"],
    ["CUG(Stage)", "CUG"], ["Staging", "CUG"],
  ]) {
    check(`environment "${value}" -> ${want}`, item({ E: value }).environment === want, item({ E: value }).environment);
  }
  for (const [value, want] of [
    ["2 - Major", "Major"], ["1 - Critical", "Critical"], ["3 - Medium (UI)", "Minor"],
    ["4 - Low", "Minor"], ["Blocker", "Critical"], ["High", "Major"],
  ]) {
    check(`severity "${value}" -> ${want}`, item({ S: value }).severity === want, item({ S: value }).severity);
  }

  /*
   * Boards name whoever signs off differently. All of these mean the same thing
   * to this dashboard: fixed, waiting on somebody.
   */
  for (const [value, want] of [
    ["Active", "Open"], ["New", "Open"], ["Approved", "Open"], ["In Progress", "Open"],
    ["For PO Validation", "For QA Validation"], ["For QA Validation", "For QA Validation"],
    ["Fixed", "For QA Validation"], ["Resolved", "For QA Validation"],
    ["Closed", "Closed"], ["Done", "Closed"],
    ["Not a Bug", "Not a Bug"], ["Duplicate", "Not a Bug"], ["Cannot Reproduce", "Not a Bug"],
  ]) {
    check(`status "${value}" -> ${want}`, item({ "System.State": value }).status === want, item({ "System.State": value }).status);
  }

  /*
   * The same two-letter accident in the kind rule: `includes("cr")` made a task
   * tagged "critical" a change request.
   */
  const kindOfTagged = (type, tags) =>
    fromAzure({ id: 1, fields: { "System.WorkItemType": type, "System.Title": "t", "System.State": "New", "System.Tags": tags, "System.CreatedDate": "2026-01-01T00:00:00Z" } }, team).kind;
  check("a task tagged critical is not a change request", kindOfTagged("Task", "critical") === "ticket", kindOfTagged("Task", "critical"));
  check("...nor one tagged 'increment'", kindOfTagged("Task", "increment") === "ticket");
  check("...nor one tagged 'scrum'", kindOfTagged("Task", "scrum") === "ticket");
  // But a real CR tag still is one.
  check("a task tagged CR is a change request", kindOfTagged("Task", "CR") === "cr");
  check("...lower case too", kindOfTagged("Task", "cr") === "cr");
  check("...and 'Change Request'", kindOfTagged("Task", "Change Request") === "cr");
  check("a bug stays a bug whatever its tags", kindOfTagged("Bug", "CR; critical") === "bug");

  /*
   * A board with its own type names. The query matches them exactly, so these
   * only arrive if the POD lists them — but once here they must classify.
   */
  check("a custom task type is a ticket", kindOfTagged("3IN1 TASK", "AMC_POD") === "ticket");
  check("a custom story type is a ticket", kindOfTagged("3IN1 AGILE USER STORY", "") === "ticket");
  check("a custom bug type is still a bug", kindOfTagged("3IN1 BUG", "") === "bug");

  // Unassigned work is real work, not missing work.
  check("nobody assigned reads as Unassigned", item({}).assignee === "Unassigned");

  /* ------------------------------------------------- what Test reports -- */

  const azure = readFileSync(new URL("../src/lib/azure.ts", import.meta.url), "utf8");
  /*
   * The query matches type names exactly, so a board using "3IN1 TASK" matches
   * none of the shipped defaults, syncs only its bugs, and says nothing. Test
   * asks the project what it actually has.
   */
  check("Test asks for the project's work item types", /_apis\/wit\/workitemtypes/.test(azure));
  check("...ignores disabled ones", /!t\.isDisabled/.test(azure));
  check("...and failing to list them does not fail the test", /catch \{[\s\S]{0,200}connection is\s*\n?\s*\/\/ still good/.test(azure) || /types: string\[\] = \[\];/.test(azure));
  check(
    "Test reports types the project does not have",
    /const unmatched = types\.length\s*\n\s*\? configured\.filter\(\(t\) => !types\.some\(/.test(azure),
  );

  const adminSrc = adminSource();
  check("a missing type is called out loudly", /will not sync/.test(adminSrc));
  check("the real types stay on screen to copy from", /projectTypes/.test(adminSrc));
  check("...and are clickable", /workItemTypes: on/.test(adminSrc));
}


section("the change recipes still describe the code");
{
  const recipes = readFileSync(new URL("../docs/changing-the-data.md", import.meta.url), "utf8");

  /*
   * A recipe that names a function which has moved is worse than no recipe:
   * somebody follows it, cannot find the thing, and stops trusting the docs.
   * Every symbol the guide tells you to edit is checked to still exist.
   */
  const namedIn = (file) => readFileSync(new URL(`../src/${file}`, import.meta.url), "utf8");

  for (const [symbol, file] of [
    ["queryChangedIds", "lib/azure.ts"],
    ["fromAzure", "lib/normalize.ts"],
    ["fromRow", "lib/normalize.ts"],
    ["COLUMN_ALIASES", "lib/normalize/columns.ts"],
    ["EXPORT_COLUMNS", "lib/normalize/columns.ts"],
    ["DEFAULT_VALUE_MAP", "lib/value-map.ts"],
    ["TERMINAL_STATUSES", "lib/types.ts"],
    ["SEVERITIES", "lib/types.ts"],
    ["ENVIRONMENTS", "lib/types.ts"],
    ["STATUSES", "lib/types.ts"],
    ["filtersFromRequest", "lib/api.ts"],
    ["FIRST_RUN_DAYS", "lib/sync.ts"],
    ["SEVERITY_COLOR", "lib/palette.ts"],
    ["ENV_COLOR", "lib/palette.ts"],
    ["STATUS_COLOR", "lib/palette.ts"],
    ["AGEING_COLOR", "lib/palette.ts"],
  ]) {
    // The **declaration**, not any mention of the name: renaming a `const`
    // leaves its other references behind, and a plain `includes` finds those.
    const declares = new RegExp(`(const|function|type|interface|let)\\s+${symbol}\\b`);
    check(`the guide's ${symbol} is still declared in ${file}`, declares.test(namedIn(file)));
  }

  // Recipe 3 walks the Item type. If a field is added without the guide being
  // read, that is fine — but the fields it names must exist.
  const types = namedIn("lib/types.ts");
  for (const field of ["severity", "environment", "status", "isActive", "closedDate"]) {
    check(`Item still has ${field}`, new RegExp(`\\n  ${field}[?]?:`).test(types));
  }

  /*
   * Every field on `Item` needs an index mapping, or it stores fine and
   * silently aggregates to nothing — which is Recipe 3's step 2, the one people
   * skip.
   */
  {
    const mappings = JSON.parse(readFileSync(new URL("../src/lib/mappings.json", import.meta.url), "utf8"));
    const mapped = Object.keys(mappings.items?.properties ?? mappings.items?.mappings?.properties ?? {});
    const itemBlock = types.slice(types.indexOf("export type Item"));
    const declared = [...itemBlock.slice(0, itemBlock.indexOf("\n};")).matchAll(/^  (\w+)[?]?:/gm)].map((m) => m[1]);
    check("the Item block was found", declared.length >= 15, `${declared.length} fields`);
    const missing = declared.filter((f) => !mapped.includes(f));
    check("every Item field has an index mapping", missing.length === 0, missing.join(", "));
  }

  // The rule the guide leads with, and the reason the suites exist.
  check("the guide insists on running the suites", /pnpm test/.test(recipes));
  check("...and on breaking the code to prove a check bites", /break the code on purpose/i.test(recipes));
  check("it names the security boundary", /filtersFromRequest.*security boundary/s.test(recipes));
  check("it warns that mappings are immutable", /immutable once written/i.test(recipes));
  check("it warns about short mapping keys", /shorter than three characters/i.test(recipes));
  check("it points at the one-query rule", /Do not add a second query/i.test(recipes));

  // The commands it tells you to run must be real.
  const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
  for (const cmd of [...recipes.matchAll(/^pnpm (check:\w+|test|seed|check)\b/gm)].map((m) => m[1])) {
    check(`\`pnpm ${cmd}\` is a real script`, cmd === "seed" || cmd in pkg.scripts, cmd);
  }
}


section("the trend chart's end labels stay apart and in frame");
{
  const y = (v) => 200 - v * 10;          // a plain scale, so the maths is legible
  const place = (raised, closed) =>
    endLabelPositions({ points: [{ date: "2026-08-01", raised, closed }], y, top: 20, bottom: 200 });

  /*
   * A quiet week ends both series at zero, which put both names at the same y
   * and printed them on top of each other. Common enough that it was on screen.
   */
  const same = place(0, 0);
  check("both labels are placed", same.length === 2);
  check("labels at the same value do not collide", Math.abs(same[0].y - same[1].y) >= 12, `${Math.abs(same[0].y - same[1].y).toFixed(1)}px apart`);
  check("...and stay inside the plot", same.every((r) => r.y >= 20 && r.y <= 200), same.map((r) => r.y.toFixed(0)).join(", "));

  // Well separated values are left where they belong.
  const apart = place(10, 2);
  check("labels far apart are not nudged", Math.abs(apart.find((r) => r.key === "raised").y - (y(10) + 3.5)) < 0.01);

  // The nudge is symmetric, so neither series is favoured.
  const near = place(5, 5.4);
  const middle = (y(5) + y(5.4)) / 2 + 3.5;
  check("the nudge splits the difference", Math.abs((near[0].y + near[1].y) / 2 - middle) < 0.01);

  // Ordering is preserved: the higher value keeps the higher label.
  const ordered = place(9, 1);
  check("the higher series keeps the higher label", ordered.find((r) => r.key === "raised").y < ordered.find((r) => r.key === "closed").y);

  // Guards.
  check("no points means no labels", endLabelPositions({ points: [], y, top: 20, bottom: 200 }).length === 0);
  check("a label never goes above the plot", place(999, 999).every((r) => r.y >= 20));
  check("...nor below it", place(-999, -999).every((r) => r.y <= 200));

  /*
   * A plot shorter than the gap between two labels. The shift cannot help —
   * there is no arrangement that fits — so the last-resort clamp is what keeps
   * both inside the frame. Real on a short phone viewport.
   */
  {
    const squashed = endLabelPositions({ points: [{ date: "2026-08-01", raised: 0, closed: 0 }], y, top: 100, bottom: 105 });
    check("a plot too short for both still frames them", squashed.every((r) => r.y >= 100 && r.y <= 105), squashed.map((r) => r.y.toFixed(0)).join(", "));
  }
}

section("nothing is wider than the screen it is on");
{
  /*
   * A phone that scrolls sideways is the most obviously broken a responsive
   * layout gets, and the cause is always the same shape: one element wider than
   * the viewport, plus a clip somebody assumed would hold.
   *
   * The clip is the second line of defence, not the first — `overflow-x: clip`
   * is set on the root and the body, but a layout that needs it is one browser
   * quirk away from the bug this section was written for.
   */
  const componentFiles = readdirSync(new URL("../src/components/", import.meta.url))
    .filter((f) => /\.tsx$/.test(f))
    .map((f) => [f, readFileSync(new URL(`../src/components/${f}`, import.meta.url), "utf8")]);
  const adminFiles = readdirSync(new URL("../src/app/admin/panels/", import.meta.url))
    .filter((f) => /\.tsx$/.test(f))
    .map((f) => [f, readFileSync(new URL(`../src/app/admin/panels/${f}`, import.meta.url), "utf8")]);
  const all = [...componentFiles, ...adminFiles];

  /*
   * `-left-[50vw]` and friends make an element 200vw wide. The topbar backdrop
   * did exactly that, and on a phone the page scrolled sideways behind a bar
   * that was supposed to be clipped.
   */
  for (const [file, src] of all) {
    const offenders = src.match(/-(?:left|right|inset-x)-\[\d+(?:\.\d+)?vw\]/g) ?? [];
    check(`${file} has no viewport-wide negative inset`, offenders.length === 0, offenders.join(" "));
  }

  /*
   * A fixed `min-w` narrower than a phone is fine; wider than one must sit
   * inside a scroller, or it pushes the whole page.
   */
  const PHONE = 320;
  for (const [file, src] of all) {
    for (const m of src.matchAll(/min-w-\[(\d+)(px|rem)\]/g)) {
      const px = m[2] === "rem" ? Number(m[1]) * 16 : Number(m[1]);
      if (px <= PHONE) continue;
      // The scroller may be on the element itself or on the line before it.
      const at = m.index ?? 0;
      const around = src.slice(Math.max(0, at - 400), at + 200);
      check(
        `${file}: min-w-[${m[1]}${m[2]}] sits inside a horizontal scroller`,
        /overflow-x-auto|overflow-x-scroll/.test(around),
        `${px}px`,
      );
    }
  }

  // `w-screen` is 100vw, which on desktop includes the scrollbar and overflows
  // by its width. Almost never what anybody means.
  for (const [file, src] of all) {
    check(`${file} does not use w-screen`, !/\bw-screen\b/.test(src));
  }

  /*
   * The page's own clip, which every full-bleed decoration leans on. `clip`
   * rather than `hidden`: `hidden` forces the computed `overflow-y` to `auto`,
   * which makes the element a scroll container and undermines the sticky bar.
   */
  const globals = readFileSync(new URL("../src/app/globals.css", import.meta.url), "utf8");
  check("the page clips sideways overflow", (globals.match(/overflow-x:\s*clip/g) ?? []).length >= 2);
  check("...and never with hidden, which breaks sticky", !/overflow-x:\s*hidden/.test(globals));
}
console.log("\n" + "─".repeat(60));
console.log(failures === 0 ? `All ${checks} ui checks passed.` : `${failures} of ${checks} ui checks FAILED.`);
process.exit(failures ? 1 : 0);
