# AGENTS.md

Pointer file, so any coding agent lands in the same place. Nothing is duplicated
here — follow the links.

**Read first:** [`.github/copilot-instructions.md`](.github/copilot-instructions.md)
— golden rules, repo shape, conventions, vocabulary, known gotchas.

**Then the page matching your task**, from [`docs/`](docs/README.md):
architecture · data-model · metrics · azure-integration · auth-and-tenancy ·
design-system · operations · troubleshooting · decisions.

Path-scoped rules in [`.github/instructions/`](.github/instructions/) load
automatically in VS Code when a matching file is open.

## Before you finish

```bash
pnpm test             # every suite in one command (starts a server if needed)
pnpm exec tsc --noEmit      # must be clean
pnpm build         # must pass (stop `pnpm dev` first)
pnpm check         # 316 end-to-end checks
pnpm check:theme   # 183 static checks on the light/dark token system
pnpm check:ui    # 1213 checks on client-side pure logic
pnpm check:docs    # the knowledgebase still matches the code
```

`pnpm check` needs `pnpm dev` running in another terminal. It covers
aggregation/drill-down agreement, input validation and POD scoping. Every case
in it corresponds to a bug that was once real, so a failure means something
regressed. Add a case whenever you fix a bug —
[operations.md](docs/operations.md#verifying-a-change) has the detail.

## The three things most likely to be got wrong

1. Team scope is enforced in `filtersFromRequest()` and nowhere else. Never
   widen it, never reimplement it.
2. `date_range` buckets are lower-inclusive, upper-exclusive. Drill-downs must
   mirror that with `gte` / `lt`.
3. Slot order in `src/lib/palette.ts` is validated colourblind-safety, not taste.
   Do not reorder it, and never hardcode a colour or a `white/10` in a
   component — those are dark-mode assumptions that break the light theme.
