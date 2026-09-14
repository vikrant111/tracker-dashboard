<div align="center">

# 🚀 POD Tracker

**Two boards, one shell.**
How bad is the bug pile — and can I push to `develop` right now?

`Next.js 15` · `React 19` · `TypeScript strict` · `Tailwind v4` · `JSON or MongoDB`

**Zero configuration to first run.** Clone, `pnpm install`, `pnpm dev`. No database, no account, no keys.

</div>

---

## 🎯 What this is

Two dashboards that answer two questions nobody could answer with a straight face before.

<table>
<tr>
<th width="50%">📊 The POD board &nbsp;<code>/</code></th>
<th width="50%">🔀 The DevOps board &nbsp;<code>/devops</code></th>
</tr>
<tr valign="top">
<td>

> 😰 "we have like… 40 open?"
> 😬 "no, 106 — I counted Tuesday"
> 🙃 "counted *what*, exactly?"

Every bug, ticket and CR across every team, pulled from **Azure Boards** or a
spreadsheet you drag in. One honest number, and every number clicks through to
the rows behind it.

**Ageing is the point.** Not "how many bugs" — *how long has this been sitting
there*.

</td>
<td>

> 😵 "is develop frozen?"
> 😐 "…ask Raj?"
> 🫠 "Raj is on leave"

Which branch is locked, what went out in this release, and **which changes
reached the release branch without anybody signing them off**.

**The sign-off report is the point.** Everything else on it is context for
finding those rows.

</td>
</tr>
</table>

A **POD** is just a team. Yours might call them squads or "the payments lot".
Here they're PODs. 🫛

---

## 🏛️ Architecture at a glance

One Next.js app is the frontend *and* the backend. Everything reaches storage
through a single `Store` interface, so the same code serves files or a database.

```mermaid
graph TB
    subgraph sources["📥 Where data comes from"]
        AZ["🔷 Azure Boards<br/><i>work items</i>"]
        GH["🐙 GitHub<br/><i>pull requests · branch rules</i>"]
        XL["📗 Spreadsheet<br/><i>xlsx · csv · Numbers</i>"]
    end

    subgraph app["⚡ Next.js 15 — one process"]
        RSC["🖥️ Server Components<br/><i>pages, auth gates</i>"]
        API["🔌 Route handlers<br/><i>/api/*</i>"]
        CTRL["🧠 Controllers<br/><i>aggregate · shape</i>"]
        LIB["📐 lib/ — pure rules<br/><i>no React, no I/O</i>"]
    end

    subgraph store["💾 One interface, two drivers"]
        IFACE["Store"]
        JSON["📄 DB_store/*.json<br/><b>default — nothing to install</b>"]
        MONGO["🍃 MongoDB<br/><i>DB_DRIVER=mongodb</i>"]
    end

    UI["🎨 Client components<br/><i>SWR · framer-motion</i>"]

    AZ --> API
    GH --> API
    XL --> API
    RSC --> UI
    UI <-->|JSON over fetch| API
    API --> CTRL --> IFACE
    RSC --> CTRL
    CTRL -.->|asks| LIB
    API -.->|asks| LIB
    IFACE --> JSON
    IFACE --> MONGO
```

### The rule the whole project is built on

> **One number, computed once.**
>
> Every tile, chart and drill-down on a board comes from **one** aggregation over
> **one** set of rows. Not eight queries that each round differently — a bar
> saying 45 above a drawer listing 42 is the one bug this project exists not to
> have.
>
> The driver *fetches*. It never aggregates. That is why files and MongoDB
> cannot disagree.

### What it refuses to do

| ❌ | Why |
|---|---|
| Invent weather it doesn't know | No coordinates → no weather. Never a guess drawn as fact. |
| Freeze a branch by accident | GitHub writes are **dry-run by default**. `live` is opt-in, per deployment. |
| Delete on a malformed request | An empty period matches **nothing**, not everything. |
| Trust the browser | Every gate is re-checked server-side. Hiding a button is not a permission. |

---

## ⚡ Quick start

```bash
pnpm install
pnpm dev          # → http://localhost:3000
```

That is genuinely all. No database, no `.env`, no account — the JSON driver
writes files under `DB_store/`, and the first sign-in creates the admin from
built-in defaults (`admin@example.com` / `changeme`).

```bash
pnpm seed             # demo PODs + work items for the POD board
pnpm seed:devops      # 4 of each kind, per repo, per branch, for the DevOps board
```

> 🔑 **Change the admin password** before anyone else can reach the instance.
> 🧭 **One dev server at a time.** `pnpm predev` refuses a second one — two share
> a `.next` and the browser starts failing with `ChunkLoadError`.

---

## 🗺️ How a request actually flows

Reading the POD board, end to end. The interesting part is that **the aggregation
happens once, above the driver**.

```mermaid
sequenceDiagram
    participant B as 🌐 Browser
    participant P as 🖥️ page.tsx
    participant A as 🔌 /api/metrics
    participant S as 🛡️ lib/api.ts
    participant C as 🧠 controllers
    participant D as 💾 Store

    B->>P: GET /
    P->>P: currentUser() — redirect if not signed in
    P-->>B: shell + the panels
    B->>A: fetch(?teamId=…&kind=…)
    A->>S: accessibleTeams(user)
    Note over S: 🛡️ the security boundary —<br/>a member's filters are narrowed<br/>to the PODs they are assigned
    S-->>A: scoped filters
    A->>C: dashboard(filters)
    C->>D: items.find(filters)
    D-->>C: rows
    Note over C: ONE aggregation →<br/>tiles, chart, leaderboard,<br/>breakdowns, drill-downs
    C-->>A: one payload
    A-->>B: JSON
    B->>B: SWR caches · revalidates on focus
```

`lib/api.ts` is the boundary that matters. A member cannot widen their own scope
by editing a query string, because the scope is **recomputed from the session**,
never read from the request.

---

## 💾 Storage — one interface, two drivers

Switching is **one environment variable**. Nothing else changes, because nothing
else knows.

```mermaid
graph LR
    CODE["📐 Every controller<br/><i>writes through one interface</i>"] --> IF{{"Store"}}
    IF -->|"DB_DRIVER=json<br/><b>default</b>"| J["📄 DB_store/*.json<br/>atomic writes · file lock<br/>mode 0600"]
    IF -->|"DB_DRIVER=mongodb"| M["🍃 MongoDB<br/>indexes · $facet-ready"]
    IF -->|"tests"| MEM["🧪 in-memory"]

    J -.->|"pnpm parity"| CHK{{"same document?"}}
    M -.->|"pnpm parity"| CHK
```

| | `json` | `mongodb` |
|---|---|---|
| Needs installing | **nothing** | a cluster or `pnpm mongo:local` |
| Where it lives | `DB_store/` (or `DB_STORE_DIR`) | `MONGODB_URI` |
| Good for | a laptop, a locked-down machine, a demo | production, more than one server process |
| Writes | temp file + atomic rename, `0600` | replace-by-id, upsert |

Both go through the **same schemas** (`db/document.ts`), so what a file stores is
what MongoDB would store.

**Switching after you have deployed is two commands:**

```bash
pnpm migrate --to mongodb     # move the data (both directions; source untouched)
# then set DB_DRIVER=mongodb and restart
```

The flag alone changes which store the app *uses* — it moves nothing, which is
why `pnpm migrate` exists. It refuses a target that already holds rows, names any
row that will not validate rather than dropping it, and builds MongoDB's indexes
at the end. `pnpm parity` proves the two drivers agree before you trust either.

> 🔒 The JSON files hold password hashes, and access tokens once you onboard
> anything. They are written `0600`, and `pnpm check:env` tells you if git is
> tracking them. See [Data at rest](docs/operations.md).

---

## 🧬 The data model

```mermaid
erDiagram
    TEAM ||--o{ ITEM : "owns"
    TEAM ||--o{ USER : "assigned to"
    REPO }o--o{ TEAM : "worked on by"
    REPO ||--o{ CYCLE : "ships"
    REPO ||--o{ PULL : "merges"
    REPO ||--o{ ANNOUNCEMENT : "posts"
    CYCLE ||--o{ DEPLOYMENT : "scopes"
    PULL |o--o| DEPLOYMENT : "moves onto"

    TEAM {
        string id PK "slug of the name"
        string azure "org · project · PAT"
        int    ageingThresholdDays
    }
    ITEM {
        string workItemId
        date   createdDate "ageing is computed, never stored"
        string severity
        string status
        bool   isActive
    }
    REPO {
        string id PK "owner-repo"
        string releaseBranch
        string developBranch
        string freezeMethod "ruleset | protection | record"
        object freeze "state · reason · who · when"
    }
    CYCLE {
        string id PK "repo + name"
        object scope "frozen? · reason"
    }
    DEPLOYMENT {
        string ticket "joins back to the tracker"
        string branch
        string state "planned→deployed→verified | rolled-back"
    }
    PULL {
        int    number
        string baseBranch
        object signoffs "biz · qa · pod"
        bool   movedToScope "derived, not believed"
    }
```

**Two details worth knowing:**

- 🕰️ **Age is never stored.** It is computed from `createdDate` at query time.
  A stored age is wrong by tomorrow.
- 🔗 **`movedToScope` is a join, not a flag.** Whether a PR is on a sheet is
  *recomputed* from the sheets themselves, so a board in a broken state repairs
  itself the moment somebody opens it.

---

## 🔀 The DevOps flow

The whole point of the second board: a change reaches the release branch, and
somebody has to agree it should have.

```mermaid
stateDiagram-v2
    [*] --> Merged: 🐙 Sync PRs

    Merged --> Risk: missing business or QA
    Merged --> Waiting: missing POD verification
    Risk --> Waiting: sign-off recorded
    Waiting --> Cleared: all three signed

    Cleared --> OnSheet: ➡️ To sheet
    OnSheet --> Returned: admin removes it<br/><i>(a reason is required)</i>
    Returned --> Cleared: fixed, move it again

    OnSheet --> [*]: shipped

    note right of Risk
        🚨 merged without agreement
        sorted to the top, tinted,
        and labelled in words
    end note
    note right of OnSheet
        goes onto the sheet of
        the cycle the PR is
        assigned to — and no other
    end note
```

**A move is refused for exactly one reason at a time,** and the tooltip says
which:

| Refusal | Because |
|---|---|
| Not a DevOps editor | checked **first**, before the PR is even looked up — so a refusal leaks nothing |
| No cycle set | there is no sheet to move it onto until somebody says which |
| Scope frozen | *"This pull request can't be moved — the scope sheet for 2026.09 is frozen: …"* |
| Missing a sign-off | **all three**, not just two. The sheet is the record of what shipped |
| Already moved | it says "On the sheet" rather than offering a button that would refuse |

The rule is **one shared function**, so the disabled button and the API can never
disagree.

### Freezing a branch

```mermaid
flowchart TD
    F["🔒 Freeze develop"] --> M{"GITHUB_MODE"}
    M -->|"dry-run<br/><b>default</b>"| DR["📝 Records it · shows the exact<br/>requests it would send<br/><b>nothing reaches GitHub</b>"]
    M -->|live| K{"freezeMethod"}
    K -->|ruleset| R["POST /rulesets<br/><i>update + deletion + creation</i><br/><b>no bypass actors</b>"]
    K -->|protection| P["PUT /branches/:b/protection<br/><i>lock_branch: true</i>"]
    K -->|record| N["📋 Board-only.<br/>Nothing is enforced."]
    R --> V{"GitHub agreed?"}
    P --> V
    V -->|yes| OK["✅ frozen"]
    V -->|no| BAD["⚠️ failed — with GitHub's own reason.<br/>The board never claims a lock it does not have."]
```

> 🔑 **What the token can do.** Reading PRs needs `Pull requests: Read`. Only
> freezing needs `Administration: write` — and it never pushes, merges, or
> changes a single file. Full breakdown in [devops.md](docs/devops.md).

---

## 🔐 Who can do what

Four rights, kept deliberately apart. Folding any two together would mean handing
out the dangerous one to grant the harmless one.

```mermaid
graph TD
    A["👤 Signed in"] --> R["👀 Read both boards<br/><i>and add a scope row</i>"]
    A --> S["✍️ Record your own sign-off<br/><i>your name, your accountability</i>"]
    E["🛠️ DevOps editor<br/><i>granted per account</i>"] --> C["Correct a saved record"]
    D["🗑️ Can clear data<br/><i>granted per account</i>"] --> X["Clear a period<br/><b>irreversible</b>"]
    AD["👑 Admin"] --> C
    AD --> X
    AD --> AL["Onboard repos · freeze<br/>· sync · manage accounts"]

    style X fill:#7f1d1d,color:#fff
    style AD fill:#1e3a5f,color:#fff
```

- **Adding** a scope row is open to everyone — the person who shipped a change
  knows what it was, and a sheet only some people can fill is a sheet nobody fills.
- **Correcting** one is not. Once written, a record is evidence.
- **Clearing data** is its own right because it is the only irreversible act on
  either board. A DevOps editor does not get it for free.

---

## 🧪 The checks

This project's favourite thing. Seven suites, one command.

```mermaid
graph LR
    T["pnpm test"] --> TS["✅ typecheck"]
    T --> DOC["📚 543 doc checks<br/><i>links · counts · every module mentioned</i>"]
    T --> TH["🎨 1330 theme checks<br/><i>contrast · tokens · source rules</i>"]
    T --> UI["🧠 2884 UI checks<br/><i>pure logic, run not pattern-matched</i>"]
    T --> RN["🖱️ 127 render checks<br/><i>mounted in jsdom, then clicked</i>"]
    T --> BLD["📦 production build"]
    T --> E2E["🌐 641 end-to-end checks<br/><i>own server · own store · own build dir</i>"]
```

```bash
pnpm test                 # everything
pnpm test --no-server     # skip the end-to-end suite
pnpm check:ui             # static, fast, no server
pnpm check:env            # what's broken on this machine, and the fix
```

**Every case corresponds to a bug that was real at some point.** The render suite
exists because a regex proved an expandable row's markup was *written*, not that
it *worked* — it shipped broken twice. The suite now mounts it and clicks.

The end-to-end suite gives itself its own store, its own port **and its own build
directory**, so it cannot touch the `.next` your dev server is reading.

---

## ⚙️ Configuration — env files only

Everything is an environment variable or a reviewed constant. Nothing else to do.

| File | Board | Holds |
|---|---|---|
| `.env.local` | 📊 POD | `DB_DRIVER` · `MONGODB_*` · `AUTH_*` · `AZDO_*` · `SYNC_POLL_SECONDS` · weather |
| `.env.devopsdashboard` | 🔀 DevOps | `DEVOPS_ACCESS` · `GITHUB_MODE` · `GITHUB_TOKEN` · `GITHUB_API_URL` · page size |
| `.env.devopsdashboard.local` | 🔀 DevOps | your **real** token — git-ignored, and it overrides the file above |

> **Where a value belongs.** Anything that differs between deployments, or must
> never be committed, is an env var. Anything that is a *product decision* —
> field caps, page sizes, how long a toast stays up — is a constant in
> `src/lib/constants/`, so changing it is reviewed.

---

## 📜 Scripts

```bash
# run
pnpm dev · pnpm build · pnpm start

# data
pnpm seed               # POD board: admin + demo PODs + work items
pnpm seed:devops        # DevOps board: 4 of each, per repo, per branch
pnpm delete pod-seed    # clear work items, PODs, sync watermarks
pnpm delete devops-seed # clear repos, cycles, scope rows, PRs, announcements
pnpm parity             # do both drivers store the same document?
pnpm migrate --to mongodb   # move every collection between drivers, either way

# housekeeping
pnpm clear              # node_modules, .next, caches — refuses while dev is running
pnpm mongo:local        # a real MongoDB, nothing installed
pnpm azure:probe        # what Azure actually returns, read-only

# checks
pnpm test · pnpm check · pnpm check:ui · pnpm check:theme · pnpm check:docs · pnpm check:env
```

Destructive scripts **count first, print what they found, and ask.** `--dry-run`
counts only; `--yes` skips the question; without a terminal to ask they refuse
rather than assume.

---

## 🗂️ Where the code lives

```
src/
  lib/
    api.ts                 request → scoped filters   🛡️ the security boundary
    metrics/               every tile and chart, in ONE aggregation
    health.ts              the board score: closed ÷ total
    azure.ts               WIQL + workitemsbatch REST
    normalize/             Azure item · spreadsheet row → our shape
    numbers/               a hand-written Apple Numbers reader 🍎
    constants/             product decisions, reviewed in the repo
    devops/                ← the second board's brain, all pure
      signoff.ts             who agreed, and what that means
      to-scope.ts            may this PR move? one shared rule
      period.ts              a year, a month, a day or a from..to range
      purge.ts               count first, then delete
      github-plan.ts         every request it could send, as data
      editors.ts             the four rights
  db/
    store/                 the Store interface + json · mongo · memory
    schemas/               one shape, both drivers
  app/
    page.tsx               📊 POD board          devops/page.tsx  🔀 DevOps board
    admin/                 PODs · accounts       admin/devops/    repos · cycles
    api/                   metrics · items · teams · sync · upload · export ·
                           repos · cycles · deployments · pulls · announcements
  components/
    devops/                the DevOps board's panels
    ui/                    Panel · Button · Tooltip · Menu · surfaces
    greeting*              the time-of-day scene, and its cast 🐿️
    sky-backdrop           real weather, when you give it coordinates
    parallax-backdrop      the drifting orbs behind the glass
scripts/                   seed · seed-devops · delete-seed · clear · 6 check suites
docs/                      the knowledgebase — start at docs/README.md
```

---

## 📚 Where to go next

| | |
|---|---|
| 🏛️ [architecture.md](docs/architecture.md) | how the layers fit together |
| 🔀 [devops.md](docs/devops.md) | the second board, in full |
| 📐 [data-model.md](docs/data-model.md) | every collection and field |
| 📊 [metrics.md](docs/metrics.md) | how each number is computed |
| 🎨 [design-system.md](docs/design-system.md) | tokens, motion, the rules components obey |
| 🔧 [operations.md](docs/operations.md) | env, deploying, backups, data at rest |
| 🔐 [auth-and-tenancy.md](docs/auth-and-tenancy.md) | roles, scoping, sessions |
| 🆘 [troubleshooting.md](docs/troubleshooting.md) | the errors that look like framework bugs and aren't |
| 🧭 [decisions.md](docs/decisions.md) | why things are the way they are |

---

<div align="center">

### 🎉 That's the tour

**Now go click a number.** They all go somewhere.

*Built with an unreasonable number of checks, and one squirrel.* 🐿️

</div>
