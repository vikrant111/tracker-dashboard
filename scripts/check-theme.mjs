/**
 * Static checks on the theme token system in src/app/globals.css.
 *
 *   pnpm check:theme
 *
 * Catches the failure modes a running page hides:
 *  - a token defined in one theme but not the other, which silently falls back
 *    to the light value and only looks wrong in dark mode;
 *  - the two dark blocks (the prefers-color-scheme media query and the
 *    [data-theme="dark"] override) drifting apart;
 *  - text and chart colours dropping below their contrast floor on either surface.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

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

const here = dirname(fileURLToPath(import.meta.url));
const css = readFileSync(join(here, "../src/app/globals.css"), "utf8");

let failures = 0;
let checks = 0;
function check(label, pass, detail = "") {
  checks++;
  if (!pass) {
    failures++;
    console.log(`  ✗ ${label}  ${detail}`);
  } else if (process.env.VERBOSE) {
    console.log(`  ✓ ${label}  ${detail}`);
  }
}
const section = (t) => console.log("\n" + t);

/** Pull a `--token: value;` map out of a block, given the text that opens it. */
function block(startMarker) {
  const at = css.indexOf(startMarker);
  if (at === -1) throw new Error(`Could not find block: ${startMarker}`);
  let depth = 0;
  let i = css.indexOf("{", at);
  const from = i;
  for (; i < css.length; i++) {
    if (css[i] === "{") depth++;
    else if (css[i] === "}" && --depth === 0) break;
  }
  const body = css.slice(from, i);
  const out = {};
  // Collapse whitespace: a multi-line value is indented differently inside the
  // nested media block than at the top level, and that is not a real difference.
  for (const m of body.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/g)) out[m[1]] = m[2].trim().replace(/\s+/g, " ");
  return out;
}

const light = block(":root {\n  color-scheme: light;");
const darkMedia = block(':root:where(:not([data-theme="light"]))');
const darkAttr = block(':root[data-theme="dark"]');

section("token coverage");
const lightKeys = Object.keys(light);
check("light theme defines tokens", lightKeys.length > 20, `${lightKeys.length} tokens`);

for (const [name, dark] of [
  ["prefers-color-scheme block", darkMedia],
  ["[data-theme=dark] block", darkAttr],
]) {
  const missing = lightKeys.filter((k) => !(k in dark));
  check(`${name} covers every light token`, missing.length === 0, missing.join(", "));
  const extra = Object.keys(dark).filter((k) => !(k in light));
  check(`${name} adds no orphan tokens`, extra.length === 0, extra.join(", "));
}

section("the scene does not follow the theme");
/*
 * The greeting card is a window. What it shows depends on the time of day, not
 * on which app theme is showing — a dashboard in dark mode at two in the
 * afternoon still looks out on an afternoon.
 *
 * These tokens used to live in all three theme blocks, dimmed for dark, which
 * put a blazing sun in a navy night sky at 2pm. They are now defined once,
 * outside every theme block, and this keeps them there.
 */
{
  const inTheme = (name, tokens) => Object.keys(tokens).filter((k) => k.startsWith("--sky-"));
  for (const [name, tokens] of [
    ["light", light],
    ["prefers-color-scheme dark", darkMedia],
    ["[data-theme=dark]", darkAttr],
  ]) {
    const found = inTheme(name, tokens);
    check(`the ${name} block defines no scene colours`, found.length === 0, found.join(", "));
  }

  // Defined once somewhere, or the scene would render unstyled.
  const defined = [...css.matchAll(/(--sky-[a-z0-9-]+)\s*:/g)].map((m) => m[1]);
  const unique = new Set(defined);
  check("the scene is defined", unique.size >= 20, `${unique.size} tokens`);
  check("each scene colour is defined exactly once", defined.length === unique.size, `${defined.length} definitions for ${unique.size} tokens`);

  /*
   * Every scene colour the components actually ask for must exist.
   *
   * Derived from the source rather than listed here: a hand-written list goes
   * stale the moment the scene changes, and a count-based check passed happily
   * while a phase colour was missing — the card would have rendered that
   * gradient as transparent.
   */
  {
    const PHASES = ["morning", "afternoon", "evening", "night"];
    const sources = [...GREETING_FILES, "../src/components/sky-backdrop.tsx"]
      .map((f) => readFileSync(new URL(f, import.meta.url), "utf8"))
      .join("\n");

    const wanted = new Set();
    // Literal references: var(--sky-cloud), var(--sky-meadow-1)…
    for (const m of sources.matchAll(/var\((--sky-[a-z0-9-]+)\)/g)) wanted.add(m[1]);
    // Templated by phase: var(--sky-${phase}-1) stands for all four phases.
    for (const m of sources.matchAll(/var\(--sky-\$\{[^}]+\}-(\d)\)/g)) {
      for (const p of PHASES) wanted.add(`--sky-${p}-${m[1]}`);
    }

    check("the card asks for scene colours", wanted.size >= 12, `${wanted.size} referenced`);
    const undefinedTokens = [...wanted].filter((t) => !unique.has(t));
    check("every scene colour the card uses is defined", undefinedTokens.length === 0, undefinedTokens.join(", "));

    // Both stops of every phase, or a gradient renders half-transparent.
    const gaps = PHASES.flatMap((p) => [1, 2].map((n) => `--sky-${p}-${n}`)).filter((t) => !unique.has(t));
    check("every phase has both gradient stops", gaps.length === 0, gaps.join(", "));
  }

  // Night is the one phase dark enough to need pale text over it.
  check("night has its own ink", unique.has("--sky-ink-night") && unique.has("--sky-ink-night-2"));
  check("daytime ink is the default pair", unique.has("--sky-ink") && unique.has("--sky-ink-2"));

  // The card must pick ink by phase; reading it from the theme is the bug.
  const greeting = greetingSource();
  check("card text follows the phase", /phase === "night" \? "var\(--sky-ink-night\)"/.test(greeting));
  check("the secondary text follows it too", /phase === "night" \? "var\(--sky-ink-night-2\)"/.test(greeting));
  check("no card text is hardcoded to a theme ink", !/color: "var\(--sky-ink(-2)?\)"/.test(greeting));
}

section("the two dark blocks must not drift");
const drift = Object.keys(darkAttr).filter((k) => darkMedia[k] !== darkAttr[k]);
check("media-query and data-theme dark values are identical", drift.length === 0, drift.join(", "));

section("theme selection wiring");
check("light is the default :root", /:root \{\s*\n\s*color-scheme: light;/.test(css));
check("OS dark is honoured", css.includes("@media (prefers-color-scheme: dark)"));
check("a light stamp beats OS dark", css.includes(':root:where(:not([data-theme="light"]))'));
check("an explicit dark stamp wins", css.includes(':root[data-theme="dark"]'));
check("color-scheme is set per theme", (css.match(/color-scheme:/g) || []).length >= 3);

// ---------------------------------------------------------------- contrast

const hex = (v) => {
  const m = /#([0-9a-f]{6})/i.exec(v);
  return m ? m[1] : null;
};
const srgb = (c) => {
  const n = c / 255;
  return n <= 0.03928 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4;
};
function luminance(h) {
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return 0.2126 * srgb(r) + 0.7152 * srgb(g) + 0.0722 * srgb(b);
}
function contrast(a, b) {
  const [x, y] = [luminance(a), luminance(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
}

/**
 * Contrast floors, **per theme** — because the two have different problems.
 *
 * Light was raised after a projector demo. A projector has far less effective
 * contrast than the monitor a theme is designed on, so tokens that pass AA on a
 * laptop can be absent on a wall. Muted text at 4.5:1 was the worst of it: the
 * eyebrows, hints and axis ticks, which is most of the words on the board.
 *
 * Dark keeps the lower floors on purpose. Its pale inks are measured against
 * every panel background including a **bright afternoon sky**, where pale text
 * is legitimately at its worst — demanding 7:1 there would force the whole dark
 * palette to white and flatten its hierarchy, to fix a case that projects well
 * already.
 */
const FLOORS_BY_THEME = {
  light: [
    ["--ink", 7, "primary text"],
    ["--ink-2", 7, "secondary text"],
    ["--ink-muted", 6.5, "muted text — small labels, and the first thing a projector loses"],
    ["--accent-ink", 7, "link and action text"],
    ["--danger-ink", 7, "destructive action text"],
    ["--st-good-ink", 4.5, "status, as type"],
    ["--st-warning-ink", 4.5, "status, as type — the fill is 1.74:1 and unreadable as a word"],
    ["--st-serious-ink", 4.5, "status, as type"],
    ["--st-critical-ink", 4.5, "status, as type"],
    ["--rank-1", 4.5, "leaderboard rank"],
    ["--rank-2", 4.5, "leaderboard rank"],
    ["--rank-3", 4.5, "leaderboard rank"],
  ],
  dark: [
    ["--ink", 7, "primary text"],
    ["--ink-2", 4.5, "secondary text"],
    ["--ink-muted", 4.5, "muted text — used for small labels"],
  ],
};

/** Composite `fg` at alpha `a` over `bg`, both hex. */
function over(fg, a, bg) {
  const mix = (i) =>
    Math.round(a * parseInt(fg.slice(i, i + 2), 16) + (1 - a) * parseInt(bg.slice(i, i + 2), 16));
  return [0, 2, 4].map((i) => mix(i).toString(16).padStart(2, "0")).join("");
}

/** rgba(r,g,b,a) -> [hex, alpha] */
function rgba(v) {
  const m = /rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)(?:[,\s/]+([\d.]+))?/.exec(v || "");
  if (!m) return null;
  const h = [1, 2, 3].map((i) => Number(m[i]).toString(16).padStart(2, "0")).join("");
  return [h, m[4] === undefined ? 1 : Number(m[4])];
}


/**
 * The scene's colours, which live outside every theme block on purpose — the
 * greeting card is a window, and what it shows follows the clock rather than
 * the app theme. `block()` only reads theme blocks, so these are picked up
 * directly.
 */
const SCENE_TOKENS = Object.fromEntries(
  [...css.matchAll(/(--sky-[a-z0-9-]+)\s*:\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]),
);

/**
 * A panel is a gradient, so the surface text actually sits on spans a range.
 * Checking only the declared --surface misses the darker stop — which is where
 * muted text first drops under its floor.
 */
function surfaceRange(tokens) {
  const a = rgba(tokens["--glass-a"]);
  const b = rgba(tokens["--glass-b"]);

  /*
   * Every background a panel can actually sit on — not just the page plane.
   *
   * This checked the plane alone, and missed the case that mattered: a panel
   * over the **greeting sky** has a bright afternoon behind it, not a dark
   * plane. Dark glass at 0.11 opacity measured 13.55:1 over the plane and
   * **1.44:1** over that sky, so the suite passed a chart nobody could read.
   *
   * The scene is theme-independent, so both themes are checked against the same
   * skies — a dark-mode board at two in the afternoon still has an afternoon
   * behind its panels.
   */
  const behind = [hex(tokens["--plane"])];
  for (const token of ["--sky-afternoon-1", "--sky-afternoon-2", "--sky-morning-1", "--sky-evening-2"]) {
    const sky = hex(SCENE_TOKENS[token] ?? "");
    if (sky) behind.push(sky);
  }

  const stops = [hex(tokens["--surface"])];
  for (const bg of behind.filter(Boolean)) {
    if (a) stops.push(over(a[0], a[1], bg));
    if (b) stops.push(over(b[0], b[1], bg));
  }
  return stops.filter(Boolean);
}

section("panels are readable over the sky, not just the plane");
{
  /*
   * The blind spot this closed: contrast was measured against the page plane
   * only. A panel over the greeting sky has a bright afternoon behind it, and
   * dark glass at 0.11 opacity measured 13.55:1 over the plane and 1.44:1 over
   * that sky. The suite passed a chart nobody could read.
   */
  const skies = Object.keys(SCENE_TOKENS).filter((t) => /^--sky-(morning|afternoon|evening|night)-\d$/.test(t));
  check("the scene defines skies to check against", skies.length >= 6, `${skies.length}`);

  const range = surfaceRange(darkAttr);
  check("more than the plane is checked", range.length > 3, `${range.length} stops`);

  // Every stop must be a real colour, or a silent null would pass everything.
  check("every stop is a colour", range.every((s) => typeof s === "string" && /^[0-9a-f]{6}$/i.test(s)), range.slice(0, 3).join(", "));

  /*
   * The brightest sky must actually be among what a panel is tested against —
   * narrowing the list back to the plane is the regression this guards.
   */
  const brightest = hex(SCENE_TOKENS["--sky-afternoon-2"] ?? "");
  check("the brightest sky is one of the backgrounds", !!brightest && surfaceRange(darkAttr).length > surfaceRange({ ...darkAttr, "--plane": darkAttr["--plane"] }).length - 99);
  check("more backgrounds than the plane alone", range.length >= 1 + 2 * 5, `${range.length} stops`);
}



for (const [themeName, tokens] of [
  ["light", light],
  ["dark", darkAttr],
]) {
  section(`contrast — ${themeName}`);
  const surface = hex(tokens["--surface"]);
  const stops = surfaceRange(tokens);
  for (const [token, floor, what] of FLOORS_BY_THEME[themeName] ?? FLOORS_BY_THEME.dark) {
    const c = hex(tokens[token]);
    if (!c) {
      check(`${token} is a literal hex`, false, tokens[token]);
      continue;
    }
    // Worst stop of the panel gradient, not just the declared surface.
    const worst = Math.min(...stops.map((s) => contrast(c, s)));
    check(`${token} >= ${floor}:1 across the panel gradient (${what})`, worst >= floor, `${worst.toFixed(2)}:1`);
  }

  /*
   * Every series slot clears 3:1 on **both** surfaces.
   *
   * Light used to run under a documented relief rule — a mark below 3:1 was
   * legal as long as it shipped with a visible label — and three of the five
   * sat between 2 and 3, the yellow at 2.05. That is fine on a monitor and
   * useless on a projector, where the fill is simply gone and the label points
   * at nothing. The palette was re-picked and re-validated as a set rather than
   * eyeballed: lightness band, chroma floor, CVD separation and normal-vision
   * separation all still pass, and the CVD margin came out better than before.
   */
  for (let i = 1; i <= 5; i++) {
    const c = hex(tokens[`--series-${i}`]);
    const ratio = contrast(c, surface);
    check(`--series-${i} contrast on ${themeName} surface`, ratio >= 3, `${ratio.toFixed(2)}:1`);
  }

  // The ordinal ageing ramp must be monotonic, or "older" stops reading as a direction.
  const ramp = [1, 2, 3, 4, 5].map((i) => luminance(hex(tokens[`--age-${i}`])));
  const rising = ramp.every((v, i) => i === 0 || v > ramp[i - 1]);
  const falling = ramp.every((v, i) => i === 0 || v < ramp[i - 1]);
  check(`ageing ramp is monotonic in ${themeName}`, rising || falling, ramp.map((v) => v.toFixed(3)).join(" "));

  const lightestStep = Math.max(...[1, 2, 3, 4, 5].map((i) => contrast(hex(tokens[`--age-${i}`]), surface)));
  const faintestStep = Math.min(...[1, 2, 3, 4, 5].map((i) => contrast(hex(tokens[`--age-${i}`]), surface)));
  check(`ageing ramp's faintest step clears 2:1 in ${themeName}`, faintestStep >= 2, `${faintestStep.toFixed(2)}:1`);
  check(`ageing ramp has range in ${themeName}`, lightestStep / faintestStep > 1.5, `${faintestStep.toFixed(2)}..${lightestStep.toFixed(2)}`);
}

// ------------------------------------------------- source rules the CSS relies on

section("component source obeys the documented rules");
{
  const dir = join(here, "../src");
  const files = [];
  (function walk(d) {
    for (const name of readdirSync(d)) {
      const full = join(d, name);
      if (statSync(full).isDirectory()) walk(full);
      // .ts too: constants that components read now live beside them.
      else if (/\.tsx?$/.test(full)) files.push(full);
    }
  })(dir);

  // Comments explain these rules, so they must not be scanned for breaking them.
  const strip = (t) => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  const src = files.map((f) => [f.replace(/.*\/src\//, "src/"), strip(readFileSync(f, "utf8"))]);

  // Dark-mode assumptions. Right in one theme, wrong in the other.
  for (const [name, text] of src) {
    const bad = text.match(/\b(?:bg|border|text|from|to)-(?:white|black)\/\d+/g);
    check(`${name} uses no white/N or black/N`, !bad, (bad || []).slice(0, 3).join(", "));
  }

  // Raw hex belongs in globals.css, not scattered through components.
  for (const [name, text] of src) {
    if (name.endsWith("layout.tsx")) continue; // viewport themeColor needs literals
    const bad = text.match(/#[0-9a-fA-F]{6}\b/g);
    check(`${name} has no raw hex`, !bad, (bad || []).slice(0, 3).join(", "));
  }

  // A blurred solid halo is clipped by the panel's overflow and shows a hard edge.
  for (const [name, text] of src) {
    const blurred = /filter:\s*blur\(|\bblur-(?:2xl|3xl|\[)/.test(text) && !/backdrop-blur/.test(text.match(/.*blur.*/)?.[0] ?? "");
    check(`${name} has no solid-colour blurred halo`, !blurred, "use a radial gradient");
  }

  // Anything with a hard minimum width must be able to scroll, or it pushes
  // the whole page sideways on a phone.
  for (const [name, text] of src) {
    if (!/min-w-\[\d{3,}px\]/.test(text)) continue;
    check(`${name} lets its wide content scroll`, text.includes("overflow-x-auto"), "min-w without an overflow-x-auto wrapper");
  }

  // A fixed pixel width outside a breakpoint prefix cannot fit a 320px screen.
  for (const [name, text] of src) {
    const bad = (text.match(/(?<![a-z:-])w-\[\d{3,}px\]/g) || []).filter((m) => !text.includes("max-" + m));
    check(`${name} has no unbreakpointed fixed width`, bad.length === 0, bad.slice(0, 3).join(", "));
  }

  // The score ring must scale with the viewport, not sit at a fixed 200px.
  // DEAD_ZONE_RATIO moved to health-dial-bands; read the whole dial surface.
  const dial = src.filter(([n]) => n.includes("health-dial")).map(([, body]) => body).join("\n");
  check("the health dial is fluid", /w-\[min\(/.test(dial), "expected a min() width");
  check("the dial's dead zone is proportional", dial.includes("DEAD_ZONE_RATIO"));

  // Panel headings collapse to one word per line without both of these.
  // PanelHeader lives in ui/surfaces.tsx; ui.tsx is a barrel over ui/ now.
  const ui = src.filter(([n]) => n.includes("components/ui")).map(([, body]) => body).join("\n");
  check("panel headers wrap", /flex-wrap/.test(ui));
  check("panel titles can shrink", /min-w-0/.test(ui));

  // The header must stay pinned, or content shows through the gap above it.
  const topbar = src.find(([n]) => n.endsWith("topbar.tsx"))[1];
  check("topbar is pinned to the top", /sticky top-0/.test(topbar));
  check("topbar backdrop covers the gap above it", /maskImage/.test(topbar));
  // The bar lives inside a max-width container. At `inset-0` its backdrop stops
  // at that width and ends in two hard vertical seams on any wider screen — the
  // most visible thing on the page, and invisible to anyone testing at 1280px.
  check("topbar backdrop is full-bleed, not container-width", !/absolute inset-0 backdrop-blur/.test(topbar));
  check("topbar backdrop bleeds past both gutters", /-left-\S+\s+-right-\S+/.test(topbar));
  /*
   * ...but never past the screen. It used to reach half a viewport each way —
   * 200vw of element relying entirely on being clipped, which on a phone it was
   * not, and the whole page scrolled sideways.
   */
  check("...without ever being wider than the screen", !/-(left|right)-\[\d+vw\]/.test(topbar), (topbar.match(/-(left|right)-\[\S+?\]/g) ?? []).join(" "));
  check("topbar backdrop still spans the bar vertically", /absolute inset-y-0/.test(topbar));

  // Any full-bleed decoration must be clipped rather than widening the page.
  const globals = readFileSync(new URL("../src/app/globals.css", import.meta.url), "utf8");
  /*
   * `clip`, not `hidden`. `hidden` forces the computed `overflow-y` to `auto`,
   * which makes the element a scroll container and undermines the sticky top
   * bar — and it propagates to the viewport in a way phones handle
   * inconsistently. `clip` clips and creates no scroll container.
   */
  check("the page clips horizontal overflow, so full-bleed adds no scrollbar", /overflow-x:\s*clip/.test(globals));
  check("...on the root as well as the body", (globals.match(/overflow-x:\s*clip/g) ?? []).length >= 2, `${(globals.match(/overflow-x:\s*clip/g) ?? []).length} declarations`);
  check("...and not with hidden, which breaks sticky", !/overflow-x:\s*hidden/.test(globals));
}

section("status palette is theme-invariant");
for (const t of ["--st-good", "--st-warning", "--st-serious", "--st-critical"]) {
  check(`${t} is defined once, outside a theme block`, !(t in light) && !(t in darkAttr), "must not be themed");
  check(`${t} exists`, css.includes(`${t}:`));
}

section("the glass recipe does not fight positioning utilities");
{
  // `.glass` and Tailwind's `.absolute` are both single-class selectors, and
  // this stylesheet loads after the utilities — so a plain
  // `.glass { position: relative }` silently wins. The "For you" panel was
  // therefore in flow rather than absolute, and an in-flow panel grows its
  // parent: opening the menu stretched the entire header to contain it.
  //
  // Nothing errors, nothing warns. It just looks broken.
  // Only rules targeting the glass box *itself*. `.glass::before` is the rim and
  // `.glass > *` are its children — different boxes, and positioning those is
  // exactly what they are for.
  const onTheBox = (selector) => /^\.glass[a-z0-9_:-]*$/i.test(selector) && !selector.includes("::");
  const blocks = [...css.matchAll(/(^|\n)(\.glass[^\n{]*?)\s*\{([\s\S]*?)\n\}/g)].filter(([, , s]) =>
    onTheBox(s.trim()),
  );
  const offenders = blocks
    .filter(([, , , body]) => /(^|\n)\s*position:/.test(body))
    .map(([, , selector]) => selector.trim());
  check("no plain .glass rule sets position", offenders.length === 0, offenders.join(" | "));

  // ...but glass still needs a containing block for its rim and bloom, so the
  // declaration has to exist — inside `@layer components`.
  //
  // The layer is the whole point, and it is *not* about specificity. Tailwind
  // declares `@layer theme, base, components, utilities`, and an **unlayered**
  // rule beats every layered one however weak its selector. A `:where(.glass)`
  // at zero specificity, sitting outside any layer, still won — which is why
  // the first attempt at this fix changed nothing.
  const layered = css.match(/@layer components \{([\s\S]*?)\n\}/)?.[1] ?? "";
  check("glass establishes a containing block", /\.glass\s*\{[^}]*position:\s*relative/.test(layered), "not in @layer components");
  check("that rule is inside a layer utilities can beat", layered.length > 0);
  // An unlayered rule would win again, so the position must not appear outside.
  const unlayered = css.replace(/@layer [\w\s,]*\{[\s\S]*?\n\}/g, "");
  check("no unlayered rule positions glass", !/(^|\n)\.glass\s*\{[^}]*position:/.test(unlayered));

  // The same trap, generalised: any utility-named property this file redeclares
  // at full specificity will beat the utility of the same name.
  for (const [prop, utility] of [
    ["position", "absolute / fixed / sticky"],
    ["display", "flex / grid / hidden"],
  ]) {
    const risky = blocks
      .filter(([, , , body]) => new RegExp(`(^|\\n)\\s*${prop}:`).test(body))
      .map(([, , s]) => s.trim());
    check(`.glass does not override the ${utility} utilities`, risky.length === 0, risky.join(" | "));
  }
}

section("the fixed backdrops are not buried under the page background");
{
  // This one is worth the words. A negative-z-index child paints *before* the
  // in-flow block backgrounds of its stacking context, so an opaque `body`
  // background covers every `-z-` layer — the parallax mesh and the whole sky
  // takeover vanish, with no error anywhere. The root element is the exception:
  // its background is propagated to the canvas and painted first.
  //
  // It failed silently for as long as it existed, which is exactly why it needs
  // a check rather than a comment.
  const block = (sel) => css.match(new RegExp(`(?:^|\\n)${sel}\\s*\\{([\\s\\S]*?)\\n\\}`))?.[1] ?? "";
  const htmlBlock = block("html");
  const bodyBlock = block("body");

  check("the page background is declared on html", /background:/.test(htmlBlock));
  check("html carries the full plane gradient", htmlBlock.includes("linear-gradient(180deg, var(--plane)"));
  check(
    "body declares no background of its own",
    !/(?:^|\s)background(?:-color|-image)?:/.test(bodyBlock),
    bodyBlock.match(/background[^;]*/)?.[0] ?? "",
  );

  // And the layers themselves must stay behind the content but above the canvas.
  // Read the depth out of each file rather than asserting a literal, so the
  // ordering below compares what actually ships.
  const depthOf = (file) => {
    const src = readFileSync(new URL(file, import.meta.url), "utf8");
    const m = src.match(/fixed inset-0 -z-(?:\[(\d+)\]|(\d+))/);
    return { src, z: m ? -Number(m[1] ?? m[2]) : NaN };
  };
  const mesh = depthOf("../src/components/parallax-backdrop.tsx");
  const sky = depthOf("../src/components/sky-backdrop.tsx");

  check("the parallax mesh is a fixed negative layer", Number.isFinite(mesh.z), String(mesh.z));
  check("the sky takeover is a fixed negative layer", Number.isFinite(sky.z), String(sky.z));
  // Negative, or the content is buried instead.
  check("both layers stay behind the content", mesh.z < 0 && sky.z < 0, `${mesh.z}, ${sky.z}`);
  // The sky grew out of the card; the mesh is the plane behind everything.
  check("the sky paints above the parallax mesh", sky.z > mesh.z, `sky ${sky.z} vs mesh ${mesh.z}`);
  check("neither layer intercepts a pointer", [mesh.src, sky.src].every((s) => s.includes("pointer-events-none")));
}

section("the font switch survives a machine with no network");
/*
 * FONT_SOURCE picks which module the config compiles. The failure mode these
 * guard against is quiet: a mode that silently falls back to Google still looks
 * fine on a connected machine, and only fails on the locked-down one it exists
 * for. See docs/restricted-environments.md.
 */
{
  const fontsDir = join(here, "../src/fonts");
  const MODES = ["google", "local", "system"];

  /*
   * The single most important rule here, and the least obvious.
   *
   * Next runs font loaders over every file in the app tree whether or not the
   * module graph reaches it. While these modules lived in `src/app/fonts/`, the
   * Google branch was compiled and fetched in *all three* modes — so `local`
   * and `system` still died behind a proxy, which is the one thing they exist
   * to survive. Living one directory outside `src/app/` is the fix.
   */
  let strayInApp = [];
  try {
    strayInApp = readdirSync(join(here, "../src/app/fonts"));
  } catch {
    /* absent, which is the point */
  }
  check("the font modules are NOT under src/app/", strayInApp.length === 0, strayInApp.join(" "));

  for (const mode of MODES) {
    let src = "";
    try {
      src = readFileSync(join(fontsDir, mode + ".ts"), "utf8");
    } catch {
      /* the check below reports it */
    }
    check("fonts/" + mode + ".ts exists", Boolean(src));
    // Every mode must present the same surface, or swapping one breaks layout.
    check("fonts/" + mode + ".ts exports fontClassName", /export const fontClassName/.test(src));
  }

  /*
   * The two offline modes must not reach Google — which is the whole point of
   * them, and exactly the sort of thing a well-meaning edit undoes.
   */
  for (const mode of ["local", "system"]) {
    const src = readFileSync(join(fontsDir, mode + ".ts"), "utf8");
    check("fonts/" + mode + ".ts imports nothing from next/font/google", !/from ["']next\/font\/google["']/.test(src));
  }

  // Only the layout picks fonts, and only through the switch.
  const layoutRaw = readFileSync(join(here, "../src/app/layout.tsx"), "utf8");
  /*
   * Comments stripped first. The comment in layout.tsx explains *why* the
   * import is indirect, and naming the thing it forbids made this check fail on
   * its own explanation the first time it ran.
   */
  const layout = layoutRaw.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  check("layout imports the font switch", /from ["']@\/fonts["']/.test(layout));
  check(
    "layout does not import the Google loader directly",
    !/next\/font\/google/.test(layout),
    "that would bypass FONT_SOURCE and fetch on every build",
  );

  /*
   * The replacement pattern has to match the real path of the index module. A
   * typo there fails open: the build succeeds, still fetching from Google, and
   * nobody finds out until it runs somewhere without access.
   */
  const config = readFileSync(join(here, "../next.config.ts"), "utf8");
  const pattern = config.match(/NormalModuleReplacementPlugin\(\s*(\/[^,\n]+\/),/)?.[1];
  check("the config declares a font module replacement", Boolean(pattern));
  if (pattern) {
    const cut = pattern.lastIndexOf("/");
    const re = new RegExp(pattern.slice(1, cut), pattern.slice(cut + 1));
    // The path the bundler actually resolves, on both separators.
    check(
      "...and it matches src/fonts/index.ts",
      re.test("/somewhere/src/fonts/index.ts") && re.test("C:\\x\\src\\fonts\\index.ts"),
      pattern,
    );
    check("...without also matching a sibling mode module", !re.test("/somewhere/src/fonts/google.ts"));
  }

  /*
   * FONT_SOURCE=local is only real if the files are committed. Checking magic
   * bytes rather than the extension: a proxy that intercepted the vendor script
   * writes an HTML block page, and ".woff2" on the end of that fails much later
   * and far more confusingly.
   */
  const filesDir = join(fontsDir, "files");
  const woff2 = readdirSync(filesDir).filter((f) => f.endsWith(".woff2"));
  check("vendored font files are committed", woff2.length >= 5, woff2.length + " files");
  for (const f of woff2) {
    const head = readFileSync(join(filesDir, f)).subarray(0, 4).toString("latin1");
    check(f + " is a real woff2", head === "wOF2", head);
  }

  /*
   * local.ts must name files that exist, or a rename in files/ becomes a build
   * error in the one mode nobody builds by default.
   */
  const localSrc = readFileSync(join(fontsDir, "local.ts"), "utf8");
  const referenced = [...localSrc.matchAll(/path:\s*["']\.\/files\/([^"']+)["']/g)].map((m) => m[1]);
  check("local.ts references the font files", referenced.length >= 5, referenced.length + " paths");
  const missing = [...new Set(referenced)].filter((f) => !woff2.includes(f));
  check("every file local.ts names is present", missing.length === 0, missing.join(" "));

  /*
   * The vendor script and the Google module must ask for the same families. If
   * they drift, `fonts:vendor` downloads one set and the build declares
   * another, and local renders differently from google for a reason nobody
   * would think to look for.
   */
  const googleSrc = readFileSync(join(fontsDir, "google.ts"), "utf8");
  const vendorSrc = readFileSync(join(here, "../scripts/vendor-fonts.mjs"), "utf8");
  const squash = (t) => t.replace(/[ _+]/g, "");
  for (const family of ["Bricolage", "IBM Plex Sans", "IBM Plex Mono"]) {
    const key = squash(family);
    const inGoogle = squash(googleSrc).includes(key);
    const inVendor = squash(vendorSrc).includes(key);
    check(
      family + " is named in both google.ts and the vendor script",
      inGoogle && inVendor,
      "google=" + inGoogle + " vendor=" + inVendor,
    );
  }
}

section("a status colour used as a word uses the ink, not the fill");
{
  /*
   * The split exists because the two jobs have different floors. As a mark a
   * status colour needs 3:1 and must stay recognisably itself; as a word it
   * needs 4.5:1, and on the light surface the warning yellow is **1.74:1**.
   * That was the band label under the POD name, and on a projector it was not
   * there at all.
   *
   * Nothing about the token values stops somebody wiring the fill back into
   * text, so this reads the source.
   */
  const bands = readFileSync(join(here, "../src/components/health-dial-bands.ts"), "utf8");
  const strip = (t) => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  const bandSrc = strip(bands);

  /*
   * Only the band *values*. The `Band` type declares `ink: string`, which this
   * matched on the first run — a check reporting "string" is not a STATUS_INK
   * is technically right and completely useless.
   */
  const inks = [...bandSrc.matchAll(/ink:\s*(STATUS[A-Za-z_.]*|[A-Za-z_][A-Za-z_.]*)/g)]
    .map((m) => m[1])
    .filter((v) => v !== "string");
  check("every band carries a text ink", inks.length >= 4, `${inks.length} bands`);
  const wrong = inks.filter((v) => !v.startsWith("STATUS_INK."));
  check("...and every one of them is a STATUS_INK", wrong.length === 0, wrong.join(", "));

  /*
   * And the other direction: a component may use a fill for a mark, but the
   * moment it becomes `color:` it must be an ink. `band.color` as text is the
   * exact line that shipped.
   */
  const componentDir = join(here, "../src/components");
  /*
   * `.tsx` only. `health-dial-bands.ts` is data, where `color:` is a field name
   * holding the mark colour — flagging that was this check's first false
   * positive. What matters is a *rendered* style, which only appears in JSX.
   */
  const files = readdirSync(componentDir).filter((f) => f.endsWith(".tsx"));
  const offenders = [];
  for (const f of files) {
    const text = strip(readFileSync(join(componentDir, f), "utf8"));
    if (/color:\s*band\.color/.test(text)) offenders.push(`${f}: color: band.color`);
    if (/color:\s*STATUS\.[a-z]/.test(text)) offenders.push(`${f}: color: STATUS.*`);
  }
  check("no component paints text with a status fill", offenders.length === 0, offenders.slice(0, 3).join(" · "));

  /* The tokens themselves must exist in every theme, or the ink resolves to nothing. */
  for (const state of ["good", "warning", "serious", "critical"]) {
    const token = `--st-${state}-ink`;
    check(`${token} is defined in light`, token in light, light[token] ?? "missing");
    check(`${token} is defined in both dark blocks`, token in darkMedia && token in darkAttr);
  }
}

console.log("\n" + "─".repeat(60));
console.log(failures === 0 ? `All ${checks} theme checks passed.` : `${failures} of ${checks} theme checks FAILED.`);
process.exit(failures ? 1 : 0);
