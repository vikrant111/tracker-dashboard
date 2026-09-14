/**
 * Fills the DevOps board with enough data to walk the whole flow.
 *
 *   pnpm seed:devops            add it
 *   pnpm seed:devops --reset    clear the DevOps collections first
 *   pnpm seed:devops --dry-run  print what it would write
 *
 * `pnpm seed` covers the POD board and writes nothing here, which is why
 * `pnpm delete devops-seed` used to find nothing to delete.
 *
 * **Four of each kind, per repository, per branch** — and the four are not four
 * copies. Each set walks the vocabulary that decides what a screen does with the
 * row, so every branch of the flow has something to exercise it:
 *
 *   deployments    one per state: planned, deployed, verified, rolled-back
 *   pull requests  one per sign-off shape: all three, missing POD, missing QA, none
 *   announcements  one per kind: release, freeze, hotfix, note
 *
 * Both branches of every repo, so the branch filter and the freeze have two
 * sides to tell apart. Dates are spread across months so the period picker, the
 * from/to range and the purge all have something to select.
 *
 * Deterministic: ids are derived, not random, so running it twice updates the
 * same rows rather than leaving two of everything. It goes through the store,
 * so it fills files or MongoDB according to `DB_DRIVER` and knows neither.
 *
 * It writes **through the store, not the API**, deliberately: the API refuses a
 * row on a frozen cycle, and a frozen cycle is one of the things this exists to
 * give you something to test against.
 */
import { loadEnv } from "./lib/env.mjs";

loadEnv();

const { getStore } = await import("../src/db/store/index.ts");
const { DEPLOY_KINDS, DEPLOY_STATES, deploymentId, cycleId, announcementId, ANNOUNCEMENT_KINDS } =
  await import("../src/lib/devops/types.ts");
const { pullId } = await import("../src/lib/devops/pull-record.ts");
const { ENVIRONMENTS } = await import("../src/lib/types.ts");

const C = process.stdout.isTTY
  ? { dim: "\x1b[2m", ok: "\x1b[32m", warn: "\x1b[33m", off: "\x1b[0m", b: "\x1b[1m" }
  : { dim: "", ok: "", warn: "", off: "", b: "" };

const argv = process.argv.slice(2);
const reset = argv.includes("--reset");
const dryRun = argv.includes("--dry-run");

/** The sign-off shapes, in the order they are interesting to look at. */
const SIGNOFF_SHAPES = [
  { label: "all three", levels: ["biz", "qa", "pod"] },
  { label: "missing POD verification", levels: ["biz", "qa"] },
  { label: "missing QA — a risk", levels: ["biz", "pod"] },
  { label: "none — a risk", levels: [] },
];

/** A day `n` days after the base, as `YYYY-MM-DD`. Pure, so runs match. */
const BASE = Date.UTC(2026, 5, 1); // 1 June 2026
const day = (n) => new Date(BASE + n * 86_400_000).toISOString().slice(0, 10);
const iso = (n) => new Date(BASE + n * 86_400_000).toISOString();

const store = getStore();
await store.init();

const repos = await store.repos.all();
if (repos.length === 0) {
  console.error(
    `\n${C.warn}No repositories to seed.${C.off}\n\n` +
      `  This fills the board for the repositories you have onboarded, rather than\n` +
      `  inventing its own — so what you test is the flow against your real repos.\n\n` +
      `  Onboard one first: Admin → DevOps admin → paste the GitHub URL.\n`,
  );
  await store.close();
  process.exit(1);
}

if (reset && !dryRun) {
  for (const name of ["deployments", "pulls", "cycles", "announcements"]) {
    for (const row of await store[name].all()) await store[name].remove(row.id);
  }
  console.log(`${C.dim}Cleared the DevOps collections.${C.off}`);
}

const written = { cycles: 0, deployments: 0, pulls: 0, announcements: 0 };
const plan = [];

let repoIndex = 0;
for (const repo of repos) {
  /* Two cycles: one open to fill, one frozen so the refusals have something to
     refuse. Names chosen not to collide with cycles already there. */
  const cycles = [
    { name: "2026.06", frozen: false, plannedFor: day(20) },
    { name: "2026.07", frozen: true, plannedFor: day(50) },
  ].map((c) => ({
    id: cycleId(repo.id, c.name),
    repoId: repo.id,
    name: c.name,
    releaseBranch: repo.releaseBranch,
    plannedFor: c.plannedFor,
    scope: c.frozen
      ? { frozen: true, changedAt: iso(51), changedBy: "seed@example.com", reason: "Scope agreed — seeded frozen so the refusals can be tested." }
      : { frozen: false, changedAt: "", changedBy: "", reason: "" },
    createdAt: iso(1),
    updatedAt: iso(1),
  }));

  const openCycle = cycles[0];

  /* Both branches, so the branch filter and the freeze have two sides. */
  const branches = [...new Set([repo.releaseBranch, repo.developBranch].filter(Boolean))];
  const pods = Array.isArray(repo.teamIds) ? repo.teamIds : [];

  for (const cycle of cycles) {
    plan.push(`cycle        ${cycle.id}${cycle.scope.frozen ? " (frozen)" : ""}`);
    if (!dryRun) await store.cycles.save(cycle);
    written.cycles++;
  }

  let branchIndex = 0;
  for (const branch of branches) {
    const seed = repoIndex * 100 + branchIndex * 10;

    /* --- four scope rows: one per state ---------------------------------- */
    for (const [i, state] of DEPLOY_STATES.entries()) {
      const at = BASE + (seed + i) * 86_400_000;
      const row = {
        id: deploymentId(repo.id, at),
        repoId: repo.id,
        /* Left blank on a repo linked to no POD — which is worth having, since
           it is what the POD column's fallback is for. */
        teamId: pods[i % Math.max(1, pods.length)] ?? "",
        cycleId: openCycle.id,
        branch,
        environment: ENVIRONMENTS[i % ENVIRONMENTS.length],
        kind: DEPLOY_KINDS[i % DEPLOY_KINDS.length],
        state,
        ticket: String(41000 + seed + i),
        title: `[${DEPLOY_KINDS[i % DEPLOY_KINDS.length]}] ${branch} — ${state} row for ${repo.name}`,
        prUrl: "",
        pullId: "",
        author: "seed@example.com",
        notes: `Seeded: ${state} on ${branch}.`,
        /* A planned row has no deploy date yet — that is what planned means. */
        deployedOn: state === "planned" ? "" : day(seed + i + 3),
        createdAt: iso(seed + i),
        updatedAt: iso(seed + i),
      };
      plan.push(`deployment   ${row.id}  ${branch}/${state}`);
      if (!dryRun) await store.deployments.save(row);
      written.deployments++;
    }

    /* --- four pull requests: one per sign-off shape ----------------------- */
    for (const [i, shape] of SIGNOFF_SHAPES.entries()) {
      const number = 9000 + seed + i;
      const signoffs = {};
      for (const level of shape.levels) signoffs[level] = { by: "seed@example.com", at: iso(seed + i + 2) };

      const pull = {
        id: pullId(repo.id, number),
        repoId: repo.id,
        teamId: pods[i % Math.max(1, pods.length)] ?? "",
        /*
         * The last of the four is left with no cycle on purpose: moving it must
         * refuse until somebody sets one, and that refusal needs a subject.
         */
        cycleId: i === SIGNOFF_SHAPES.length - 1 ? "" : openCycle.id,
        number,
        title: `[${41000 + seed + i}] ${branch} — ${shape.label}`,
        url: `https://github.com/${repo.owner}/${repo.repo}/pull/${number}`,
        author: "seed-dev",
        baseBranch: branch,
        mergedAt: iso(seed + i + 1),
        mergedOn: day(seed + i + 1),
        deployedOn: i % 2 === 0 ? day(seed + i + 4) : "",
        environment: i % 2 === 0 ? ENVIRONMENTS[i % ENVIRONMENTS.length] : "",
        ticket: String(41000 + seed + i),
        signoffs,
        movedToScope: false,
        returned: { at: "", by: "", remarks: "" },
        syncedAt: iso(seed + i + 1),
      };
      plan.push(`pull         ${pull.id}  ${branch}/${shape.label}`);
      if (!dryRun) await store.pulls.save(pull);
      written.pulls++;
    }

    /* --- four announcements: one per kind --------------------------------- */
    for (const [i, kind] of ANNOUNCEMENT_KINDS.entries()) {
      const at = BASE + (seed + i) * 86_400_000;
      const post = {
        id: announcementId(repo.id, at),
        repoId: repo.id,
        branch,
        kind,
        title: `${kind} on ${branch} — ${repo.name}`,
        body: `Seeded ${kind} announcement for ${branch}, so the board has one of each kind to read.`,
        author: "seed@example.com",
        /* One pinned per branch, so the ordering rule has something to order. */
        pinned: i === 0,
        createdAt: iso(seed + i),
      };
      plan.push(`announcement ${post.id}  ${branch}/${kind}`);
      if (!dryRun) await store.announcements.save(post);
      written.announcements++;
    }

    branchIndex++;
  }
  repoIndex++;
}

await store.close();

console.log(`\n${C.b}${dryRun ? "Would seed" : "Seeded"} the DevOps board${C.off} ${C.dim}${store.describe()}${C.off}\n`);
for (const repo of repos) console.log(`  ${C.dim}${repo.name}${C.off}  ${repo.releaseBranch} · ${repo.developBranch}`);
console.log("");
for (const [what, n] of Object.entries(written)) console.log(`  ${String(n).padStart(3)}  ${what}`);

if (dryRun) {
  console.log(`\n${C.dim}${plan.slice(0, 12).join("\n")}${plan.length > 12 ? `\n  … and ${plan.length - 12} more` : ""}${C.off}`);
  console.log(`\n${C.ok}Dry run — nothing was written.${C.off}\n`);
} else {
  console.log(`\n${C.ok}Done.${C.off} ${C.dim}\`pnpm delete devops-seed\` clears it again.${C.off}\n`);
}
