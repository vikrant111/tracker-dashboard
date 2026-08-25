# AGENTS.md

Pointer file, so any coding agent lands in the same place. Nothing is duplicated
here — follow the links.

**Read first:** [`.github/copilot-instructions.md`](.github/copilot-instructions.md)
— golden rules, repo shape, conventions, and the table of things that looked
right and were not. VS Code Copilot loads it automatically.

**Then the page matching your task**, from [`docs/`](docs/README.md):

| Doing | Read |
|---|---|
| Changing what is fetched, mapped or shown | [changing-the-data.md](docs/changing-the-data.md) — a recipe book: which files, in what order |
| Understanding the whole thing | [architecture.md](docs/architecture.md) · [data-model.md](docs/data-model.md) |
| Touching a number | [metrics.md](docs/metrics.md) |
| Touching Azure or import | [azure-integration.md](docs/azure-integration.md) · [excel-upload.md](docs/excel-upload.md) |
| Touching auth or scoping | [auth-and-tenancy.md](docs/auth-and-tenancy.md) |
| Touching anything visual | [design-system.md](docs/design-system.md) |
| Deploying or debugging | [operations.md](docs/operations.md) · [troubleshooting.md](docs/troubleshooting.md) |
| Wondering why something is the way it is | [decisions.md](docs/decisions.md) |
| Setting it up on a locked-down machine | [restricted-environments.md](docs/restricted-environments.md) — certificates, no Docker, offline |
| Rebuilding this from scratch | [rebuilding.md](docs/rebuilding.md) |

Path-scoped rules in [`.github/instructions/`](.github/instructions/) load
automatically in VS Code when a matching file is open — API and auth, Azure
integration, OpenSearch, UI and charts, and how the check suites are written.

**pnpm, never npm.**

## Before you finish

```bash
pnpm exec tsc --noEmit   # must be clean — fastest way to find what a change missed
pnpm test                # every suite in one command; starts a dev server if needed
pnpm build               # must pass (stop `pnpm dev` first)
```

`pnpm test` runs four suites, and each can be run alone:

| Command | Covers | Needs a server |
|---|---|---|
| `pnpm check:ui` | client-side pure logic | no |
| `pnpm check:theme` | the light/dark token system, contrast, source rules | no |
| `pnpm check:docs` | the knowledgebase still matches the code | no |
| `pnpm check` | aggregation/drill-down agreement, validation, POD scoping | yes |

Every case corresponds to a bug that was once real, so a failure means something
regressed rather than that the check is fussy. Add a case whenever you fix a bug
— [operations.md](docs/operations.md#verifying-a-change) has the detail, and
`.github/instructions/checks.instructions.md` covers how to write one that can
actually fail.

**Then break the code on purpose and confirm your new check fails.** A check
that cannot fail is worse than none, because it is trusted.

## The four things most likely to be got wrong

1. **Team scope** is enforced in `filtersFromRequest()` and nowhere else. Never
   widen it, never reimplement it.
2. **`date_range` buckets** are lower-inclusive, upper-exclusive. Drill-downs
   must mirror that with `gte` / `lt`, and every number must return exactly the
   count it displays.
3. **Slot order in `src/lib/palette.ts`** is validated colourblind-safety, not
   taste. Do not reorder it, and never hardcode a colour or a `white/10` in a
   component — those are dark-mode assumptions that break the light theme.
4. **Matching a board's words** is word-bounded, never `includes()`. A key like
   `it` is a substring of "microsites", and that mislabelled a whole board.
