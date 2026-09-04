# Design system

Direction: **mission control, in Bajaj Finserv blue**. Glass panels floating over
a parallax field, with an arcade high-score leaderboard as the signature element.
Playful through motion and the leaderboard, disciplined everywhere else — a board
full of aged criticals should not feel like a toy.

## Brand basis

The palette is *inspired by* Bajaj Finserv's blue-and-white identity, anchored on
its primary blue **`#0071BB`**, with a teal companion. It is a visual direction,
not an official brand kit — there is no licensed asset here, and the logo mark is
this app's own letterform.

The blue ramp is that exact hue held constant in OKLCH and stepped by lightness.
The brand blue itself lands on **step 450**, which is what slot 1 and the ageing
ramp are built from:

| Step | Hex | | Step | Hex |
|---|---|---|---|---|
| 100 | `#d0e8ff` | | 450 | `#0c70b6` ← brand |
| 200 | `#93cafe` | | 500 | `#08609d` |
| 250 | `#6bb7fd` | | 550 | `#065085` |
| 300 | `#3394e5` | | 600 | `#04426f` |
| 350 | `#1393ed` | | 650 | `#02355b` |
| 400 | `#0f80d0` | | 700 | `#012847` |

A single brand hue cannot supply five colourblind-safe categorical slots, so only
slot 1 is brand blue; slots 2–5 keep the validated companion hues. The brand
shows through instead in the surfaces (white-leaning light, deep navy dark), the
accent, and the ageing ramp — which is entirely brand blue.

Regenerate it with `node scripts/brand-ramp.mjs` (pass another hex to re-anchor
on a different brand). It holds `h = 247.7°` and steps by lightness. Its output
is a starting point — always re-run the dataviz validator against the real
surface before putting values in `globals.css`.

## Two themes

Light and dark are each **selected**, not derived. Neither palette is a tint or
an inversion of the other: both were run through the dataviz validator against
their own `--surface`.

Selection order, in [`globals.css`](../src/app/globals.css):

1. `:root` — light, the default.
2. `@media (prefers-color-scheme: dark) :root:where(:not([data-theme="light"]))` —
   follows the OS, unless the reader has explicitly chosen light.
3. `:root[data-theme="dark"]` — an explicit choice, which wins either way.

The `:where()` keeps the media block at zero specificity so the explicit stamp
beats it in both directions. `ThemeToggle` writes `light` / `dark` / nothing
(= follow the OS) to `localStorage`, and `THEME_SCRIPT` — a blocking inline
script in `<head>` — applies it before first paint, so the page never renders in
the wrong theme and snaps. `<html>` carries `suppressHydrationWarning` because
that script mutates the element before React hydrates.

**Every token must exist in all three blocks.** One missing from the dark blocks
silently falls back to its light value, which nobody notices until they open
that component in dark mode. `pnpm check:theme` fails on exactly that, and on
the two dark blocks drifting apart.

## Tokens

Chrome lives in [`globals.css`](../src/app/globals.css), data colour in
[`palette.ts`](../src/lib/palette.ts) — which now resolves to CSS custom
properties rather than literal hex, so themes swap without React re-rendering a
chart. Keep them separate: chrome may be retuned freely, data colour may not.

| Role | Light | Dark |
|---|---|---|
| Page plane | `--plane` `#dee9f6` | `#061524` deep navy |
| Chart surface (glass over plane) | `--surface` `#f6f9fc` | `#172533` |
| Solid popovers, drawers, menus | `--panel` `#ffffff` | `#0d1b2b` |
| Primary ink | `--ink` `#0e1a26` | `#eef4fa` |
| Secondary ink | `--ink-2` `#374a5c` | `#a3b4c6` |
| Muted ink | `--ink-muted` `#404f5d` | `#9caec3` |
| Hairline / gridline | `--hairline`, `--grid` | |
| Translucent fills | `--wash`, `--wash-2`, `--wash-3` | |
| Accent | `--accent` `#0071bb` (brand) → `--accent-2` `#0d9aa8` | `#1393ed` → `#2bc0d0` |

Dark mode is deep **navy**, not neutral black, so it stays in the brand family
rather than reading as a generic dark theme.

`--surface` is not decorative: it is the colour both palettes were validated
against. Changing the glass recipe means re-running the validation.

### Making glass read as glass

Glass refracts what is behind it. With a backdrop close in value to the panels,
the effect collapses into flat white boxes — which is exactly what happened
first time round in light mode. The fix is in the **backdrop**, not in more
transparency on the panel:

| Token | Job |
|---|---|
| `--mesh-1..4` | four saturated radial washes painted onto the plane |
| `--orb-1..4`, `--orb-opacity` | drifting blurred orbs, pointer- and scroll-parallaxed |
| `--grain` | film-grain overlay, so the large washes do not band |
| `--glass-rim` | specular edge along the top-left, masked so it fades away |
| `--glass-a/-b/-border/-inset/-shadow` | the fill, edge and depth of a panel |
| `--accent-deep`, `--accent-glow` | solid-button gradient end and its bloom |
| `--danger-tint-2`, `--danger-line` | destructive hover fill and border |

**Panel opacity stays high on purpose.** Making panels more transparent would
change the effective `--surface` and invalidate every contrast guarantee the
palette was validated against. The colour comes from behind, not through.

Use `.glass` and `.glass-hover` rather than re-deriving blur, border and shadow —
they read from those tokens and so flip with the theme.

### Radiance

Glow is not one effect with one implementation — **it is one idea with two
physics**, because the two themes have different headroom:

| | Dark | Light |
|---|---|---|
| Mechanism | luminance bloom centred on the element | saturated colour cast **downward** as a shadow |
| `--glow-y` | `0px` | `8px` |
| `--glow-blur` | `34px` | `24px` |
| `--glow-strength` | `0.75` | `0.55` |
| `--bloom-opacity` | `0.32` | `0.42` |

On a near-white surface there is no room above white, so a centred bloom is
simply invisible — which is exactly why the first light theme looked flat while
the same CSS glowed in dark. Radiance on light has to come from **hue**, not
brightness.

Three utilities read those tokens. Set `--hue` inline and the theme picks the
physics:

| Class | Use |
|---|---|
| `.glow` / `.glow-sm` / `.glow-lg` | a lit element — bars, chips, medals, buttons, the logo mark |
| `.bloom` | the soft halo behind a panel or tile; breathes on a 7s cycle |
| `.breathe` | opt-in pulse for a halo that is not a `.bloom` (the health dial) |
| `.lit` | a figure that carries its own light (tile values, the health score) |

Small `.glow` accents sit on **data** — bars, severity dots, counts — and stay
static. A pulsing data mark reads as an alert. Only ambient chrome breathes.

**Halos are radial gradients, never a solid colour with `filter: blur()`.** A
blurred element is clipped hard by the panel's `overflow: hidden`, which showed
as a straight vertical edge partway across the health card. A gradient's alpha
reaches zero inside its own box, so there is nothing left to clip. It is also
markedly cheaper — four 100px blurs on drifting backdrop orbs cost real frame
time.

Blooms breathe on `opacity` and `transform` only, so the animation composites on
the GPU. Never animate `filter` or `box-shadow`; both repaint every frame. Stagger
neighbours with `--bloom-delay` so a row of tiles does not pulse in lockstep.

Under `prefers-reduced-motion` the breathing is stopped outright and parked at
its resting opacity — the blanket duration-zeroing would otherwise freeze it on
its first keyframe, which is deliberately dimmer than rest.

```tsx
<span className="glow-sm" style={{ background: color, "--hue": color }} />
```

Never hardcode a `box-shadow` with a colour — it will be right in one theme and
wrong in the other.

### Keyframes

| Name | Used by |
|---|---|
| `drift` | backdrop orbs, slow autonomous movement so the field lives when the pointer is still |
| `sheen` | one light sweep across a panel as it enters (`.sheen`) |
| `pulse-ring` | the glow behind the health dial, and the newest point on the trend chart |

**Never write a bare `white/10`, `black/50` or raw hex in a component.** Those
are dark-mode assumptions. Use `--wash*` for translucent fills, `--hairline` for
borders, `--scrim` for the drawer backdrop.

## The health dial

The score ring — [`health-dial.tsx`](../src/components/health-dial.tsx) — is a
**`role="slider"`**. Dragging it scrubs a *hypothetical*
score so a reader can find where each band begins — "what would we have to clear
to read healthy?" — and the tick marks on the track show those thresholds even
at rest.

It is display-only. Nothing downstream of the scrubbed value touches data, the
caption says plainly that the number is hypothetical while dragging, and the
dial springs back to the real score on release.

### It reads as a percentage

The number carries a **`%`**. It used to read `32` above the caption `OF 100`,
which was the same information and was misread: a few rows below sits *Still
open* — `106` above `of 244`, a genuine count of genuine items. Two figures in
the same card, in the same shape, one a tally and one a score. `57%` cannot be
mistaken for a tally.

The caption under it reads **closed**, not *health*, because that is exactly what
the score counts: the share of tracked items that are closed. The reader can
check it against "106 of 244" on the same card and get the same number — which is
the entire reason the score was reduced to that one division. See
[metrics.md](metrics.md#health-score).

`aria-valuemin` / `aria-valuemax` stay `0` and `100` — the slider's range is
unchanged, only how it is spoken and drawn. `aria-valuetext` says
"57% closed — falling behind".

Guards, because a dial that keeps a scrubbed number on screen would be the
dashboard showing a board health that is not real:

| Risk | Guard |
|---|---|
| Pointer released outside the ring, or the gesture cancelled | `pointerup` / `pointercancel` / `blur` listeners on `window`, not just the element |
| Angle is meaningless near the centre | a 28px dead zone returns `null` |
| Non-finite coordinates | rejected — `NaN < 28` is `false`, so NaN would otherwise reach the display |
| Value out of range | clamped 0..100, and `clamp` refuses to launder a `NaN` into a number |
| Right-click starting a scrub | `button !== 0` ignored |
| Keyboard | arrows step (Shift = 10), Escape and Home reset, blur resets |

`pnpm check:ui` covers the maths: cardinal points, 1440 directions × 5
radii staying in range, the dead zone, hostile coordinates, keyboard saturation
and every band boundary.

## The greeting

The health card ends with a small sky and the reader's first name, filling what
was dead space below the score drivers.

It reads the **local hour** and matches it, refreshing every minute so a board
left open overnight follows along.

### The scene is a window, not a surface

**The card does not follow the app theme.** A dashboard in dark mode at two in
the afternoon still looks out on an afternoon: blue sky, green meadow, white
cloud. Only the chrome *around* the card — its border, the panels beside it —
belongs to the theme.

It used not to be. All 26 `--sky-*` tokens were redefined in each of the three
theme blocks, dimmed for dark, so the afternoon sky was `#a9d4f7` in light and a
near-black navy in dark. The result was a **sun blazing in a night sky at 2pm** —
the scene contradicted its own clock, and the card said "Good afternoon" over it.

They are now defined **once**, in a `:root` block outside every theme block, so
there is nowhere left to dim them from. `pnpm check:theme` asserts that: the
scene is absent from all three theme blocks, every colour is defined exactly
once, and every colour the components reference actually exists — derived by
scanning the components for `var(--sky-…)` rather than from a list that would go
stale.

**Text over the sky follows the sky, not the theme.** With the scene fixed, pale
dark-mode ink would sit on a pale afternoon sky and vanish, so the card picks:

| Phase | Sky at the horizon | Ink |
|---|---|---|
| morning | `#f2e7d8` warm | `--sky-ink` dark |
| afternoon | `#e9f3fd` pale | `--sky-ink` dark |
| evening | `#f6c69a` peach | `--sky-ink` dark |
| night | `#0a1524` near-black | `--sky-ink-night` pale |

Night is the only phase dark enough to need it — a rule that reads off the sky
itself rather than off a setting.

### Responsive

#### Nothing may be wider than the screen

A phone that scrolls sideways is the most obviously broken a responsive layout
gets. The cause is always the same shape: **one element wider than the viewport,
plus a clip somebody assumed would hold.**

The top bar's backdrop bleeds past the page gutters so it does not end in two
hard seams on a wide screen. It used to do that with `-left-[50vw]
-right-[50vw]` — 200vw of element, held back only by the page clip. On a phone
that clip did not hold and the whole board scrolled sideways. It reaches a fixed
distance now, wide enough to cover the gutters at any width and never wider than
the screen.

The page still clips, as a second line of defence, with **`overflow-x: clip`
rather than `hidden`**:

| | `hidden` | `clip` |
|---|---|---|
| Clips overflow | ✅ | ✅ |
| Forces `overflow-y: auto` | ⚠️ **yes** | no |
| Creates a scroll container | ⚠️ **yes** | no |
| Leaves `position: sticky` alone | ⚠️ no | ✅ |

That middle row is why the top bar and the page disagreed: `hidden` on `body`
made the body a scroll container, which is the wrong place for a sticky element
to anchor to.

Three rules, all checked:

- **No negative inset in `vw`.** `-left-[50vw]` doubles an element's width.
- **A `min-w` wider than 320px lives inside `overflow-x-auto`.** Wide tables are
  fine; wide tables that push the page are not.
- **No `w-screen`.** It is `100vw`, which on desktop includes the scrollbar and
  overflows by its width.


Every panel is fluid down to 320px. The rules the checks enforce:

- **The score dial is fluid** — `w-[min(200px,52vw)]` with a viewBox that scales,
  and a dead zone expressed as a **fraction of the radius** rather than 28px,
  which would otherwise swallow most of a phone-sized ring.
- **No unbreakpointed fixed width.** A bare `w-[620px]` cannot fit a phone; it
  must be `max-w-`, or carry an `sm:`/`lg:` prefix.
- **Anything with a hard `min-w-` lives inside `overflow-x-auto`**, so a wide
  table scrolls itself instead of pushing the page sideways.
- **Panel headers wrap and their titles carry `min-w-0`.** Without both, a long
  title beside a segmented control collapses to one word per line — which is
  exactly what happened to "Who is holding the board".

A subtle one worth remembering: `flex-1` on the greeting, inside the card's
`h-full` column, let it grow and **squeeze its siblings** — and `overflow-hidden`
then clipped the score ring away entirely on a narrow screen. It carries
`shrink-0` and a `min-height` now.

### The cast

Each animal keeps to one part of the day, which is what makes the scene feel
observed rather than decorated — and the whole schedule is `SCENE.cast` in
[`lib/constants.ts`](../src/lib/constants.ts), not a table buried in the component:

| | Morning | Afternoon | Evening | Night |
|---|---|---|---|---|
| Crane | ● | | | |
| Gull | | ● | | |
| Squirrel | | ● | | |
| Cat | | | ● | ● |
| Bat | | | ● | ● |

**How many of each is tunable from one place.** `SCENE` in `lib/constants.ts`
holds the cast schedule, a count for each flyer — `bats`, `gulls`, `cranes` —
the grass tuft counts and the cloud count per weather condition.

The crane was the odd one out until recently: an on/off in the cast table with
its flight hardcoded in the JSX, while the flyers either side of it had counts.
All three work the same way now, and a check asserts it — a table of flights, a
count clamped to that table, and perspective holding across it. The *choreography* — which bat flies how fast at
what distance — stays with the scene, because it is animation rather than a
number anyone tunes; `SCENE.bats` picks how many of it to use and is clamped to
what is defined, so asking for nine draws three rather than crashing.

Bats cross in 72s, 88s and 104s, the slowest thing in the sky bar the clouds.
Every phase has at least one companion, and each animal is confined to its own
part of the day — all checked.

#### Why the first version read as cartoon

"Not realistic" turned out to be two separate problems, shape and motion, and
each animal failed differently. What fixed it, and what the checks now hold:

**The cat's walk.** The legs were single sticks rotating on a symmetric
sine — a pendulum. Two changes:

- Each leg is now **jointed**: thigh, shank, paw. The shank stays straight while
  the leg bears weight and folds only during the swing, to clear the ground. A
  cat's hock bends opposite to its knee, so the hind legs get their own
  keyframe (`sky-shank-hind`).
- The gait is a **lateral-sequence walk** — hind then fore on one side, then the
  same on the other, a quarter-stride apart. That is what a cat uses at this
  speed, and it keeps three feet down at any moment. Legs in simple opposition
  is a *trot*, and a trotting cat does not saunter along a skyline.

`sky-thigh` spends **62% of the stride in stance** and swings forward in the
remaining 38%, because a foot is planted longer than it is in the air. The body
rides the gait with `sky-gait-bob`, twice per stride, at 0.7px — a taller bob
reads as a toy. One `STRIDE` constant drives the legs and the bob, so they cannot
drift apart.

Far-side legs are drawn behind the body at 55% opacity. Four identical legs read
as a cardboard cut-out.

**Shape.** Each animal is recognised at a distance by one cue, and each was
missing it:

| | Was | Is |
|---|---|---|
| Cat | a plain ellipse | haunch high at the rear, back dipping to the shoulder, neck and muzzle |
| Squirrel | a thin tail sliver — it read as a rat | a plumed tail **taller than the body**, carried in an S over the back |
| Crane | one rigid wing paddle | wing hinged at the **wrist**, outer half lagging the inner through the beat |
| Bat | a scalloped outline, like a leaf | four **finger struts** per wing, because a bat's wing is a hand |

The crane also flies with its neck fully extended and its legs trailing past the
tail — that is what separates a crane from a heron, which folds its neck back.

The bat's struts use `--sky-membrane`, a real token in all three theme blocks,
not a hardcoded lightening of the wing.

A check pins each of these: the stance fraction, the four distinct leg phases,
the sub-pixel bob, the wrist hinge, and the tail reaching above the body. They
were each mutation-tested by breaking the thing they describe.

The **ground line sits at y=110 in a 120-tall viewBox** on purpose. At 400×160
a `slice` fit cropped the bottom of a wide card and cut the cat off at the
knee; a check now asserts the cat's feet land on or above the ground line.

#### The meadow

There is no ground *line* any more. A ruled 1px rule edge-to-edge was the one
thing in the scene that could not exist outside a diagram — it read as a border,
not as ground. It is a meadow now: three depth bands with rolling edges, grass
along them, leaning in the wind.

| Band | Top | Fill |
|---|---|---|
| Far | y=88 | `--sky-meadow-1` |
| Mid | y=98 | `--sky-meadow-2` |
| Near | y=110 (`GROUND`) | `--sky-meadow-3` |

Depth comes from **value, not outline** — each band is lighter the further away
it is, with a `--sky-haze` wash along the horizon, because distance drains
colour. The near band stays level with `GROUND` so the cast's placement is
untouched.

**Day and night without twelve more tokens.** The meadow tokens are theme-scoped
(light/dark), but grass is green at noon and near-black at midnight, which is a
*phase* question. Rather than four sets of greens per theme, the phase washes the
ground with its own horizon colour:

| Phase | Wash |
|---|---|
| Afternoon | 0.06 |
| Morning | 0.20 |
| Evening | 0.38 |
| Night | 0.62 |

That is what atmosphere does anyway, and it is one number instead of twelve
tokens. It crossfades over 1200ms with the sky, so the scene never snaps between
phases.

#### The clouds

A cloud is a silhouette with humps on a flat base — five overlapping circles over
a rounded rect, one fill, no stroke. The previous version was three ellipses in a
row, which reads as three ellipses in a row.

They drift on `sky-drift` at 115–168s, deliberately slower than anything that
flies: a cloud overtaking a bat reads as the sky moving backwards. No two share a
duration.

**Cloud count when there is no weather provider.** `clear` means the provider
*said* clear, so one wisp is honest. With nothing configured there is nothing to
be honest or dishonest about, so the sky gets scenery — four clouds. The factual
channel is the caption under the name, and that stays empty unless the weather is
real. Both halves are checked.

Two layers, so the cast walks **through** it rather than on top of it: 22 far
tufts drawn before the animals, 16 near ones drawn after. The near fringe is
scaled to **0.45** deliberately — the cat's paws land at y≈107, and the standing
instruction is that its legs stay visible, so the near grass reaches its ankles
and stops.

Grass is drawn in **tufts, not blades**. Three blades share one animation, which
is ~38 animations instead of ~114, and a clump moving together is what real
grass does anyway.

`sky-grass-sway` is **asymmetric** — `-1.8°` to `+3.6°`, with the return slower
than the push. Wind has a direction; a symmetric sway is a metronome, the same
mistake the cat's legs made before they were fixed. Rotation is about the base of
the tuft, so the roots stay planted while the tips travel.

Everything varies by **index, not by chance**. `Math.random()` would grow one
field on the server and a different one on the client, and the scene would
visibly rearrange itself on hydration. (The check that enforces this strips
comments first — the comment explaining the rule names `Math.random()` and
tripped the rule it documents.)

Perspective drives the flyers, and the checks enforce it: smaller means further,
so it must be slower to cross **and** slower to beat. Clouds drift slower still
(115s, 150s) — a cloud overtaking a bat reads as the sky moving backwards.

With motion off, each flyer takes a distinct resting position so the scene still
composes instead of piling up at the left edge.

### The sun and the moon

Positions come from [`lib/sky.ts`](../src/lib/sky.ts), which is pure and
importable, so the checks exercise the real code rather than a copy of it.

Both bodies trace a **half-sine** from rise to set: on the horizon at each end,
highest in the middle. That is what fixes the bug this replaced — a 19:00 sun
drawn blazing overhead, which is what the user saw and reported. Now the sun
holds the sky from 06:00 to 18:00 and the moon holds it the rest of the time;
`skyBodies` guarantees exactly one is up at any minute, checked across all 1440
of them.

**They rise and set vertically, on a fixed line.** A real body tracks east to
west, and drawing it that way is what put the moon half off the left edge of the
page. The scene is 400 units wide, but `preserveAspectRatio="slice"` fills a
roughly-square card by scaling on the *height* — so only the **middle strip** is
ever on screen. On a square card that is x ∈ [140, 260]. A body sweeping the
full width is outside the crop for most of its time up.

`placeBody` therefore holds x at `BODY_X = 224` and moves only the height, from
`HORIZON_Y = 92` at rise and set to `ZENITH_Y = 26` at the peak:

| Hour | Body | y |
|---|---|---|
| 07:00 | sun | 74.9 |
| 10:00 | sun | 34.8 |
| 12:00 | sun | 26.0 (highest) |
| 17:00 | sun | 74.9 |
| 19:00 | moon | 74.9 |
| 22:00 | moon | 34.8 |

That still reads as *early / midday / late*, which is the whole job, and it is on
screen the entire time. `visibleXRange(w, h)` computes the surviving strip for a
given box, and a check asserts `BODY_X` lands inside it for every card size from
620×430 down to 280×300 — so this cannot regress by someone nudging the constant.

224 is also deliberately right of centre: clear of the greeting text on the left,
and 176 units clear of the right edge, because a body jammed against either edge
is as good as invisible.

#### Small devices

A fixed 224 is right on a desktop card, where 62 units of margin survive. It is
**not** right on a phone. The card there is tall and narrow, `slice` crops harder
the taller it gets, and the strip collapses:

| Card | Surviving strip | Clearance at a fixed 224 | Clamped |
|---|---|---|---|
| 620×430 desktop | [113, 287] | 62.5 | 62.5 |
| 660×420 tablet | [106, 294] | 70.3 | 70.3 |
| 366×430 phone | [149, 251] | 27.1 | 27.1 |
| 366×560 phone | [161, 239] | 15.2 | 15.7 |
| 296×620 phone | [171, 229] | **4.6** | 11.5 |

At 4.6 units of clearance a disc of r=14 is drawn straight over the boundary.
So `placeBody` takes the box it is drawn into and pulls the line inside that
box's own crop, leaving `BODY_MARGIN = 34` — capped at a fifth of the strip, or a
very narrow crop would clamp from both sides at once and pin the body to dead
centre. Without a box it falls back to `BODY_X`, which is correct for anything
uncropped. Desktop is unchanged; a check asserts that too.

The takeover has the opposite problem — a phone's band is *tall*, and cropping a
10:3 strip into a portrait band throws away ~70% of it, sun included. Neither
`slice` (crops) nor plain `meet` (a 117px sky above 700px of grass) is
acceptable.

So the takeover uses **`fit="adapt"`**, which grows the viewBox *upward* by
whatever open sky the band's shape needs. The scene keeps its proportions and
its full width; the extra is sky, which is what a portrait landscape has more of:

| Screen | Band | Extra sky | viewBox | Scene width shown |
|---|---|---|---|---|
| 1920×1000 | 1920×576 | 0 | `0 0 400 120` | 100% |
| 1440×900 | 1440×432 | 0 | `0 0 400 120` | 100% |
| 820×1180 | 820×543 | 145 | `0 -145 400 265` | 100% |
| 400×865 | 400×398 | 278 | `0 -278 400 398` | 100% |
| 320×690 | 320×317 | 277 | `0 -277 400 397` | 100% |

`skyAbove(w, h)` returns 0 at the scene's own aspect, so **the card is
untouched** — this only affects boxes that would otherwise crop. Clouds and stars
carry a `depth` and rise into the added sky, or a tall frame would be empty on
top with everything banded along the bottom.

The trade-off, stated plainly: at full width on a 400px phone the scene renders
at **1px per scene unit**, against ~3.6× in the card. Everything is present and
nothing is cropped, but it is a wide shot rather than a close-up. Cropping is the
only way to make the details bigger, and that is what was rejected.

### The ground stretches too

Adding sky above is only half of it. Held at its fixed 22-unit depth, the meadow
on a full-height background became a thin strip **stranded halfway down the
screen** with flat colour painted beneath it — the horizon in the middle instead
of at the bottom.

So the ground scales with the added sky as well. Every rule is written as
`base + above × factor`, so at `above = 0` the numbers are exactly the card's:

| | Formula | At `above = 0` |
|---|---|---|
| Meadow depth | `22 + above × 0.30` | 22 (the card) |
| Far edge | `GROUND − depth` | 88 |
| Mid edge | `GROUND − depth × 0.55` | 98 |
| Near edge | `GROUND` | 110 |
| Horizon (rise/set) | `92 − above × 0.30` | 92 |
| Zenith | `26 − above × 0.88` | 26 |

Which lands the horizon in the same place at every size:

| Screen | Extra sky | Meadow depth | Horizon | Ground line | Meadow |
|---|---|---|---|---|---|
| 2000×1200 | 120 | 58 | 72% down | 96% | 28% of screen |
| 1440×900 | 130 | 61 | 72% | 96% | 28% |
| 820×1180 | 456 | 159 | 71% | 98% | 29% |
| 400×865 | 745 | 246 | 70% | 99% | 30% |

The zenith has to climb too — left at 26 it sits 61% down a tall frame, which is
a sun stuck near the ground with a screenful of empty sky above it.

The arc's **low** end rises faster than the ground does (0.45 against 0.30), so
it clears the horizon rather than grazing it. Matching the ground exactly is
astronomically correct and reads wrong: an hour after sunset the moon sat down
among the grass.

### Everything that flies carries a depth

Bats, the crane and the clouds all have a `y` authored for a 120-tall scene.
Left alone in a 240- or 865-tall frame they cluster in the bottom fifth — bats
skimming the grass, clouds *below* the horizon. `liftBy(y, above, depth)` is the
one rule they all use; `depth` is that flyer's share of the new sky.

| | Depth | Desktop | Phone |
|---|---|---|---|
| Bats | 0.7 / 0.6 / 0.8 | 28% / 41% / 18% | 29% / 40% / 20% |
| Crane | 0.72 | 25% | 27% |
| Clouds | 0.5–0.95 | 14–39% | 12–46% |
| Moon, lowest | — | 66% | 58% |
| Grass horizon | — | 72% | 70% |

Stars and precipitation use the same helper. At `above = 0` it returns `y`
unchanged, so none of this touches the card.

Blade height is the exception: it grows as `(depth / 22) ^ 0.35`, not linearly.
Linear, the foreground grass on a phone stands taller than the cat walking in it.

The backdrop therefore renders **one scene filling the whole layer** — no band
plus a painted-on meadow, and so no join to see. And the cast is back on: the
"giant cat" that took it off was an artefact of `slice` scaling by *height*, and
`adapt` scales by width, so the animals come out at roughly their card size.

The band is sized in **`dvh`, not `vh`**. On mobile `vh` is the tallest the
viewport ever gets, so a `vh` band overhangs behind the URL bar and resizes as it
hides.

### `grounded` and `cast` are two switches, not one

The takeover draws the **same landscape** as the card: meadow, grass, sky. What
it does *not* draw is the animals — at full-bleed the cat is several feet tall.

These were a single `grounded` flag, and that was a real bug: turning off the
giant cat also deleted the meadow, so after the card gained its landscape the
background silently kept the old flat-sky design. The card and the background
stopped matching and nothing failed.

- `grounded` — the meadow. On in both.
- `cast` — the animals. On in the card, off in the takeover.

Beneath the band the meadow **continues to the bottom of the page**, using the
same `--sky-meadow-3` token and the same phase wash as the scene's near band, so
the join is invisible. A check asserts the background does not pass
`grounded={false}` again.

The 06:00/18:00 boundaries are **fixed, not derived from latitude**. Real
sunrise needs a location, and the location is optional (see below) — a scene
that silently assumed one would be inventing a fact. Fixed hours are visibly a
convention; a wrong-by-an-hour sunrise would look like data.

The moon is drawn as the moon **actually is tonight**. `moonPhase` counts
lunations from a known new moon (2000-01-06 18:14 UTC) at the mean synodic
month of 29.530588853 days, and `moonShadowPath` lays a shadow over a full disc:
one semicircle for the dark limb, plus an ellipse for the terminator whose width
is `|1 − 2·lit| · r`. That single path gives every phase — a full disc of shadow
at new, nothing at full, and a straight edge at the quarters. The checks pin it
to two known full moons, so a wrong epoch or a wrong period fails rather than
drifting quietly.

The terminator width is **rounded to 3dp**, because float noise otherwise writes
a quarter-moon terminator as `1.1e-14` — legal SVG, but an exponent no path
parser should have to meet. At exactly 0 the arc degenerates to a straight line,
which is the truth about a quarter moon.

### Weather — real or absent, never invented

[`lib/weather.ts`](../src/lib/weather.ts) is **off unless configured**. Set
`WEATHER_LAT` and `WEATHER_LON` and the sky also follows the real weather via
Open-Meteo (free, no API key, no account). Leave them blank and nothing is
fetched, nothing leaves the network, and the scene simply follows the clock.

There is deliberately no fallback that guesses. A dashboard whose whole
discipline is that every number is real must not draw rain it invented.

Every failure degrades to *no weather* rather than to a guess: unset, blank,
unparseable, out of bounds, provider down, timeout, malformed payload. The
blank case is the subtle one — `Number("")` is **0**, and 0,0 is a real point in
the Atlantic that Open-Meteo answers for, so a default install would have shown
a stranger's weather and called it yours. Blank is now checked before `Number()`,
and the check is behavioural: it stubs `fetch`, calls the real function, and
asserts that nothing was requested.

WMO codes collapse to the seven skies the scene can draw — `clear`, `cloudy`,
`overcast`, `rain`, `snow`, `storm`, `fog` — and all 100 of them are checked to
land somewhere drawable.

### Hydration

The hour is only knowable on the client, so the phase starts `null` and is set
in an effect; rendering it during SSR would produce a server-time greeting that
then hydrated into a different one.

Everything animates `transform` or `opacity` only, and the whole scene is inert
under `prefers-reduced-motion`. Its colours are `--sky-*` tokens, so it is a
daylight sky in light mode and a night sky in dark.

The name rules live in [`lib/greeting.ts`](../src/lib/greeting.ts), not the
component, so they can be checked without a browser: an email reduces to its
first name (`ananya.rao@example.com` → "Ananya"), initials stay upper-case,
long names truncate, and anything empty or unusable falls back to "there" — the
card must never render "Hi, ".

## The scroll takeover

The greeting card does not hand over to a background — it **becomes** one.

[`sky-backdrop.tsx`](../src/components/sky-backdrop.tsx) holds the *same* scene
the card draws, `fixed` behind the board and clipped to exactly the card's
rectangle. At rest that window is the card, so the layer is entirely hidden
behind it and what you see is the card's own sky. As you scroll, the window
opens outward and the scene pushes in, until the sky the card was holding covers
the page.

Nothing cross-fades and nothing is duplicated. Because the window *starts* on the
card and the layer sits behind it, there is never a frame where two skies are
visible at once. The scene itself is exported once from `greeting.tsx` — two
hand-kept copies would drift, and a background that disagrees with the card it
grew out of is worse than no background.

The top inset reaches zero first, at the moment the card's top edge passes above
the viewport. The window tracks the card up the screen as it opens, which is what
makes it read as growing *out of* the card rather than appearing over it.

### It maximises, it does not unveil

**Every edge retreats on one `open` value.** All four give way by the same
fraction at the same moment, so the window grows outward the way a window
maximises.

The temptation is to run the sides ahead of the top and bottom. The content
column caps at 1400px, so on a 1917px screen ~260px of bare page sits either
side, and at one rate the width was only **86% covered at a normal reading
position**. Leading the horizontal axis fixes the coverage and looks wrong: the
side edges arrive long before the vertical ones and it reads as a **curtain**.
It was tried and rejected.

Since every edge has to move together, the only way to cover the gutters sooner
is to **finish sooner**. `SPAN_HEIGHT = 0.35`: the takeover runs until the card
is about a third gone rather than fully gone.

| Scroll | Width | Height |
|---|---|---|
| 0 | 71% | 43% |
| 120 | 81% | 63% |
| 180 | 90% | 79% |
| 300 | **100%** | **100%** |

The card is still on its way out when the sky completes, which is fine — it is a
panel above the layer, and both are showing the same sky.

The two axes start at different coverage because the card is wide and short, so
the check compares **how much of each axis's remaining gap has closed**, not the
raw percentages. Comparing percentages just measures the card's shape.

The rate ceiling in the smoothness check is likewise **derived**, not picked: an
edge moves at `edge × ease′(p) / span`, and smoothstep's derivative peaks at 1.5.
A hardcoded number there would need nudging every time the span changed, which is
a rubber stamp rather than a check.

One more measurement bug fixed alongside it: the viewport is read from
`documentElement.clientWidth`, not `window.innerWidth`. `innerWidth` **includes
the scrollbar** and a `fixed inset-0` layer does not, so the right inset carried
~15px of permanent error and never quite reached zero.

### The edge is a mask, not a clip

`clip-path` is the obvious way to cut this window and it is the wrong one. A clip
is a **binary test per pixel**: the sky meets the page in a razor-sharp
rectangle, with a colour step and no transition. Mid-takeover that edge is the
most visible thing on the screen and reads as a rendering fault rather than as a
card growing.

A mask carries alpha, so the edge can be *faded*. The window is four linear
gradients — one per edge, each turning opaque `feather` px past its inset —
intersected with `mask-composite: intersect`:

```
linear-gradient(to right,  transparent 24px,  #000 174px),
linear-gradient(to left,   transparent 796px, #000 946px),
linear-gradient(to bottom, transparent 96px,  #000 246px),
linear-gradient(to top,    transparent 374px, #000 524px)
```

They must be **AND**ed. Stacked, they union into a full-screen mask and the
window does not exist at all. `-webkit-mask-composite: source-in` covers the
older spelling, and `clip-path` is still applied underneath purely as
containment — the feather fades *inward* from that exact edge, so the clip lands
where the alpha is already zero and never shows a seam of its own.

The feather is widest at rest and closes to nothing as the window fills the
screen, so the sky reaches the screen edges at the end instead of vignetting
forever. It is also capped at 45% of the window's short side: a 150px feather on
a 200px-wide window would meet in the middle and mask the layer away entirely.

### Smoothness is a property, not a vibe

"It should be so smooth that the user experience is top" is checkable. Every
edge and the feather are sampled at **1px scroll increments** across the whole
takeover, and the largest step between adjacent positions must stay under 4px —
a discontinuity there is a visible tear. The easing curve's second difference is
sampled too, so a kink cannot creep in. Swapping the smoothstep for a step
function fails with a 628px jump.

### The scene is banded, not stretched

The card's scene is 400×120. `preserveAspectRatio="slice"` fills a tall viewport
by scaling roughly **8×** and cropping to the middle 57% of the width — which put
the sun off-frame and made the cat two storeys tall.

At full-bleed the scene is drawn in a band across the top instead, where the
whole width is in shot at a sane scale, melting into the plane below. The
takeover also passes `grounded={false}`, which drops the ground line and the
animals standing on it: the card is a scene at eye level, the takeover is a
*sky* behind a working dashboard. One component, two framings — not two
components that drift.

### The maths, and why it is its own module

All of it is in [`lib/takeover.ts`](../src/lib/takeover.ts), pure and importable,
so `check-ui.mjs` exercises the shipped code. That is not ceremony here: this
runs on every scroll frame, and a malformed `mask-image` or `clip-path` is
**silently dropped** by the browser rather than throwing. One `NaN` and the layer
either blanks or snaps to full-screen unmasked, with nothing in the console. The
checks assert the exact bytes that reach the style attribute.

Load-bearing details:

- **`MIN_SPAN = 240`** floors the scroll distance. A card measured at zero height
  — mid-layout, or while the board is loading — otherwise divides by zero and
  the takeover completes on the first pixel of scroll.
- **Insets are floored at zero.** The card's top goes negative once it scrolls
  past, and a negative inset is not a wider window: it makes the gradient stops
  run backwards, and `clip-path` treats the whole value as invalid.
- **Values are rounded to 2dp.** Real `getBoundingClientRect()` returns
  fractional pixels, and easing multiplies them into `621.9281249999999`.
- **Progress is clamped and smoothstepped**, so the takeover arrives rather than
  stopping dead, and scrolling past the end cannot push it beyond 1.
- **Parallax is capped at 120px**, so the sky trails the page without drifting
  out of its own frame.

Only `clip-path`, `transform` and `opacity` change — no layout, and no scroll
event handler. The *progress* is sprung rather than the clip string: a spring
cannot interpolate `inset(…)`, and springing scroll itself makes the window lag
the card it is glued to.

### Guards

The card does not exist while the board is loading, and it reflows when a POD is
switched — so the anchor arrives through **state**, not a ref object. A mutating
ref re-renders nothing, and the backdrop would never measure.

- No card, a zero-sized card, or a non-finite measurement → renders nothing.
- A card removed from the document (`isConnected`) → drops the anchor.
- `ResizeObserver` on the card **and** a window `resize` listener, both torn down.
- Nothing touches `window` during SSR, and the hour is read in an effect — a
  server-time sky would hydrate into a different one.
- Hooks run unconditionally; the anchor check happens after them, on a safe
  1×1 stand-in, so a missing card can never change hook order.
- `pointer-events-none` at `-z-[9]`: it must never intercept a click meant for a
  panel.
- `prefers-reduced-motion` pins the takeover shut and zeroes the parallax — not
  a slower version, none of it.

### The veil, and where the sky is actually visible

A veil of `--plane` sits above the sky and below the panels. Its job is to stop
the sky shouting — **not** to protect text. Every word on the page sits on a
glass panel, and the palette's contrast was validated against `--surface`, not
against this.

It has to scale with the viewport, and the reason is worth stating plainly:

| Viewport | Content column | Open sky (gutters) | Veil at full takeover |
|---|---|---|---|
| 2560 | 1400 | 45% | 0.50 |
| 1920 | 1400 | 27% | 0.50 |
| 1440 | 1400 | **6.1%** | 0.43 |
| 1024 | 1024 | 4.7% | 0.24 |
| 390 (phone) | 390 | 6.2% | 0.18 |

The content column is capped at 1400px, so **a 1440px laptop has as little open
sky as a phone** — this is not a mobile problem, it is a "narrow viewport"
problem, and it starts well above tablet width. Below that cap the only place
the sky shows is *through* the glass, which in dark mode is `rgba(148,190,240,
0.11)` over `rgba(120,170,230,0.045)` — nearly transparent, and blurred 26px.
A 0.5 veil there is the difference between a sky and a flat panel.

`veilAt(progress, viewportWidth)` therefore ramps its ceiling from 0.18 at
≤900px to 0.50 at ≥1600px, and starts at 40% of that before the takeover begins.

## The footer

[`footer.tsx`](../src/components/footer.tsx) states only what the page actually
knows: items tracked, PODs, and the last sync as a relative time. No invented
links, no social icons, no `href="#"` — a footer full of dead links is the thing
that makes a real tool read as a mockup, which is exactly the complaint it was
built to answer. A check asserts there are none.

## Chrome layout

The top bar is **pinned to `top-0`**, not floated below it. At `top-3` a 12px
gap sat above the bar through which scrolling panels stayed visible, so the bar
read as detached and content appeared to run over it.

The sticky wrapper spans the container's full width (negative margins cancel the
page padding) and carries a blurred backdrop that fades out downward, so content
passes cleanly underneath instead of colliding with the bar's edge. The bar
itself is a normal `.glass` panel inside that wrapper.

## Type

| Role | Face | Used for |
|---|---|---|
| Display | Bricolage Grotesque | headings, panel titles, hero figures |
| Body | IBM Plex Sans | everything else |
| Mono | IBM Plex Mono | work item ids, day counts, axis ticks, ranks |

Plex Sans and Plex Mono are a designed pair; Bricolage supplies the character.
Loaded through `next/font/google` as CSS variables.

`.tnum` (`font-variant-numeric: tabular-nums`) goes on numbers that sit in a
column. Standalone figures stay proportional.

`.eyebrow` is the small mono uppercase label above a panel title. It is a label —
it should say what the panel measures, not decorate it.

## Data palette

Both sets pass the lightness band, chroma floor, colour-vision-deficiency
separation, normal-vision separation and contrast checks against their own
surface.

**Categorical** (`SERIES`), fixed order — the same five hues, stepped per theme:

| Slot | Light (`#f6f9fc`) | Dark (`#172533`) |
|---|---|---|
| 1 brand blue | `#0c70b6` (4.96:1) | `#1393ed` |
| 2 orange | `#d1541f` (3.98:1) | `#d95926` |
| 3 aqua | `#14906a` (3.80:1) | `#199e70` |
| 4 yellow | `#a37000` (4.08:1) | `#c98500` |
| 5 magenta | `#cc5580` (3.84:1) | `#d55181` |

**Every slot clears 3:1 on both surfaces.** Light did not always: aqua, yellow
and magenta sat between 2 and 3 — the yellow at **2.05:1** — under a documented
*relief rule*, which permitted a mark under 3:1 as long as it shipped with a
visible label.

That rule was retired after a projector demo. It is defensible on a monitor and
useless on a wall: a projector has far less effective contrast, the fill simply
disappears, and a label pointing at nothing is not a chart.

The replacements were **re-validated as a set**, not eyeballed — lightness band,
chroma floor, CVD separation and normal-vision separation all pass, and the
colourblind margin came out *better* than before (worst adjacent ΔE 9.6 protan,
against 9.1 previously). Slot order is unchanged.

Labels are still mandatory. They were never only a contrast remedy — they are
what keeps identity off colour alone for a colourblind reader.

> **Slot order is the colourblind-safety mechanism, not a preference.**
> Reordering `SERIES` silently invalidates the validation. If a dimension
> outgrows its slots, fold the tail into "Other" or facet — never generate a
> new hue.

**Severity** uses the reserved status palette, because severity is a state, not
an identity: `Critical #d03b3b`, `Major #ec835a`, `Minor #fab219`,
`Unknown` muted. Status colours are never reused as a series colour, and always
ship with a text label — never colour alone.

**Environment** takes slots 1–4 in release-pipeline order (IT-UAT, BIZ-UAT, CUG,
Production). **Status** takes slots 1–5. **Trend** uses slot 1 for raised and
slot 3 for closed.

**Ageing** is ordinal — one blue hue, monotone lightness, with the oldest bucket
carrying the most presence against its own surface. The direction therefore
**reverses** between themes:

| Bucket | Light | Dark |
|---|---|---|
| 0–3 days | `#3394e5` (3.05:1) | `#08609d` |
| 4–7 days | `#0f80d0` | `#0f80d0` |
| 8–14 days | `#08609d` | `#38a4fd` |
| 15–30 days | `#04426f` | `#93cafe` |
| 30+ days | `#012847` | `#d0e8ff` |

This ramp is pure brand blue in both directions — it is where the identity reads
most strongly on the board.

Both clear the ordinal gates: monotone lightness, adjacent ΔL ≥ 0.06, and the
step nearest the surface above 2:1. The steps are deliberately spread — bunching
them fails the adjacent-ΔL check and the ramp stops reading as a direction.

`ageTint(days)` maps a single day count to a heat colour for leaderboard rows and
item lists.

### Re-validating

`pnpm check:theme` covers token coverage, block drift, text contrast, ramp
monotonicity and the light end of the ramp. It does **not** replace the dataviz
validator — that is the authority on CVD separation. Re-run it from the skill
whenever a data colour or a surface changes:

```bash
node scripts/validate_palette.js "#0c70b6,#d1541f,#14906a,#a37000,#cc5580" \
  --mode light --surface "#f6f9fc"
node scripts/validate_palette.js "#1393ed,#d95926,#199e70,#c98500,#d55181" \
  --mode dark  --surface "#172533"
node scripts/validate_palette.js "#3394e5,#0f80d0,#08609d,#04426f,#012847" \
  --mode light --surface "#f6f9fc" --ordinal
node scripts/validate_palette.js "#08609d,#0f80d0,#38a4fd,#93cafe,#d0e8ff" \
  --mode dark  --surface "#172533" --ordinal
```

All eight sets (categorical, 4-slot environment, 2-series trend, ordinal ageing —
each in both themes) currently pass.

Fix every FAIL before shipping. A contrast WARN obligates visible labels.

## Chart rules

Charts are hand-written SVG. No chart library — the mark specs below are easier
to hit directly than to fight a library's defaults, and the bundle stays small.

- **One y-axis.** Two measures of different scale become two charts.
- **Colour follows the entity, never its rank.** A filter that changes which
  series are present must not repaint the survivors. This is why
  `breakdown-card.tsx` renders rows in a fixed `ORDER` rather than sorted by
  count.
- Two or more series get a legend; up to four also get direct labels, so identity
  never rests on colour alone.
- Marks: 2px lines, ~4px rounded data-ends, hover markers ≥5px radius with a 2px
  surface ring, 2px gaps between stacked segments, recessive grid.
- Line and area charts get a crosshair and tooltip; bar and cell charts get
  per-mark hover.
- Empty buckets are rendered, not skipped — a line that jumps a gap
  misrepresents the shape.

## Motion

framer-motion. The rule is that motion should explain, then get out of the way.

- Panels enter on `whileInView` with `once: true`. Never re-animate on scroll-back.
- List stagger ~0.045s per row, with a capped total delay so long lists do not
  crawl in.
- Bars and rings animate from zero on first view only.
- The parallax backdrop is `fixed`, `pointer-events-none`, `-z-10`, driven by a
  spring-damped pointer position and scroll offset. It must never intercept a
  click.
- The drill drawer is a spring (`stiffness: 320, damping: 34`), closable with
  Escape and by clicking the scrim.

`useReducedMotion()` disables parallax and count-ups; global CSS collapses
durations under `prefers-reduced-motion`. Every new animation honours one of the
two.

## Accessibility floor

Non-negotiable regardless of how the visuals evolve:

- Visible keyboard focus, set globally on `:focus-visible` with the accent colour.
- `aria-label` on icon-only buttons; `sr-only` labels on bare selects.
- `role="img"` and a summary label on each chart `<svg>`.
- `aria-hidden` on decorative swatches and the backdrop.
- Severity and status never carried by colour alone.
- Responsive to mobile; wide tables scroll inside their own container rather than
  making the page scroll sideways.

## Copy

Plain, active, specific. A button says what happens — "Sync", not "Submit" — and
keeps the same word through the flow. Errors say what went wrong and what to do:
"Pick the POD this file belongs to." Empty states are an invitation to act, not
an apology. Error strings from route handlers render directly in a toast, so
they are written as user-facing prose at the point they are thrown.

## The top bar, and the "For you" menu

The bar had grown to nine controls in a row: an icon wall where every button
looked equally urgent, nothing had room for a label, and on a phone it squeezed
the search box to zero width.

The split is by **what a control does**, not by how often it is used:

| | Desktop | Phone |
|---|---|---|
| POD picker | on the bar | in the menu |
| Kind filter | on the bar | in the menu |
| Search | on the bar | on the bar, own row |
| Theme | on the bar | on the bar |
| Sign out | on the bar | on the bar |
| Sync · Report · Upload · Admin | **in the menu** | **in the menu** |

*Filters* change what the board is showing; they stay in reach where there is
room. *Actions* do something to it; they live behind one trigger at every size.
What is left on a phone is what a reader needs at a glance — find something,
change the light, get out.

Inside the menu each action gets its name and a line of explanation, which is
where the upload format and the last sync time actually belong. On a button they
had to hide in a `title` attribute.

### It is a menu, not a div that toggles

`Menu` in [`ui.tsx`](../src/components/ui.tsx):

- `aria-haspopup="menu"` and `aria-expanded` on the trigger; `role="menu"` and
  `role="menuitem"` on the panel and its rows.
- **Escape closes it and returns focus to the trigger.** Without the second half
  focus lands on `<body>` and the next Tab starts from the top of the page.
- Arrow keys move between rows and wrap; Home and End jump to the ends; disabled
  rows are skipped.
- Opening with the keyboard lands on the first row. Opening with a pointer does
  not — that would yank the cursor's place.
- Dismissal listens on **`pointerdown`, not `click`**: a click fires after the
  control it landed on has already run, so an outside press would act *and*
  leave the menu open.
- A row with an `href` renders as an anchor, so Admin and the report download are
  right-clickable and openable in a new tab.

It springs open from the trigger's corner and the chevron turns. Under
`prefers-reduced-motion` all three of `initial`, `animate` and `exit` collapse to
a plain fade — a check asserts all three, because testing for the pattern
anywhere passed while `initial` animated regardless.

The panel is `w-[min(19rem,calc(100vw-1.5rem))]`. A fixed 19rem panel anchored
right runs off the left edge of a 320px phone.

### Two of everything, deliberately

The POD picker and kind filter exist twice — once on the bar, once in the menu —
because a single instance cannot be in two layouts at once. Both write to the
same state, and both carry **distinct ids**: `pod-picker` / `pod-picker-menu`,
and `kind-filter` / `kind-filter-menu`. Two `SegmentedControl`s sharing a
`layoutId` would animate one pill flying between the bar and the open menu.

### The panel is opaque, and it stays on screen

Two things a dropdown must get right that a styled `div` does not.

**Opaque.** The menu uses `--panel`, not `.glass`. Glass is for surfaces you look
*at*; a menu sits temporarily *on top of* other content, and one you can read the
dashboard through is unreadable. `--panel` is documented as "solid popovers,
drawers, menus" — this is the case it exists for. The border and shadow still
come from the glass tokens so it belongs to the same family.

**On screen.** The trigger is at the **left** of the bar on a phone and near the
**right** on a desktop, so a single anchor sends the panel off one edge or the
other — right-anchored, a 19rem panel hung off the left of a 400px screen with
its labels cut in half.

Two mechanisms, because one is not enough:

1. The anchor flips by breakpoint: `left-0 sm:right-0 sm:left-auto`.
2. A measured nudge catches whatever the anchor does not. On open, the panel's
   rect is compared against `documentElement.clientWidth` — usable width, not
   `innerWidth`, which counts the scrollbar — and an `x` offset brings it back
   inside with a 12px margin.

The measurement runs in `useLayoutEffect`, so it happens **before paint** and the
panel is never seen in the wrong place. The offset is applied through framer's
`x`, which composes with the existing `scale` and `y` rather than fighting them —
so it must be on `initial` *and* `animate`, or the panel measures correctly and
then animates away from the position it measured.

## The search box

Two things make it feel different from the native `<datalist>` it replaced.

**It does not query on every keystroke.** The input is instant; the search that
reaches the server is debounced by 250ms. Typing "Ananya" used to fire six
requests, each re-keying SWR and re-rendering every panel underneath — which was
most of what made it feel heavy. Picking a suggestion searches *immediately*
rather than waiting out the debounce, because the intent is unambiguous.

**The suggestions are ours.** A `<datalist>` matches differently in every
browser — Chrome anywhere in the string, Safari only from the start — and neither
shows which part matched. A list you cannot predict is worse than no list,
because you stop trusting it and type the whole name anyway.

Ranking, in [`lib/suggest.ts`](../src/lib/suggest.ts), is three tiers:

| | Match | "rao" offers |
|---|---|---|
| 0 | the whole name starts with it | **Rao**saheb Kulkarni |
| 1 | a word starts with it | Ananya **Rao** |
| 2 | it appears anywhere | Anai**rao**m |

Ties break alphabetically, so the list never reorders itself between two equally
good matches. The matched run is returned as an offset and length, and shown in
the row — so the reason a name is in the list is visible rather than guessed.

An empty query offers the board rather than nothing: focusing an empty box and
seeing who is on it is how a reader discovers the box takes names at all.

It is a **combobox**, said properly: `aria-expanded`, `aria-controls`,
`aria-activedescendant` on the input, `role="listbox"` and `role="option"` on the
list. Focus never leaves the input — the highlight moves instead — which is what
lets typing continue while arrowing through matches.

Two details that are easy to get wrong:

- Choosing a row listens on **`mousedown`, not `click`**. The input blurs first
  on click, closing the list before the choice registers.
- **Escape closes the list; a second Escape clears the search.** Doing both in
  one keystroke throws away a query somebody meant to keep.
