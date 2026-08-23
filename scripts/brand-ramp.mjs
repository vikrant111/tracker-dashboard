/**
 * Regenerate the brand blue ramp used by `--series-1` and the ageing scale.
 *
 *   node scripts/brand-ramp.mjs            # default: Bajaj Finserv blue #0071BB
 *   node scripts/brand-ramp.mjs '#123456'  # any other anchor
 *
 * Holds the anchor's hue constant in OKLCH and steps by lightness, keeping
 * chroma as high as sRGB allows. Lower step number = lighter, matching the
 * dataviz reference ramp's naming.
 *
 * The output is a starting point, not an answer: run each candidate set through
 * the dataviz validator against the real surface before putting it in
 * globals.css. See docs/design-system.md.
 */
const srgbToLin = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const linToSrgb = (c) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);
const clamp = (x) => Math.min(1, Math.max(0, x));

const hexToRgb = (h) => [0, 2, 4].map((i) => parseInt(h.replace("#", "").slice(i, i + 2), 16) / 255);
const rgbToHex = (r, g, b) =>
  "#" + [r, g, b].map((v) => Math.round(clamp(v) * 255).toString(16).padStart(2, "0")).join("");

function rgbToOklab([r, g, b]) {
  const R = srgbToLin(r), G = srgbToLin(g), B = srgbToLin(b);
  const l = Math.cbrt(0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B);
  const m = Math.cbrt(0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B);
  const s = Math.cbrt(0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

function oklabToRgb([L, a, b]) {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    linToSrgb(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    linToSrgb(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    linToSrgb(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
  ];
}

const toLch = ([L, a, b]) => [L, Math.hypot(a, b), Math.atan2(b, a)];
const fromLch = ([L, C, h]) => [L, C * Math.cos(h), C * Math.sin(h)];
const inGamut = (rgb) => rgb.every((v) => v >= -0.002 && v <= 1.002);

/** Highest chroma that still fits inside sRGB at this lightness and hue. */
function maxChroma(L, h) {
  let lo = 0;
  let hi = 0.4;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (inGamut(oklabToRgb(fromLch([L, mid, h])))) lo = mid;
    else hi = mid;
  }
  return lo;
}

const BRAND = process.argv[2] || "#0071bb";
const [bL, bC, bH] = toLch(rgbToOklab(hexToRgb(BRAND)));
const deg = (((bH * 180) / Math.PI) + 360) % 360;

console.log(`anchor ${BRAND}  ->  OKLCH  L ${bL.toFixed(3)}  C ${bC.toFixed(3)}  h ${deg.toFixed(1)}°\n`);

const STEPS = [
  [100, 0.92], [150, 0.87], [200, 0.82], [250, 0.76], [300, 0.7],
  [350, 0.645], [400, 0.585], [450, 0.53], [500, 0.475], [550, 0.42],
  [600, 0.37], [650, 0.32], [700, 0.27],
];

const ramp = {};
let nearest = null;
for (const [name, L] of STEPS) {
  const C = Math.min(bC * (1 + (0.55 - Math.abs(L - 0.55)) * 0.5), maxChroma(L, bH) * 0.97);
  ramp[name] = rgbToHex(...oklabToRgb(fromLch([L, C, bH])));
  console.log(`  ${String(name).padEnd(4)} ${ramp[name]}   L ${L.toFixed(3)}`);
  if (nearest === null || Math.abs(L - bL) < Math.abs(nearest[1] - bL)) nearest = [name, L];
}

console.log(`\nthe anchor's own nearest step: ${nearest[0]}`);
console.log("\nfeed these to the dataviz validator before use:");
console.log("  ageing light (darkens with age):", [300, 400, 500, 600, 700].map((s) => ramp[s]).join(","));
console.log("  ageing dark  (brightens):       ", [500, 400, 300, 200, 100].map((s) => ramp[s]).join(","));
console.log("  slot 1 light / dark:            ", `${ramp[450]} / ${ramp[350]}`);
