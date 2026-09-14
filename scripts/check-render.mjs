/**
 * Do the interactive panels actually render what they claim?
 *
 *     pnpm check:render
 *
 * Every other check on components reads their source and matches a pattern.
 * That proves the wiring is *written*, not that it *works* — and it let an
 * expandable row ship twice that expanded to nothing, because the markup was
 * all present and the bug was in how framer-motion tracked it.
 *
 * So this compiles the components for real, then does two things:
 *
 *  1. **server-renders** them at a given state and asserts what comes out;
 *  2. **mounts them in jsdom and clicks**, which is the only way to catch a bug
 *     that appears after mount rather than in the markup.
 *
 * The second exists because the first was not enough. The expandable row was
 * broken in a way server rendering could not see — the markup was right, and
 * framer-motion's presence tracking held the old row set once it was live. A
 * check that only rendered strings passed the whole time.
 *
 * Compiles with the TypeScript API rather than a bundler, and rewrites the `@/`
 * alias to relative paths afterwards, because Node's ESM resolver knows nothing
 * about tsconfig paths.
 */
import { mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import ts from "typescript";

const ROOT = resolve(fileURLToPath(new URL("../", import.meta.url)));
const SRC = join(ROOT, "src");
const OUT = join(ROOT, ".render-check");

let checks = 0;
let failures = 0;

function check(label, pass, detail = "") {
  checks++;
  if (pass) return;
  failures++;
  console.log(`  \x1b[31m✗\x1b[0m ${label}  \x1b[2m${detail}\x1b[0m`);
}

/* ------------------------------------------------------------ compile */

const files = [];
(function walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (/\.tsx?$/.test(entry.name)) files.push(full);
  }
})(SRC);

rmSync(OUT, { recursive: true, force: true });

for (const file of files) {
  const source = readFileSync(file, "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
      jsx: ts.JsxEmit.ReactJSX,
      esModuleInterop: true,
    },
    fileName: file,
  });

  const to = join(OUT, relative(SRC, file)).replace(/\.tsx?$/, ".js");
  mkdirSync(dirname(to), { recursive: true });

  /*
   * Two rewrites Node needs and tsc does not do:
   *   `@/x`      -> a relative path, since the ESM resolver ignores tsconfig
   *   `./x.ts`   -> `./x.js`, since the emitted files are .js
   * A bare specifier (react, framer-motion) is left alone and resolves normally.
   */
  const fixed = outputText.replace(/(from\s+|import\s*\()(["'])([^"']+)\2/g, (whole, lead, quote, spec) => {
    let next = spec;
    if (spec === "next/link" || spec === "next/navigation") {
      const target = join(OUT, `__next/${spec.split("/")[1]}.js`);
      let shim = relative(dirname(to), target).replace(/\\/g, "/");
      if (!shim.startsWith(".")) shim = `./${shim}`;
      return `${lead}${quote}${shim}${quote}`;
    }
    if (spec.startsWith("@/")) {
      const target = join(OUT, spec.slice(2));
      next = relative(dirname(to), target).replace(/\\/g, "/");
      if (!next.startsWith(".")) next = `./${next}`;
    }
    if (/^\.{1,2}\//.test(next)) next = next.replace(/\.tsx?$/, "") || next;
    if (/^\.{1,2}\//.test(next) && !/\.js$/.test(next)) next = `${next}.js`;
    return `${lead}${quote}${next}${quote}`;
  });

  writeFileSync(to, fixed);
}

/*
 * A directory import (`./ui`) has to land on the file `ui.js`, which the
 * rewrite above already produces. What it cannot fix is a folder that shares a
 * name with a file — `components/ui.tsx` beside `components/ui/` — so the
 * emitted `ui.js` wins, which is what the app's bundler does too.
 */

/*
 * `next/link` and `next/navigation` resolve only inside the framework's own
 * bundler. A component that renders a link is not testing Next, so the imports
 * are pointed at shims: a link becomes an `<a>`, which is what it renders to
 * anyway.
 */
mkdirSync(join(OUT, "__next"), { recursive: true });
writeFileSync(
  join(OUT, "__next/link.js"),
  `import { createElement } from "react";
   export default function Link({ href, children, ...rest }) {
     return createElement("a", { href, ...rest }, children);
   }\n`,
);
writeFileSync(
  join(OUT, "__next/navigation.js"),
  `export const useRouter = () => ({ push() {}, replace() {}, refresh() {}, back() {} });
   export const usePathname = () => "/";
   export const useSearchParams = () => new URLSearchParams();
   export const redirect = () => {};\n`,
);

const load = async (path) => import(pathToFileURL(join(OUT, path)).href);

const { renderToStaticMarkup } = await import("react-dom/server");
const { createElement: h } = await import("react");

/* --------------------------------------------------------------- data */

const pr = (over = {}) => ({
  id: "acme-cms-1", repoId: "acme-cms", cycleId: "c1", number: 1,
  title: "Fix the thing", url: "https://github.com/acme/cms/pull/1", author: "dev",
  baseBranch: "release", mergedAt: "2026-09-04T10:00:00Z", mergedOn: "2026-09-04",
  deployedOn: "", environment: "", ticket: "", teamId: "", signoffs: {}, syncedAt: "", ...over,
});

const render = (el) => {
  try {
    return renderToStaticMarkup(el);
  } catch (err) {
    return `RENDER THREW: ${err instanceof Error ? err.message : err}`;
  }
};

console.log("\n\x1b[1mRendered output\x1b[0m \x1b[2m— components at a given state\x1b[0m\n");

/* ------------------------------------------------- the POD count column */
{
  const { RepoTable } = await load("components/devops/repo-table.js");

  const repo = (over = {}) => ({
    id: "acme-cms", name: "cms", owner: "acme", repo: "cms", url: "https://github.com/acme/cms",
    releaseBranch: "release", developBranch: "develop", teamIds: ["amc-pod", "pay-pod"], token: "",
    freezeMethod: "ruleset",
    freeze: { state: "open", changedAt: "", changedBy: "", reason: "", detail: "", rulesetId: "" },
    createdAt: "", ...over,
  });
  const names = { "amc-pod": "AMC POD", "pay-pod": "Payments POD" };

  const two = render(h(RepoTable, { repos: [repo()], teamNames: names }));
  check("the repo table renders", !two.startsWith("RENDER THREW"), two.slice(0, 200));
  /*
   * The count, not the names. Five chips in a column somebody is scanning for
   * branch state pushed the freeze off to the right.
   */
  check("the POD column shows a count", /aria-haspopup="dialog"/.test(two), "no control to open the names");
  check("...and not the names inline", !two.includes("Payments POD") || two.indexOf("Payments POD") > two.indexOf("<dialog"), "the names are still in the column");
  /* The names are there, in the dialog, ready for the press. */
  check("the names are in the dialog", two.includes("AMC POD") && two.includes("Payments POD"));
  check("...labelled for a screen reader", /PODs registered on cms/.test(two));

  /* Nothing linked is a fact, not a control. */
  const none = render(h(RepoTable, { repos: [repo({ teamIds: [] })], teamNames: names }));
  check("a repo with no PODs says so", none.includes("Not linked"));
  check("...offering nothing to press", !/aria-haspopup="dialog"/.test(none), "a button that can never do anything");

  /* The guards, through the real component rather than the helper. */
  for (const [label, teamIds] of [
    ["missing", undefined],
    ["not an array", "amc-pod"],
    ["null", null],
    ["full of blanks", ["", "  ", null]],
    ["duplicated", ["amc-pod", "amc-pod"]],
  ]) {
    const out = render(h(RepoTable, { repos: [repo({ teamIds })], teamNames: names }));
    check(`teamIds ${label} does not break the table`, !out.startsWith("RENDER THREW"), out.slice(0, 140));
  }

  /* A duplicate is the one that actually bites: two children, one key. */
  const dupes = render(h(RepoTable, { repos: [repo({ teamIds: ["amc-pod", "amc-pod", "amc-pod"] })], teamNames: names }));
  check("duplicates collapse to one chip", (dupes.match(/AMC POD/g) ?? []).length === 1, `${(dupes.match(/AMC POD/g) ?? []).length} chips`);
}

/* ------------------------------------------------- the expandable row */
{
  const { ReportTable } = await load("components/devops/report-table.js");

  /*
   * `cycleFor` rather than one cycle for the table: a pull request goes onto
   * the sheet of the cycle it is assigned to and no other, so the button has to
   * ask per row. The fixture's `pr()` carries `cycleId: "c1"`.
   */
  const cycle = (over = {}) => ({
    id: "c1", name: "2026.09", repoId: "acme-cms", releaseBranch: "release", plannedFor: "",
    scope: { frozen: false, changedAt: "", changedBy: "", reason: "" }, createdAt: "", updatedAt: "", ...over,
  });

  const props = {
    pulls: [pr()],
    repoName: () => "cms",
    cycles: [cycle()],
    busy: "",
    podName: (p) => (p.teamId === "payments-pod" ? "Payments POD" : "AMC POD, Payments POD"),
    podsFor: () => [{ id: "amc-pod", name: "AMC POD" }, { id: "payments-pod", name: "Payments POD" }],
    canEdit: true,
    cycleFor: () => cycle(),
    onMove: () => {},
    onOpen: () => {},
    onToggle: () => {},
    onAnnotate: () => {},
  };

  const shut = render(h(ReportTable, { ...props, openId: null }));
  const open = render(h(ReportTable, { ...props, openId: "acme-cms-1" }));

  check("the report table renders at all", !shut.startsWith("RENDER THREW"), shut.slice(0, 200));
  check("...and the row is there", shut.includes("Fix the thing"));

  /*
   * The thing that was broken. Not "the markup mentions a detail component" —
   * the detail's own fields, in the output, only when the row is open.
   */
  check("a closed row shows no detail", !shut.includes("Where it landed"), "detail leaked into a closed row");
  check("an open row shows the detail", open.includes("Where it landed"), open.slice(0, 300));
  /* Read first: the drawer states the facts, and offers Edit to those who may. */
  check("...stating where it landed", open.includes("Deployed to") && open.includes("Deployed on"));
  check("...and which POD it is", open.includes("AMC POD"));

  /*
   * A row that names its own POD shows that one, not every POD on the repo.
   * A repository worked on by two teams otherwise put both against every pull
   * request, which tells nobody whose change it was.
   */
  const owned = render(h(ReportTable, { ...props, pulls: [pr({ teamId: "payments-pod" })], openId: null }));
  check("a row shows the POD it is for", owned.includes("Payments POD") && !owned.includes("AMC POD, Payments POD"), "the row shows every POD on the repo");
  /*
   * A row that predates the field falls back to a **count**, not to every name
   * joined with commas — which on a repo with five teams was a paragraph in a
   * column somebody is scanning for risk.
   */
  const legacy = render(h(ReportTable, { ...props, pulls: [pr({ teamId: "" })], openId: null }));
  check("...and an older row falls back to a count", /aria-haspopup="dialog"/.test(legacy), "no way to see which PODs");
  check("...not a comma-joined list", !/AMC POD, Payments POD/.test(legacy.slice(0, legacy.indexOf("<dialog"))), "the joined list is still in the column");
  /* One POD on the repo is a name, not a count: there was never a choice. */
  const single = render(h(ReportTable, {
    ...props,
    podsFor: () => [{ id: "amc-pod", name: "AMC POD" }],
    pulls: [pr({ teamId: "" })],
    openId: null,
  }));
  check("...while a single-POD repo is just named", single.includes("AMC POD") && !/aria-haspopup="dialog"/.test(single), "a dialog holding one chip");
  /* A repo linked to nothing says so rather than offering an empty dialog. */
  const unlinked = render(h(ReportTable, { ...props, podsFor: () => [], pulls: [pr({ teamId: "" })], openId: null }));
  check("...and an unlinked repo says Not linked", unlinked.includes("Not linked") && !/aria-haspopup="dialog"/.test(unlinked));
  const locked = render(h(ReportTable, { ...props, canEdit: false, openId: "acme-cms-1" }));
  check("...offering Edit only to an editor", open.includes("Edit") && !locked.includes(">Edit<"), "edit offered to a non-editor");
  check("...and telling everyone else why not", locked.includes("Read only"));
  check("...and the sign-off history", open.includes("Sign-offs"));
  check("...while the row above still renders", open.includes("Fix the thing"));

  /* The chevron has to say which state it is in, for a screen reader too. */
  check("a closed row is marked closed", /aria-expanded="false"/.test(shut));
  check("an open row is marked open", /aria-expanded="true"/.test(open));

  // -- moving a PR onto the scope sheet ----------------------------------
  /*
   * One button, three quite different reasons it can be off. Each says which,
   * because a greyed control with no explanation is the thing people file bugs
   * about.
   */
  const signed = { by: "a@b.com", at: "2026-09-03T00:00:00.000Z" };
  const allSigned = { biz: signed, qa: signed, pod: signed };

  const ready = render(h(ReportTable, { ...props, pulls: [pr({ signoffs: allSigned })], openId: null }));
  check("a fully signed-off PR can be moved", />To sheet</.test(ready.replace(/<[^>]*>/g, (m) => m)) || ready.includes("To sheet"), "no move control");
  check("...and the button is not disabled", !/disabled=""[^>]*>\s*<[^>]*>\s*To sheet/.test(ready));

  const unsigned = render(h(ReportTable, { ...props, pulls: [pr({ signoffs: { pod: signed } })], openId: null }));
  check("a PR missing sign-offs cannot be moved", unsigned.includes("disabled"), "the button was left enabled");

  const notEditor = render(h(ReportTable, { ...props, canEdit: false, pulls: [pr({ signoffs: allSigned })], openId: null }));
  check("...nor by somebody who may not edit", notEditor.includes("disabled"));

  const frozenCycle = render(h(ReportTable, {
    ...props,
    cycleFor: () => cycle({ scope: { frozen: true, changedAt: "", changedBy: "", reason: "signed off" } }),
    pulls: [pr({ signoffs: allSigned })],
    openId: null,
  }));
  check("...nor into a frozen scope sheet", frozenCycle.includes("disabled"));
  /* The wording of that refusal is asserted in `check-ui.mjs`, against the
     shared rule itself — the tooltip only renders on hover, so it is not in
     this markup to look at. */

  /*
   * No cycle on the row is not "pick the first open one" — it is a refusal,
   * because there is no sheet to move it to until somebody says which.
   */
  const noCycle = render(h(ReportTable, {
    ...props,
    cycleFor: () => undefined,
    pulls: [pr({ signoffs: allSigned })],
    openId: null,
  }));
  check("...nor with no cycle set at all", noCycle.includes("disabled"), "moved onto a sheet nobody chose");

  const already = render(h(ReportTable, { ...props, pulls: [pr({ signoffs: allSigned, movedToScope: true })], openId: null }));
  check("one already moved says so instead", already.includes("On the sheet"), "offered a button that would refuse");

  /* Environment reaches the row, not only the drawer. */
  const deployed = render(h(ReportTable, { ...props, pulls: [pr({ environment: "Production", deployedOn: "2026-09-07" })], openId: null }));
  check("the row shows where it landed", deployed.includes("Production"));

  /*
   * A pull request an admin took back off the scope sheet. The remark is the
   * whole point of the round trip: without it on the row, the person who moved
   * it sees it reappear and has no idea what to do about it.
   */
  const back = { returned: { at: "2026-09-08T09:00:00.000Z", by: "lead@x.com", remarks: "QA sign-off was for the wrong build" }, movedToScope: false };
  const returned = render(h(ReportTable, { ...props, pulls: [pr(back)], openId: null }));
  check("a returned PR says it came back off the sheet", returned.includes("Back off the sheet"), "removed with a reason nobody can read");
  check("...quoting the reason", returned.includes("QA sign-off was for the wrong build"));
  /* Who and when live in the drawer; the row keeps to the one line that
     matters while scrolling. */

  const backOnSheet = render(h(ReportTable, { ...props, pulls: [pr({ ...back, movedToScope: true })], openId: null }));
  check("...and stops saying it once it is moved again", !backOnSheet.includes("Back off the sheet"), "the report kept complaining about something already fixed");

  const returnedOpen = render(h(ReportTable, { ...props, pulls: [pr(back)], openId: "acme-cms-1" }));
  check("the drawer spells the removal out", returnedOpen.includes("Taken back off the scope sheet"), returnedOpen.slice(0, 240));
  check("...naming who to go back to", returnedOpen.includes("lead@x.com"), "the reason with nobody attached to it");
}

/* --------------------------------------------------- the editable row */
{
  const { ScopeTable } = await load("components/devops/scope-table.js");

  const row = {
    id: "d1", repoId: "r", cycleId: "c1", branch: "release", environment: "Production",
    kind: "bug", state: "deployed", ticket: "42", title: "A scope row", prUrl: "",
    author: "a@b.com", notes: "", deployedOn: "2026-09-04", createdAt: "", updatedAt: "", teamId: "amc-pod",
  };
  const props = {
    rows: [row], podOf: (r) => (r.teamId === "amc-pod" ? "AMC POD" : ""), repoPods: "AMC POD, Payments POD",
    pods: [{ id: "amc-pod", name: "AMC POD" }, { id: "payments-pod", name: "Payments POD" }],
    isAdmin: false, canEdit: false, busy: false,
    armed: null, openId: null, setArmed: () => {}, onOpen: () => {}, onSave: () => {}, onRemove: () => {},
  };

  const openSheet = render(h(ScopeTable, { ...props, frozen: false }));
  check("the scope table renders", !openSheet.startsWith("RENDER THREW"), openSheet.slice(0, 200));

  /* The POD, because "whose row is this" was the first thing anyone asked. */
  check("a scope row names its POD", openSheet.includes("AMC POD"), "no POD on the row");

  /* Every row opens. */
  check("a scope row can be expanded", /aria-expanded="false"/.test(openSheet));
  const opened = render(h(ScopeTable, { ...props, canEdit: true, openId: "d1", frozen: false }));
  check("...and an open one shows everything", opened.includes("Everything on this row"), opened.slice(0, 240));
  check("...including the notes and PR", opened.includes("Filled by"));

  /*
   * Edit is only for people an admin chose. A record is evidence once it is
   * written, and a quiet correction by anyone passing devalues all of it.
   */
  check("an editor is offered Edit", opened.includes(">Edit<") || opened.includes("Edit"), "no edit for an editor");
  const readOnly = render(h(ScopeTable, { ...props, canEdit: false, openId: "d1", frozen: false }));
  check("...and a non-editor is told why not", readOnly.includes("Read only"), readOnly.slice(0, 240));
  const frozenOpen = render(h(ScopeTable, { ...props, canEdit: true, openId: "d1", frozen: true }));
  check("...and a frozen sheet says so instead", frozenOpen.includes("Scope is frozen"));

  check("a member is not offered Remove", !openSheet.includes("Remove"));
  const asAdmin = render(h(ScopeTable, { ...props, isAdmin: true, frozen: false }));
  check("an admin is", asAdmin.includes("Remove"));
  check("...but not on a frozen sheet", !render(h(ScopeTable, { ...props, isAdmin: true, frozen: true })).includes("Remove"));

  /*
   * A row that came from a pull request cannot leave silently: the PR goes back
   * to the sign-off report, and the remark is what tells whoever moved it
   * whether to fix something or take the change out of the release branch.
   */
  const fromPull = { ...row, pullId: "p1", prUrl: "https://github.com/acme/cms/pull/813" };
  const armedPull = render(h(ScopeTable, { ...props, rows: [fromPull], isAdmin: true, frozen: false, armed: "d1" }));
  check("removing a moved row asks why first", armedPull.includes("Why is it coming off?"), "it would have gone with no reason");
  /* The button, not the whole table: the trash icon's path data sits between
     the attribute and the words, and a window narrow enough to be meaningful
     would not reach across it. */
  const armedControl = armedPull.slice(armedPull.lastIndexOf("<button"));
  check("...and holds the button until it is said", /disabled=""/.test(armedControl), armedControl.slice(0, 200));

  const armedTyped = render(h(ScopeTable, { ...props, isAdmin: true, frozen: false, armed: "d1" }));
  check("a hand-typed row is not asked for one", !armedTyped.includes("Why is it coming off?"), "a sentence demanded to delete a typo");
}

/* ------------------------------------------------- the table that crashed */
{
  const { RepoTable } = await load("components/devops/repo-table.js");

  const repo = (over = {}) => ({
    id: "acme-cms", name: "cms", owner: "acme", repo: "cms", url: "https://github.com/acme/cms",
    releaseBranch: "release", developBranch: "develop", teamIds: [], token: "", freezeMethod: "ruleset",
    freeze: { state: "open", changedAt: "", changedBy: "", reason: "", detail: "", rulesetId: "" },
    createdAt: "", ...over,
  });

  const none = render(h(RepoTable, { repos: [repo()], teamNames: {} }));
  check("the repo table renders with no PODs linked", !none.startsWith("RENDER THREW"), none.slice(0, 200));
  check("...saying so", none.includes("Not linked"));

  const linked = render(h(RepoTable, { repos: [repo({ teamIds: ["amc-pod", "payments-pod"] })], teamNames: { "amc-pod": "AMC POD", "payments-pod": "Payments POD" } }));
  check("...and lists every POD when there are several", linked.includes("AMC POD") && linked.includes("Payments POD"));

  /*
   * The crash as reported: a row stored before `teamIds` existed reached the
   * component as `undefined` and `repo.teamIds.length` threw. The store now
   * fills schema defaults on read, so this cannot arrive — but the table is
   * rendered with it missing anyway, because a page that throws on one odd row
   * takes the whole board with it.
   */
  const legacy = render(h(RepoTable, { repos: [{ ...repo(), teamIds: undefined }], teamNames: {} }));
  check("a row with no teamIds at all does not throw", !legacy.startsWith("RENDER THREW"), legacy.slice(0, 220));
}

/* ------------------------------------------------------- the PR form */
{
  const { ScopeForm } = await load("components/devops/scope-form.js");

  const cycles = [{ id: "c1", name: "2026.09", repoId: "r", releaseBranch: "release", plannedFor: "", scope: { frozen: false, changedAt: "", changedBy: "", reason: "" }, createdAt: "", updatedAt: "" }];
  const base = { setDraft: () => {}, cycles, pods: [{ id: "amc-pod", name: "AMC POD" }, { id: "payments-pod", name: "Payments POD" }], busy: false, problem: null, onSave: () => {}, onCancel: () => {} };

  const adding = render(h(ScopeForm, { ...base, draft: { kind: "bug" }, frozenBecause: null }));
  const editing = render(h(ScopeForm, { ...base, draft: { id: "d1", title: "A row" }, frozenBecause: null }));
  const shut = render(h(ScopeForm, { ...base, draft: { kind: "bug" }, frozenBecause: "Scope is frozen: signed off" }));

  check("the form renders", !adding.startsWith("RENDER THREW"), adding.slice(0, 200));
  /* An edit and an add are different promises, and the button says which. */
  check("adding says so", adding.includes("Add to the sheet"));
  check("editing says so", editing.includes("Save row"), "an edit still reads as an add");
  check("a frozen sheet disables the whole form", /<fieldset[^>]*disabled/.test(shut));

  /*
   * A repo worked on by several teams has to ask which one. Inheriting the
   * whole list put "AMC POD, Payments POD" on every row and answered nobody's
   * question about whose work it was.
   */
  check("the form asks which POD when there is a choice", adding.includes("Payments POD"), "no POD picker");
  const onePod = render(h(ScopeForm, { ...base, pods: [{ id: "amc-pod", name: "AMC POD" }], draft: { kind: "bug" }, frozenBecause: null }));
  check("...and does not when there is only one", !onePod.includes("Pick a POD"), "asked a question with one answer");
  check("...and says why", shut.includes("signed off"));
}

/* ------------------------------------------------------ clicking, for real */

console.log("\n\x1b[1mIn a browser\x1b[0m \x1b[2m— mounted, then clicked\x1b[0m\n");

{
  const { JSDOM } = await import("jsdom");
  const dom = new JSDOM("<!doctype html><html><body><div id=\"root\"></div></body></html>", { pretendToBeVisual: true });

  /*
   * React reads these off the global scope when it loads, so they go up before
   * react-dom/client is imported. `defineProperty` rather than assignment:
   * Node defines `navigator` as a getter-only global, and a plain assignment
   * throws.
   */
  for (const key of ["window", "document", "navigator", "HTMLElement", "Element", "Node", "Event", "MouseEvent", "getComputedStyle", "requestAnimationFrame", "cancelAnimationFrame"]) {
    Object.defineProperty(globalThis, key, { value: dom.window[key], configurable: true, writable: true });
  }
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;

  const { createRoot } = await import("react-dom/client");
  const { act } = await import("react");
  const { useState } = await import("react");
  const { ReportTable } = await load("components/devops/report-table.js");

  const container = dom.window.document.getElementById("root");
  const root = createRoot(container);

  /*
   * A stand-in for the panel: it owns the open row, exactly as
   * `signoff-report.tsx` does. Anything else would test a component that is not
   * the one shipped.
   */
  function Harness() {
    const [openId, setOpenId] = useState(null);
    return h(ReportTable, {
      pulls: [pr()],
      repoName: () => "cms",
      podName: () => "AMC POD",
      podsFor: () => [{ id: "amc-pod", name: "AMC POD" }],
      cycles: [],
      cycleFor: () => undefined,
      onMove: () => {},
      canEdit: true,
      busy: "",
      openId,
      onOpen: setOpenId,
      onToggle: () => {},
      onAnnotate: () => {},
    });
  }

  await act(async () => { root.render(h(Harness)); });

  const chevron = () => container.querySelector("button[aria-expanded]");
  check("the row has a control that says it expands", Boolean(chevron()), "no aria-expanded button");
  check("...starting closed", chevron()?.getAttribute("aria-expanded") === "false");
  check("...with no detail on screen", !container.textContent.includes("Where it landed"));

  /* The click the report was reported as ignoring. */
  await act(async () => { chevron().dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true })); });

  check("clicking it opens the row", container.textContent.includes("Where it landed"), container.textContent.slice(0, 160));
  check("...and the control says so", chevron()?.getAttribute("aria-expanded") === "true");
  check("...showing the fields that can be corrected", container.textContent.includes("Deployed to"));

  /* And closes again, which is the half that presence tracking used to eat. */
  await act(async () => { chevron().dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true })); });

  check("clicking again closes it", !container.textContent.includes("Where it landed"), container.textContent.slice(0, 160));
  check("...and the control says closed", chevron()?.getAttribute("aria-expanded") === "false");

  /*
   * Pressing Edit inside an open row turns it into fields. This is the whole
   * ask — "one edit button to make the fields editable" — and only a click can
   * show it, because the editing state lives inside the drawer.
   */
  await act(async () => { chevron().dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true })); });
  const editButton = [...container.querySelectorAll("button")].find((b) => b.textContent.trim() === "Edit");
  check("an open row offers Edit to an editor", Boolean(editButton), "no Edit button in the drawer");

  await act(async () => { editButton?.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true })); });
  check("pressing Edit turns the row into fields", container.querySelectorAll("select").length > 0, "no inputs appeared");
  check("...with a date to correct", Boolean(container.querySelector('input[type="date"]')));
  check("...and a way out", [...container.querySelectorAll("button")].some((b) => b.textContent.trim() === "Cancel"));

  await act(async () => { root.unmount(); });
}

/* ------------------------------------- editing a scope row, by clicking it */
{
  const { JSDOM } = await import("jsdom");
  const dom = globalThis.window.document ? { window: globalThis.window } : new JSDOM("<!doctype html><html><body></body></html>");

  const { createRoot } = await import("react-dom/client");
  const { act } = await import("react");
  const { ScopeTable } = await load("components/devops/scope-table.js");

  const host = dom.window.document.createElement("div");
  dom.window.document.body.appendChild(host);
  const root = createRoot(host);

  const row = {
    id: "d1", repoId: "r", cycleId: "c1", branch: "release", environment: "Production",
    kind: "bug", state: "deployed", ticket: "42", title: "A scope row", prUrl: "",
    author: "a@b.com", notes: "", deployedOn: "2026-09-04", createdAt: "", updatedAt: "", teamId: "amc-pod",
  };

  let edited = null;
  await act(async () => {
    root.render(h(ScopeTable, {
      rows: [row], podOf: () => "AMC POD", repoPods: "AMC POD", pods: [{ id: "amc-pod", name: "AMC POD" }],
      isAdmin: false, canEdit: true, busy: false,
      armed: null, openId: null, frozen: false,
      setArmed: () => {}, onOpen: (id) => { edited = id; }, onSave: () => {}, onRemove: () => {},
    }));
  });

  const chevron = host.querySelector("button[aria-expanded]");
  check("a scope row has a control that expands it", Boolean(chevron), "no aria-expanded button");

  await act(async () => { chevron?.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true })); });
  check("clicking it asks the parent to open that row", edited === "d1", JSON.stringify(edited));

  await act(async () => { root.unmount(); });
}

/* ------------------------- clicking anywhere on a row, for real */
/*
 * The chevron was a small target in a very wide row, and everybody tried the
 * row first. These prove the row itself answers — and, just as important, that
 * it keeps its hands off the controls sitting inside it: a row that opened
 * every time somebody pressed Remove, or ate a keystroke meant for the remark
 * box, would be worse than no row click at all.
 */
{
  const { JSDOM } = await import("jsdom");
  const dom = globalThis.window.document ? { window: globalThis.window } : new JSDOM("<!doctype html><html><body></body></html>");

  const { createRoot } = await import("react-dom/client");
  const { act } = await import("react");
  const { ScopeTable } = await load("components/devops/scope-table.js");

  const host = dom.window.document.createElement("div");
  dom.window.document.body.appendChild(host);
  const root = createRoot(host);

  const row = {
    id: "d1", repoId: "r", cycleId: "c1", branch: "release", environment: "Production",
    kind: "bug", state: "deployed", ticket: "42", title: "A scope row",
    prUrl: "https://github.com/acme/cms/pull/7", pullId: "p1",
    author: "a@b.com", notes: "", deployedOn: "2026-09-04", createdAt: "", updatedAt: "", teamId: "amc-pod",
  };

  let opened = "unset";
  let removed = false;
  const mount = (over = {}) => act(async () => {
    root.render(h(ScopeTable, {
      rows: [row], podOf: () => "AMC POD", repoPods: "AMC POD", pods: [{ id: "amc-pod", name: "AMC POD" }],
      isAdmin: true, canEdit: true, busy: false,
      armed: null, openId: null, frozen: false,
      setArmed: () => {}, onOpen: (id) => { opened = id; }, onSave: () => {},
      onRemove: () => { removed = true; },
      ...over,
    }));
  });

  await mount();
  const tr = host.querySelector('tr[role="button"]');
  check("a scope row is itself a control", Boolean(tr), "only the chevron was clickable");
  check("...that says whether it is open", tr?.getAttribute("aria-expanded") === "false");
  check("...and can be reached by keyboard", tr?.getAttribute("tabindex") === "0");

  const cell = tr?.querySelector("td:nth-child(3)");
  await act(async () => { cell?.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true })); });
  check("clicking the middle of a row opens it", opened === "d1", JSON.stringify(opened));

  /* Enter and Space, because a row that claims to be a button has to behave
     like one for somebody who never touches a mouse. */
  opened = "unset";
  await act(async () => { tr?.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: "Enter", bubbles: true })); });
  check("...as does pressing Enter on it", opened === "d1", JSON.stringify(opened));
  opened = "unset";
  /*
   * `cancelable`, so the default can actually be checked. Space on a focused
   * element scrolls the page, and a row that opened *and* jumped the reader
   * down a screen would be its own bug.
   */
  const space = new dom.window.KeyboardEvent("keydown", { key: " ", bubbles: true, cancelable: true });
  await act(async () => { tr?.dispatchEvent(space); });
  check("...and Space", opened === "d1", JSON.stringify(opened));
  check("...without also scrolling the page", space.defaultPrevented, "Space opened the row and scrolled away from it");
  opened = "unset";
  await act(async () => { tr?.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: "a", bubbles: true })); });
  check("...but not any other key", opened === "unset", JSON.stringify(opened));

  /* The controls inside keep their own clicks. */
  opened = "unset";
  const remove = [...(tr?.querySelectorAll("button") ?? [])].find((b) => /Remove/.test(b.textContent ?? ""));
  await act(async () => { remove?.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true })); });
  check("pressing Remove does not also open the row", opened === "unset", JSON.stringify(opened));

  opened = "unset";
  const link = tr?.querySelector("a");
  await act(async () => { link?.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true })); });
  check("...nor does following the pull request link", opened === "unset", JSON.stringify(opened));

  /* And the remark box keeps its keystrokes: Space in it is a space. */
  opened = "unset";
  await mount({ armed: "d1" });
  const box = host.querySelector('input[aria-label="Why it is coming off the sheet"]');
  check("the remark box is there to type in", Boolean(box));
  await act(async () => { box?.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: " ", bubbles: true })); });
  check("...and a space typed into it does not open the row", opened === "unset", JSON.stringify(opened));

  await act(async () => { root.unmount(); });
}

/* ------------------------- the same, on the sign-off report */
{
  const { JSDOM } = await import("jsdom");
  const dom = globalThis.window.document ? { window: globalThis.window } : new JSDOM("<!doctype html><html><body></body></html>");

  const { createRoot } = await import("react-dom/client");
  const { act } = await import("react");
  const { ReportTable } = await load("components/devops/report-table.js");

  const host = dom.window.document.createElement("div");
  dom.window.document.body.appendChild(host);
  const root = createRoot(host);

  let opened = "unset";
  let toggled = null;
  await act(async () => {
    root.render(h(ReportTable, {
      pulls: [pr({ signoffs: {} })], repoName: () => "cms", podName: () => "AMC POD", podsFor: () => [],
      cycles: [], canEdit: true, cycleFor: () => undefined, busy: "", openId: null,
      onOpen: (id) => { opened = id; }, onToggle: (_p, level) => { toggled = level; },
      onAnnotate: () => {}, onMove: () => {},
    }));
  });

  const tr = host.querySelector('tr[role="button"]');
  check("a report row is itself a control", Boolean(tr));
  const cell = tr?.querySelector("td:nth-child(3)");
  await act(async () => { cell?.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true })); });
  check("clicking a report row opens it", opened === "acme-cms-1", JSON.stringify(opened));

  /* A sign-off toggle is the one thing on this row people press most. */
  opened = "unset";
  const toggle = [...(tr?.querySelectorAll("button") ?? [])].find((b) => /Business/.test(b.textContent ?? ""));
  await act(async () => { toggle?.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true })); });
  check("signing off does not also open the row", opened === "unset", JSON.stringify(opened));
  check("...and the sign-off still lands", toggled === "biz", JSON.stringify(toggled));

  await act(async () => { root.unmount(); });
}

/* ------------------------- removing a moved row, by clicking it for real */
/*
 * The one that source-reading cannot answer: whether the button *actually*
 * refuses while the box is empty, and whether the sentence typed into it
 * actually reaches the caller. Both are the difference between the sign-off
 * report getting a reason and getting nothing.
 */
{
  const { JSDOM } = await import("jsdom");
  const dom = globalThis.window.document ? { window: globalThis.window } : new JSDOM("<!doctype html><html><body></body></html>");

  const { createRoot } = await import("react-dom/client");
  const { act } = await import("react");
  const { ScopeRemove } = await load("components/devops/scope-remove.js");

  const host = dom.window.document.createElement("div");
  dom.window.document.body.appendChild(host);
  const root = createRoot(host);

  const moved = { id: "d1", pullId: "p1", title: "Refactor settlement retry loop" };
  let removedWith = null;
  const mount = (row) => act(async () => {
    root.render(h(ScopeRemove, {
      row, armed: true, busy: false, onArm: () => {},
      onRemove: (why) => { removedWith = why; },
    }));
  });

  await mount(moved);
  const button = [...host.querySelectorAll("button")].find((b) => /Remove/.test(b.textContent ?? ""));
  const box = host.querySelector('input[aria-label="Why it is coming off the sheet"]');
  check("an armed row from a PR shows the box", Boolean(box), "no box to type a reason into");
  check("...and its button is disabled while it is empty", button?.disabled === true, "it would have removed with no reason");

  await act(async () => { button?.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true })); });
  check("...so clicking it does nothing", removedWith === null, JSON.stringify(removedWith));

  /* React tracks the value it set, so setting `.value` alone is ignored. */
  const setValue = Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, "value").set;
  await act(async () => {
    setValue.call(box, "QA signed off the wrong build");
    box.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
  });

  const armedButton = [...host.querySelectorAll("button")].find((b) => /Remove/.test(b.textContent ?? ""));
  check("typing a reason frees the button", armedButton?.disabled === false, "a reason was typed and it stayed stuck");

  await act(async () => { armedButton?.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true })); });
  check("...and the reason reaches the caller", removedWith === "QA signed off the wrong build", JSON.stringify(removedWith));

  /* A hand-typed row owes nobody an explanation. */
  removedWith = null;
  await mount({ id: "d2", pullId: "", title: "Config change" });
  check("a hand-typed row is not asked for a reason", !host.querySelector('input[aria-label="Why it is coming off the sheet"]'));
  const plain = [...host.querySelectorAll("button")].find((b) => /Remove/.test(b.textContent ?? ""));
  check("...and goes on one press", plain?.disabled === false);
  await act(async () => { plain?.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true })); });
  check("...with an empty reason", removedWith === "", JSON.stringify(removedWith));

  await act(async () => { root.unmount(); });
}

/* ------------------------------------------- the panels, mounted for real */

/*
 * The gap this closes.
 *
 * Everything above mounts a *table* — a leaf that takes props. Nothing mounted
 * the **panel** that wires one up, so a panel could refer to a `const` before
 * it was declared and every check still passed: the table was fine, and the
 * thing that threw was never rendered.
 *
 * These do not assert much beyond "it renders and shows its rows". That is the
 * point. A panel that throws on render takes the whole board with it, and
 * catching that costs one mount.
 */
{
  const { JSDOM } = await import("jsdom");
  const { createRoot } = await import("react-dom/client");
  const { act } = await import("react");

  /* What the panels ask the API for, and what they get. */
  const CANNED = {
    "/api/repos": { repos: [{ id: "acme-cms", name: "cms", owner: "acme", repo: "cms", url: "https://github.com/acme/cms", releaseBranch: "release", developBranch: "develop", teamIds: ["amc-pod"], token: "", freezeMethod: "ruleset", freeze: { state: "open", changedAt: "", changedBy: "", reason: "", detail: "", rulesetId: "" }, createdAt: "" }] },
    "/api/cycles": { cycles: [{ id: "acme-cms-2026-09", repoId: "acme-cms", name: "2026.09", releaseBranch: "release", plannedFor: "", scope: { frozen: false, changedAt: "", changedBy: "", reason: "" }, createdAt: "", updatedAt: "" }] },
    "/api/deployments": { deployments: [{ id: "d1", repoId: "acme-cms", teamId: "amc-pod", cycleId: "acme-cms-2026-09", branch: "release", environment: "Production", kind: "bug", state: "deployed", ticket: "42", title: "A scope row", prUrl: "", author: "a@b.com", notes: "", deployedOn: "2026-09-04", createdAt: "", updatedAt: "" }] },
    "/api/pulls": { pulls: [pr({ environment: "Production", deployedOn: "2026-09-07" })] },
    "/api/announcements": { announcements: [{ id: "a1", repoId: "acme-cms", branch: "release", kind: "release", title: "Cut 2026.09", body: "", author: "a@b.com", pinned: true, createdAt: "2026-09-01T00:00:00.000Z" }] },
    "/api/users": { users: [{ id: "a@b.com", email: "a@b.com", name: "A", role: "member", teamIds: [], devopsEditor: false, createdAt: "" }] },
  };

  const answer = (url) => {
    const path = String(url).split("?")[0];
    return CANNED[path] ?? {};
  };

  const mountPanel = async (element, name, expect) => {
    const dom = new JSDOM("<!doctype html><html><body><div id=\"root\"></div></body></html>", { pretendToBeVisual: true, url: "http://localhost:3000/" });

    for (const key of ["window", "document", "navigator", "HTMLElement", "Element", "Node", "Event", "MouseEvent", "getComputedStyle", "requestAnimationFrame", "cancelAnimationFrame"]) {
      Object.defineProperty(globalThis, key, { value: dom.window[key], configurable: true, writable: true });
    }

    /*
     * Three browser APIs jsdom does not have and the design system uses:
     * `matchMedia` for reduced motion, `IntersectionObserver` for the panels
     * that animate in on scroll, and `ResizeObserver`. Without them the mount
     * throws for reasons that have nothing to do with the component.
     */
    globalThis.window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} });
    class Observer { observe() {} unobserve() {} disconnect() {} takeRecords() { return []; } }
    globalThis.IntersectionObserver = Observer;
    /*
     * The theme toggle remembers a choice. jsdom refuses `localStorage` on an
     * opaque origin, so this is a plain map — the components only read and
     * write a key, and none of them is testing storage.
     */
    const remembered = new Map();
    const store = {
      getItem: (k) => (remembered.has(String(k)) ? remembered.get(String(k)) : null),
      setItem: (k, v) => remembered.set(String(k), String(v)),
      removeItem: (k) => remembered.delete(String(k)),
      clear: () => remembered.clear(),
      key: () => null,
      get length() { return remembered.size; },
    };
    Object.defineProperty(globalThis, "localStorage", { value: store, configurable: true, writable: true });
    Object.defineProperty(dom.window, "localStorage", { value: store, configurable: true, writable: true });
    globalThis.ResizeObserver = Observer;
    globalThis.window.IntersectionObserver = Observer;
    globalThis.window.ResizeObserver = Observer;

    globalThis.fetch = async (url) =>
      new Response(JSON.stringify(answer(url)), { status: 200, headers: { "Content-Type": "application/json" } });

    const container = dom.window.document.getElementById("root");
    const root = createRoot(container);

    let threw = null;
    try {
      await act(async () => { root.render(element); });
      // SWR resolves on a microtask; two turns is enough for a fetch and a render.
      await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
      await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
    } catch (err) {
      threw = err instanceof Error ? err.message : String(err);
    }

    check(`${name} mounts`, threw === null, threw ?? "");
    if (!threw && expect) {
      for (const want of expect) {
        check(`  ${name} shows "${want}"`, container.textContent.includes(want), container.textContent.slice(0, 200));
      }
    }

    try { await act(async () => { root.unmount(); }); } catch { /* an already-broken tree cannot unmount */ }
  };

  const repos = CANNED["/api/repos"].repos;
  const teamNames = { "amc-pod": "AMC POD" };
  const flash = () => {};

  const { SignoffReport } = await load("components/devops/signoff-report.js");
  await mountPanel(
    h(SignoffReport, { repos, teamNames, isAdmin: true, canEdit: true, flash }),
    "the sign-off report",
    ["Sign-off report", "AMC POD"],
  );

  const { ScopeSheet } = await load("components/devops/scope-sheet.js");
  await mountPanel(
    h(ScopeSheet, { repos, teamNames, isAdmin: true, canEdit: true, flash }),
    "the scope sheet",
    ["Scope sheet", "A scope row", "AMC POD"],
  );

  const { Announcements } = await load("components/devops/announcements.js");
  await mountPanel(h(Announcements, { repos, isAdmin: true }), "announcements", ["Announcements", "Cut 2026.09"]);

  const { PurgePanel } = await load("components/devops/purge-panel.js");
  await mountPanel(h(PurgePanel, { known: [], flash, onDone: () => {} }), "the purge panel", ["Clear a period"]);

  const { DevOpsClient } = await load("components/devops/devops-client.js");
  await mountPanel(
    h(DevOpsClient, { userName: "A", isAdmin: true, authEnabled: true, teamNames, githubMode: "dry-run", canEdit: true }),
    "the whole board",
    ["DevOps", "Branch status"],
  );

  const { EditorsSection } = await load("app/admin/panels/editors-section.js");
  await mountPanel(h(EditorsSection, { flash }), "the editors panel", ["Who can edit records"]);

  const { ReposSection } = await load("app/admin/panels/repos-section.js");
  await mountPanel(h(ReposSection, { teams: [{ id: "amc-pod", name: "AMC POD" }], flash }), "the repositories panel", ["Repositories"]);

  const { CyclesSection } = await load("app/admin/panels/cycles-section.js");
  await mountPanel(h(CyclesSection, { flash }), "the cycles panel", ["Deployment cycles"]);
}

rmSync(OUT, { recursive: true, force: true });

console.log("\n" + "─".repeat(60));
console.log(failures === 0 ? `All ${checks} render checks passed.` : `${failures} of ${checks} render checks FAILED.`);
process.exit(failures ? 1 : 0);
