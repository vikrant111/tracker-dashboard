# POD Tracker knowledgebase

Reference for working on this codebase. [`README.md`](../README.md) at the root
is the user-facing guide — how to run it, connect Azure, upload a sheet. These
pages are the internals.

| Page | Answers |
|---|---|
| [../README.md](../README.md) | **The friendly tour.** What it is, how to set it up, and why it works the way it does. Start here if you are new. |
| [rebuilding.md](rebuilding.md) | **The spec, in build order.** Hand this to an LLM to rebuild the project or to orient it before a fix. |
| [architecture.md](architecture.md) | How a request becomes a number on screen. Module map, layering rules. |
| [data-model.md](data-model.md) | Documents, indices, id schemes, the vocabulary, ageing. |
| [metrics.md](metrics.md) | Every tile and chart, and the aggregation behind it. |
| [changing-the-data.md](changing-the-data.md) | **Recipes for changing what the dashboard fetches, maps and shows.** Which files, in what order, and what breaks if you skip one. |
| [azure-integration.md](azure-integration.md) | REST calls, WIQL, field mapping, the three live-update paths. |
| [auth-and-tenancy.md](auth-and-tenancy.md) | Auth modes, roles, how POD scoping is enforced. |
| [design-system.md](design-system.md) | Tokens, type, the validated palette, motion, accessibility. |
| [operations.md](operations.md) | Environment variables, running, seeding, deploying. |
| [excel-upload.md](excel-upload.md) | The spreadsheet format, column by column — and the download that round-trips through it. |
| [troubleshooting.md](troubleshooting.md) | Symptoms → causes, including bugs already fixed here. |
| [restricted-environments.md](restricted-environments.md) | A corporate laptop: TLS interception, no Docker, no internet. Start with `pnpm check:env`. |
| [decisions.md](decisions.md) | Why the non-obvious choices were made, and what would change them. |

## The 60-second version

Azure Boards (or an Excel upload) → normalised into one flat `Item` document →
MongoDB → one aggregation fills the whole dashboard → every count is
clickable through to the work items behind it.

Multiple PODs share the instance. Admins see all of them; members see only the
PODs assigned to them, enforced server-side.

```
 Azure DevOps ──REST──┐
                      ├─► normalize.ts ─► MongoDB ─► dashboard.controller ─► /api/metrics ─► board
 Excel / CSV ─upload──┘                        ▲                  └─► /api/items  ─► drill drawer
                                               │
                          poller · webhook · manual sync
```

## Where things live

```
src/db/           MongoDB: how the data is stored and reached
  connect.ts      one cached connection; every entry point awaits it. Cached on
                  globalThis because Next re-evaluates modules on hot reload
                  while the connection survives
  uri.ts          env -> connection string, and what it refuses (pure, testable)
  constants/
    collections   collection names and the prefix that shares one cluster
    connection    timeouts, pool size, and why buffering is off
  schemas/
    item.schema   the work item. Dates are Date, ids are ours, strict
    team.schema   a POD, with its Azure connection and value overrides
    user.schema   an account and the PODs it can see
    sync-state.schema  one watermark per POD
  models/index.ts the compiled models, looked up before compiling so a hot
                  reload cannot throw OverwriteModelError
  query/
    match         Filters -> $match. The one builder both the dashboard and the
                  drill-down use, which is why they cannot disagree
    stages        the reusable pipeline pieces: age, ranks, buckets, histograms

src/controllers/  what routes and lib/* call
  dashboard.controller  the whole board in one $facet
  dashboard.shape       raw facet output -> what the panels render (pure)
  items.controller      drill-down, export cursor, bulk upsert, deletes
  items.shape           stored document <-> domain Item (pure)
  teams.controller      POD persistence
  users.controller      account persistence
  sync-state.controller the sync watermark

src/lib/          domain and data. No React, server-only
  metrics.ts      the dashboard's public surface, over the controller
  metrics/
    types         Filters, Bucket, Dashboard — what the board is described in
    dates         absolute epoch bounds, never relative date math
  azure.ts        WIQL + workitemsbatch
  normalize.ts    Azure work item / spreadsheet row → Item
  normalize/
    vocabulary    a board's own words → ours, in three passes
    columns       the spreadsheet's columns, in both directions
  sync.ts         watermarked incremental sync, webhook team routing
  poller.ts       background timer
  teams.ts users.ts   document CRUD
  session.ts      auth helpers, errorResponse
  auth-secret.ts  refuses to boot on a missing or placeholder AUTH_SECRET
  auth-cookies.ts httpOnly / SameSite / Secure, stated so they can be checked
  session-policy.ts  idle and absolute timeouts, and what ends a session early
  login-throttle.ts  per-account lockout, checked before the bcrypt
  http-error.ts   HttpError — its own module so the domain layer can throw
                  without importing the auth stack
  api.ts          request → scoped Filters  ← the security boundary
  types.ts        vocabulary, clampThreshold      (client-safe)
  value-map.ts    a board's own words → ours; grows with every board that
                  connects                                   (client-safe)
  palette.ts      validated data colours as CSS variables (client-safe)
  greeting.ts     phase of day, first name from an email  (client-safe, pure)
  sky.ts          a barrel over sky/                      (client-safe, pure)
  sky/
    base          Body, and the two clamps both halves need
    geometry      the 400×120 coordinate system, and how it grows
    astronomy     where the sun and moon are, and tonight's real moon phase
  weather.ts      optional Open-Meteo lookup; returns null unless
                  WEATHER_LAT/WEATHER_LON are set — never a guess
  takeover.ts     the scroll takeover: card rect → viewport, as a clip-path
                                                         (client-safe, pure)
  validation.ts   what a form must satisfy before it is worth sending; the
                  server re-checks everything    (client-safe, pure)
  spreadsheet.ts  what an uploaded file actually is, from its bytes — so a
                  CSV from Numbers or Sheets works without Excel installed
                                                         (client-safe, pure)
  numbers.ts      reads Apple Numbers files, so a Mac with no Excel uploads
                  what it already has                            (server-only)
  numbers/
    zip           just enough zip to find the .iwa entries
    snappy        the raw Snappy block, and IWA's framing around it
    protobuf      a schema-less wire-format walk — Apple publishes none
    cells         one cell, one string table, one tile of rows
    types         the value and sheet shapes, and the archive type numbers
  suggest.ts      ranks the names offered under the search box
                                                         (client-safe, pure)
  health.ts       the board score: the share of tracked items that are closed
                                                         (client-safe, pure)
  constants.ts    a barrel over constants/ — every tunable literal that is
                  not an environment variable
  constants/
    storage       LIMITS and PAGE: how big a field may be, how many rows
    timing        toasts, debounces, poll intervals
    auth          SESSION timeouts and the LOGIN lockout
    board         AZURE batching, AGEING thresholds
    scene         the greeting's cast, and how many of each
    spreadsheet   EXPORT columns and UPLOAD limits
  roster.ts       folds a POD's roster into the leaderboard, so an onboarded
                  person with no items shows as a zero rather than vanishing
                                                         (client-safe, pure)

src/fonts/    which typefaces the build uses, picked by FONT_SOURCE in
                  next.config.ts — the switch lives in the bundler because
                  next/font/google downloads at compile time
  google          fetched from Google at build time (the default)
  local           the .woff2 files in files/ — no network, for a machine
                  behind a TLS-inspecting proxy
  system          no web fonts at all; the CSS fallbacks take over
  files/          the vendored latin subset, ~140 KB, refreshed by
                  pnpm fonts:vendor

src/app/admin/
  admin-client    the screen: state, toasts, and which POD is being edited
  panels/
    blank-team    what "New POD" starts from
    field         one labelled input, and the member-row updater
    pod-identity  a POD's name, description and ageing threshold
    pod-members   who is in it
    pod-azure     the Boards connection, field mapping and sync controls
    people-panel  who can sign in, what they see, and their passwords
    add-person-form  the row that adds one
    use-reset-password  an admin setting somebody else's password
    pod-list      every POD, and which one is open

src/app/api/      route handlers, Node runtime
  upload/sheets   one shape for every reader, so the route has one row path
src/app/          / dashboard · /admin (page + admin-client)
                  /login (page + login-form)
  layout.tsx      fonts, theme pre-paint script, viewport theme colour
  error.tsx       what a reader sees when a page throws — never the message,
                  which can carry a cluster URL
  not-found.tsx   a page that is not there
  api/health      liveness and readiness, for a load balancer
  globals.css     the two theme token blocks, glass recipe, keyframes
src/components/   client components, dashboard-client.tsx orchestrates
  drill-drawer    the one detail surface every panel opens
  drill-filters   the drawer's own filter bar
  health-dial     the draggable score ring (role="slider", display-only)
  health-dial-bands  what each score means, and the ring's geometry
  use-dial-scrub  dragging the ring to scrub a hypothetical score
  health-drivers  the three numbers beside the ring; only one moves it
  use-focus-trap  keeps Tab inside an open dialog, Escape closes it
  ageing-spine    open work across the ageing buckets, as one bar
  leaderboard-load-bar  one person's open work split by severity
  skeleton-board  the board's shape before its numbers arrive
  greeting        the sky: places the sun and moon, assembles the scene
  greeting-card   the reader's name and caption over it
  greeting-scene  the world: ground, weather, sun, moon
  greeting-cast   the animals, one small SVG each
  greeting-choreography
                  who is out when, and how each of them moves
  greeting-ground the meadow's depth bands
  greeting-grass  the tufts on them, varied by index rather than at random
  greeting-cast-birds  the crane and the gull — told apart by how they fly
  use-box         an element's measured size, so the sun is not drawn off-frame
  use-debounced   a value that settles before it is used
  use-width       an element's measured width, for charts that draw in pixels
  trend-readout   what the trend crosshair is pointing at
  trend-axis      the gridlines and their labels — one y-scale, never two
  trend-end-labels  where each series' name sits, nudged apart when they collide
  team-rollup-cell    one number in the roll-up, with a tooltip
  team-rollup-detail  a POD's own breakdown, loaded when its row opens
  sky-backdrop    the card's sky, opening from its rect to fill the page
  search-box      the board search: debounced query, ranked suggestions
  change-password the self-service dialog: current password required, focus
                  trapped, fields cleared on open and on success
  footer          what the page knows: tracked, PODs, last sync
  theme-toggle    light / system / dark, plus the pre-paint script
  ui              a barrel over ui/ — every existing `from "./ui"` still works
  ui/
    surfaces      Panel, PanelHeader, Empty
    controls      Button, Chip, SegmentedControl
    count-up      a number that animates into view
    password-field  an input with a reveal control
    menu          the "For you" panel: roving focus, outside-press close
    menu-context  how an item closes the menu it is in
    menu-item     MenuSection and MenuItem
    tooltip       a label that escapes the panel through a portal
scripts/
  seed.mjs        indices + admin + demo data
  check.mjs       330 end-to-end checks against a running server
  check-theme.mjs 728 static checks: theme tokens, contrast, source rules,
                  and the font switch
  check-ui.mjs    1653 checks on client-side pure logic — it imports the real
                  modules, so breaking one fails the suite
  brand-ramp.mjs  regenerate the brand blue OKLCH ramp
  check-docs.mjs  these pages still match the code
  check-env.mjs   `pnpm check:env` — what is broken on THIS machine, and how to
                  fix it: certificates, registry, fonts, the database, config.
                  Written for a corporate laptop; changes nothing
  probe.mjs       reaching a host and saying why it failed — a TLS error and a
                  blocked host need completely different fixes
  vendor-fonts.mjs
                  `pnpm fonts:vendor` — downloads the typefaces into
                  src/fonts/files/ so a build never needs Google
  test.mjs        runs every suite, managing the dev server itself
  lib/
    numbers-fixture.mjs
                  writes .numbers files for the checks, from the zip/Snappy/
                  Protobuf specs — deliberately not from lib/numbers.ts, so a
                  fixture cannot agree with a parser that is wrong
```

Two routes are worth naming because they are a matched pair:
`api/upload` reads a spreadsheet, `api/export` writes one — in the same shape,
from the same `EXPORT_COLUMNS` definition, so a downloaded report can be edited
and uploaded straight back. See [excel-upload.md](excel-upload.md).

Instructions that GitHub Copilot loads automatically live in
[`.github/copilot-instructions.md`](../.github/copilot-instructions.md), with
path-scoped rules in [`.github/instructions/`](../.github/instructions/).
Keep those short; put detail here and link to it.
