---
applyTo: "src/components/**,src/app/**/*.tsx,src/app/globals.css,src/lib/palette.ts"
description: Visual system, chart rules and motion
---

# UI, charts and motion

## Visual system

Glass over a parallax field, in **light and dark**. Chrome tokens live in
`src/app/globals.css`; data colours in `src/lib/palette.ts`, which resolves to
CSS custom properties so themes swap without re-rendering a chart. Keep them
separate — chrome may be tuned freely, data colours may not.

Tokens: `--plane` / `--plane-2`, `--surface`, `--panel`, `--ink` / `--ink-2` /
`--ink-muted`, `--hairline`, `--grid`, `--wash` / `--wash-2` / `--wash-3`,
`--glass-a/-b/-border/-inset/-shadow/-rim`, `--mesh-1..4`, `--orb-1..4`,
`--orb-opacity`, `--grain`, `--veil`, `--accent`, `--accent-2`, `--accent-deep`,
`--accent-tint`, `--accent-line`, `--accent-ink`, `--accent-glow`, `--danger*`,
`--scrim`, `--mark-ink`, `--rank-1..3`.

**Never write `white/10`, `black/50` or a raw hex in a component.** Those are
dark-mode assumptions and will look wrong in light. Use `--wash*` for
translucent fills, `--hairline` for borders, `--scrim` for the drawer backdrop,
and a palette export for anything encoding data.

Glass reads as glass because of the **backdrop** (`--mesh-1..4`, `--orb-*`,
`--grain`) and the specular `--glass-rim`, not because panels are transparent.
Do not lower panel opacity to make it "more glassy" — that changes the effective
`--surface` and invalidates the palette's contrast validation.

**Glow: use `.glow` / `.glow-sm` / `.glow-lg` / `.bloom` / `.breathe` / `.lit`
with a `--hue` set inline. Never hardcode a coloured `box-shadow`.** Halos are
radial gradients, never solid-colour + `filter: blur()` — a blurred element gets
clipped hard by a panel's `overflow: hidden` and shows a straight edge. Animate
only `opacity` and `transform`. Dark has luminance
headroom so glow is a centred bloom; light has none, so the same tokens cast a
saturated coloured shadow downward instead. A hardcoded shadow is right in one
theme and invisible in the other.

**Every token must be defined in all three theme blocks** — `:root` (light), the
`prefers-color-scheme: dark` media block, and `[data-theme="dark"]`. One missing
from the dark blocks silently falls back to its light value. `pnpm
check:theme` fails on that, and on the two dark blocks drifting apart.

Use the `.glass` class rather than re-deriving the blur, border and shadow.
`.glass-hover` adds the accent-tinted lift.

Type: **Bricolage Grotesque** display (headings, hero figures),
**IBM Plex Sans** body, **IBM Plex Mono** for ids, day counts and axis ticks.
Reach for `font-[family-name:var(--font-mono)]` plus `.tnum` when numbers sit in
a column; leave standalone figures proportional.

`.eyebrow` is the small mono uppercase label above a panel title. It is a label,
not decoration — it should say what the panel measures.

## Chart rules

These are not stylistic preferences. **Both** palettes were validated against
their own surface — light `#f6f9fc`, dark `#172533` — for lightness band, chroma
floor, colour-vision-deficiency separation, normal-vision separation and
contrast. Light and dark are each selected; neither is a tint of the other.

- **Never reorder `SERIES`.** Slot order *is* the CVD-safety mechanism.
- **Assign by entity, never by rank.** A filter that changes which series are
  present must not repaint the survivors.
- **One y-axis.** Two measures of different scale become two charts.
- **Severity uses the status palette** (`SEVERITY_COLOR`) and always ships colour
  *plus* a text label. Status colours are reserved and never reused as a series.
- **Ageing is ordinal** — one hue, monotone lightness, oldest bucket carrying the
  most presence. The direction **reverses** between themes (dark brightens with
  age, light darkens). Keep adjacent steps ≥ 0.06 ΔL, and the step nearest the
  surface above 2:1.
- On the **light** surface, aqua, yellow and magenta fall under 3:1 — the
  documented relief rule, which obligates visible labels. Never add a light-mode
  chart that leans on fill colour alone.
- **Two or more series get a legend**, and up to four also get direct labels, so
  identity never rests on colour alone.
- Marks: 2px lines, ~4px rounded data-ends, hover markers ≥ 5px radius with a
  2px surface ring, 2px gaps between stacked segments, recessive grid
  (`var(--grid)`).

Charts are hand-written SVG. Do not add a charting library — the mark specs
above are easier to hit directly than to fight a library's defaults, and the
bundle stays small.

## Drill-downs

Everything countable is expandable. Panels do not fetch their own item lists —
they call `useDrill()` and describe themselves as a query:

```tsx
const drill = useDrill();
drill({ title: "Critical", subtitle: "Severity", query: { severity: "Critical" } });
```

`DrillProvider` merges three layers — the dashboard's `baseQuery` (team, kind,
search), the drill query, then the drawer's own filters — and fetches
`/api/items`. Before any drawer filter is touched, a drill-down must return
exactly the count shown on the thing that was clicked; if it does not, the
filter is wrong, not the aggregation.

Filters inside the drawer are **server-side**, not a client filter over the
loaded page. The list pages at 200, so filtering client-side would only search
the first page and quietly report the wrong count.

A dimension pinned by the drill renders as a locked chip, not a select —
changing it would contradict the panel the drawer came from. Filters reset on
each new drill; carrying them across would silently hide rows.

Ten surfaces open the drawer: the five tiles, the health ring and its three
drivers, breakdown rows, leaderboard rows, roll-up cells, chips inside an
expanded POD row, and trend-chart points. **Whatever number sits next to a
drill, the drill must return exactly that number** — add a case to
`pnpm check invariants` whenever you add one.

Trend points drill on exact `createdFrom`/`createdTo` bounds. Day-granularity
age maths cannot express a histogram bucket and returns too many items.

The roll-up expands **inline** (chevron, spring height animation) and fetches
that POD's metrics only once its row is opened.

## The health dial

`role="slider"`, drag or arrow keys to explore thresholds, springs back on
release. **It is display-only** — the scrubbed value must never reach a query or
be mistaken for the real score, and the caption says so while dragging.

If you touch the pointer maths, update `scripts/check-ui.mjs` to match; it
mirrors `valueAt` deliberately because the component is a client module. The
same file mirrors the greeting rules from `lib/greeting.ts`.

## Chrome layout

The top bar is pinned at `sticky top-0` inside a wrapper whose blurred,
downward-fading backdrop covers the strip above it. Do not move it to `top-N` —
the gap that creates lets scrolling panels show through and the bar reads as
detached. `pnpm check:theme` enforces both.

## Motion

- Panels enter with `whileInView` + `once: true`. Never re-animate on scroll-back.
- Stagger lists at ~0.045s per row and cap total delay, so a long list does not
  crawl in.
- The parallax backdrop is `fixed`, `pointer-events-none` and `-z-10`. It must
  never intercept a click.
- `useReducedMotion()` disables parallax and count-ups; the global CSS also
  collapses durations under `prefers-reduced-motion`. Any new animation honours
  one of the two.

## Accessibility floor

Non-negotiable, regardless of how the design evolves: visible keyboard focus
(set globally on `:focus-visible`), `aria-label` on icon-only buttons, `role="img"`
plus a summary label on each chart `<svg>`, `aria-hidden` on decorative swatches,
and status/severity never carried by colour alone.

## Data fetching

`dashboard-client.tsx` owns all dashboard state and polls `/api/metrics` every
30s through SWR with `keepPreviousData`. Child panels take props — they do not
fetch. The drawer is the only other fetcher.
