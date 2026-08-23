# POD Tracker knowledgebase

Reference for working on this codebase. [`README.md`](../README.md) at the root
is the user-facing guide — how to run it, connect Azure, upload a sheet. These
pages are the internals.

| Page | Answers |
|---|---|
| [../START-HERE.md](../START-HERE.md) | **The friendly tour.** What it is, how to set it up, and why it works the way it does. Start here if you are new. |
| [rebuilding.md](rebuilding.md) | **The spec, in build order.** Hand this to an LLM to rebuild the project or to orient it before a fix. |
| [architecture.md](architecture.md) | How a request becomes a number on screen. Module map, layering rules. |
| [data-model.md](data-model.md) | Documents, indices, id schemes, the vocabulary, ageing. |
| [metrics.md](metrics.md) | Every tile and chart, and the aggregation behind it. |
| [azure-integration.md](azure-integration.md) | REST calls, WIQL, field mapping, the three live-update paths. |
| [auth-and-tenancy.md](auth-and-tenancy.md) | Auth modes, roles, how POD scoping is enforced. |
| [design-system.md](design-system.md) | Tokens, type, the validated palette, motion, accessibility. |
| [operations.md](operations.md) | Environment variables, running, seeding, deploying. |
| [excel-upload.md](excel-upload.md) | The spreadsheet format, column by column — and the download that round-trips through it. |
| [troubleshooting.md](troubleshooting.md) | Symptoms → causes, including bugs already fixed here. |
| [decisions.md](decisions.md) | Why the non-obvious choices were made, and what would change them. |

## The 60-second version

Azure Boards (or an Excel upload) → normalised into one flat `Item` document →
OpenSearch → one aggregation query fills the whole dashboard → every count is
clickable through to the work items behind it.

Multiple PODs share the instance. Admins see all of them; members see only the
PODs assigned to them, enforced server-side.

```
 Azure DevOps ──REST──┐
                      ├─► normalize.ts ─► OpenSearch ─► metrics.ts ─► /api/metrics ─► dashboard
 Excel / CSV ─upload──┘                        ▲                  └─► /api/items  ─► drill drawer
                                               │
                          poller · webhook · manual sync
```

## Where things live

```
src/lib/          domain and data. No React, server-only
  opensearch.ts   client, index bootstrap, narrowed search, bulk upsert
  mappings.json   index mappings, shared with scripts/seed.mjs
  metrics.ts      every tile and chart in one aggregation; drill-down listing
  azure.ts        WIQL + workitemsbatch
  normalize.ts    Azure work item / spreadsheet row → Item
  sync.ts         watermarked incremental sync, webhook team routing
  poller.ts       background timer
  teams.ts users.ts   document CRUD
  session.ts      auth helpers, errorResponse
  http-error.ts   HttpError — its own module so the domain layer can throw
                  without importing the auth stack
  api.ts          request → scoped Filters  ← the security boundary
  types.ts        vocabulary, clampThreshold      (client-safe)
  palette.ts      validated data colours as CSS variables (client-safe)
  greeting.ts     phase of day, first name from an email  (client-safe, pure)
  sky.ts          scene geometry, sun/moon placement, tonight's real moon
                  phase and its shadow path              (client-safe, pure)
  weather.ts      optional Open-Meteo lookup; returns null unless
                  WEATHER_LAT/WEATHER_LON are set — never a guess
  takeover.ts     the scroll takeover: card rect → viewport, as a clip-path
                                                         (client-safe, pure)
  validation.ts   what a form must satisfy before it is worth sending; the
                  server re-checks everything    (client-safe, pure)
  spreadsheet.ts  what an uploaded file actually is, from its bytes — so a
                  CSV from Numbers or Sheets works without Excel installed
                                                         (client-safe, pure)
  numbers.ts      reads Apple Numbers files: zip, Snappy, IWA, Protobuf, so a
                  Mac with no Excel uploads what it already has  (server-only)
  suggest.ts      ranks the names offered under the search box
                                                         (client-safe, pure)
  health.ts       the board score: the share of tracked items that are closed
                                                         (client-safe, pure)
                                                         (client-safe, pure)
  constants.ts    every tunable literal that is not an environment variable
  roster.ts       folds a POD's roster into the leaderboard, so an onboarded
                  person with no items shows as a zero rather than vanishing
                                                         (client-safe, pure)

src/app/api/      route handlers, Node runtime
src/app/          / dashboard · /admin (page + admin-client)
                  /login (page + login-form)
  layout.tsx      fonts, theme pre-paint script, viewport theme colour
  globals.css     the two theme token blocks, glass recipe, keyframes
src/components/   client components, dashboard-client.tsx orchestrates
  drill-drawer    the one detail surface every panel opens
  drill-filters   the drawer's own filter bar
  health-dial     the draggable score ring (role="slider", display-only)
  greeting        the card: whose name, what hour, and what to draw
  greeting-scene  the world it looks out on: ground, weather, sun, moon
  greeting-cast   the animals, one small SVG each
  sky-backdrop    the card's sky, opening from its rect to fill the page
  search-box      the board search: debounced query, ranked suggestions
  footer          what the page knows: tracked, PODs, last sync
  theme-toggle    light / system / dark, plus the pre-paint script
  ui              Panel, PanelHeader, CountUp, Button, SegmentedControl
scripts/
  seed.mjs        indices + admin + demo data
  check.mjs       316 end-to-end checks against a running server
  check-theme.mjs 183 static checks: theme tokens, contrast, source rules
  check-ui.mjs    1166 checks on client-side pure logic — it imports the real
                  modules, so breaking one fails the suite
  brand-ramp.mjs  regenerate the brand blue OKLCH ramp
  check-docs.mjs  these pages still match the code
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
