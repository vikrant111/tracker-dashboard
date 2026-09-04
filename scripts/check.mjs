/**
 * End-to-end checks against a running dev server.
 *
 *   pnpm dev          # in one terminal
 *   pnpm check        # in another
 *
 * Three groups:
 *   invariants  — aggregations agree with each other and with their drill-downs
 *   input       — malformed and hostile input is rejected, never 5xx
 *   auth        — POD scoping actually holds (needs AUTH_MODE=password)
 *
 * Every case here corresponds to a bug that was real at some point. Run it
 * after touching queries, filters, validation or auth.
 */
import { numbersBundle } from "./lib/numbers-fixture.mjs";
import { getStore } from "../src/db/store/index.ts";

const BASE = process.env.CHECK_BASE || "http://localhost:3000";
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "admin@example.com";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "changeme";

let failures = 0;
let checks = 0;
const only = process.argv[2];

function check(label, pass, detail = "") {
  checks++;
  if (!pass) failures++;
  if (!pass) console.log(`  ✗ ${label}  ${detail}`);
  else if (process.env.VERBOSE) console.log(`  ✓ ${label}  ${detail}`);
}
const section = (t) => console.log(`\n${t}`);

/** Minimal cookie jar — enough for the NextAuth credentials flow. */
function jar() {
  const store = new Map();
  return {
    header: () => [...store].map(([k, v]) => `${k}=${v}`).join("; "),
    absorb: (res) => {
      for (const c of res.headers.getSetCookie?.() ?? []) {
        const [pair] = c.split(";");
        const i = pair.indexOf("=");
        store.set(pair.slice(0, i), pair.slice(i + 1));
      }
    },
  };
}

const anon = jar();

async function call(j, path, init = {}) {
  const res = await fetch(BASE + path, {
    ...init,
    headers: { ...(init.headers || {}), cookie: j.header() },
    redirect: "manual",
  });
  j.absorb(res);
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* an HTML error page means a crash, which `json === null` signals */
  }
  return { status: res.status, json, location: res.headers.get("location") };
}

async function signIn(email, password) {
  const j = jar();
  const { json } = await call(j, "/api/auth/csrf");
  await call(j, "/api/auth/callback/credentials", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ csrfToken: json.csrfToken, email, password, redirect: "false" }).toString(),
  });
  return j;
}

// ---------------------------------------------------------------- invariants

async function invariants(session) {
  const get = (p) => call(session, p);
  const count = async (q) => (await get(`/api/items?${q}&limit=500`)).json.total;

  for (const scope of ["", "teamId=amc-pod", "kind=bug"]) {
    section(`invariants — scope: ${scope || "all PODs"}`);
    const d = (await get(`/api/metrics?${scope}`)).json;
    if (d.error) {
      check(`metrics load (${scope})`, false, d.error);
      continue;
    }
    const t = d.totals;
    const p = scope ? scope + "&" : "";
    const sum = (arr) => arr.reduce((n, b) => n + b.count, 0);

    check("total = active + closed", t.total === t.active + t.closed, `${t.total} vs ${t.active}+${t.closed}`);
    check("severity sums to total", sum(d.severity) === t.total);
    check("status sums to total", sum(d.status) === t.total);
    check("environment sums to total", sum(d.environment) === t.total);
    check("ageing sums to active", sum(d.ageing) === t.active, `${sum(d.ageing)} vs ${t.active}`);
    check("team roll-up sums to total", d.teams.reduce((n, x) => n + x.total, 0) === t.total);
    check("health within 0..100", d.health >= 0 && d.health <= 100, `=${d.health}`);
    /*
     * The score is the share of tracked items that are closed, so the two
     * numbers the card prints must produce the number on the dial. Recomputed
     * here rather than imported: that proves the API's figure against the
     * arithmetic, not against the same function called twice.
     */
    check("open never exceeds tracked", t.active <= t.total, `${t.active} of ${t.total}`);
    check("closed is the remainder", t.closed === t.total - t.active, `${t.closed} vs ${t.total}-${t.active}`);
    check(
      "the dial equals closed over tracked",
      // Scaled before divided. `(closed / total) * 100` loses the exact half —
      // 207/360 is 57.5% but that product is 57.49999999999999 — so the check
      // would have demanded the very rounding bug it was meant to catch.
      d.health === (t.total > 0 ? Math.round((t.closed * 100) / t.total) : 100),
      `${d.health} vs ${t.closed}/${t.total}`,
    );
    // Age and severity moved out of the score entirely. If either could still
    // reach it, a board with aged criticals would not match the plain division.
    check(
      "nothing but closure moves the score",
      d.health === (t.total > 0 ? Math.round(((t.total - t.active) * 100) / t.total) : 100),
    );
    check("average age is not negative", t.avgAgeDays >= 0, `=${t.avgAgeDays}`);
    check("criticalAged <= active", t.criticalAged <= t.active);
    check(
      "each assignee's severity split sums to their open count",
      d.assignees.every((a) => a.severity.reduce((n, s) => n + s.count, 0) === a.active),
    );
    check("each assignee: aged and critical <= active", d.assignees.every((a) => a.aged <= a.active && a.critical <= a.active));

    // A bar must return exactly its own count when clicked.
    check("items total matches metrics total", (await count(p)) === t.total);
    check("activeOnly matches active", (await count(`${p}activeOnly=true`)) === t.active);
    check("closedOnly matches closed", (await count(`${p}closedOnly=true`)) === t.closed);
    check("criticalAged tile matches drill", (await count(`${p}severity=Critical&agedOnly=true`)) === t.criticalAged);

    for (const b of d.severity) check(`severity ${b.key} drill`, (await count(`${p}severity=${encodeURIComponent(b.key)}`)) === b.count);
    for (const b of d.status) check(`status ${b.key} drill`, (await count(`${p}status=${encodeURIComponent(b.key)}`)) === b.count);
    for (const b of d.environment) check(`env ${b.key} drill`, (await count(`${p}environment=${encodeURIComponent(b.key)}`)) === b.count);

    // date_range buckets are lower-inclusive / upper-exclusive; the drill mirrors that.
    const AGE = {
      "0-3 days": "activeOnly=true&maxAgeDays=3",
      "4-7 days": "activeOnly=true&minAgeDays=3&maxAgeDays=7",
      "8-14 days": "activeOnly=true&minAgeDays=7&maxAgeDays=14",
      "15-30 days": "activeOnly=true&minAgeDays=14&maxAgeDays=30",
      "30+ days": "activeOnly=true&minAgeDays=30",
    };
    for (const b of d.ageing) check(`ageing ${b.key} drill`, (await count(`${p}${AGE[b.key]}`)) === b.count, `want ${b.count}`);
    for (const a of d.assignees.slice(0, 5))
      check(`assignee ${a.name} drill`, (await count(`${p}assignee=${encodeURIComponent(a.name)}`)) === a.total);
  }

  // Every place the UI prints a number next to a drill-through. These are not
  // covered by the bar/bucket checks above, and all three groups were wrong at
  // some point: the trend used day-granularity age maths that overshot the
  // window, and the assignee chip printed an open count while listing everything.
  section("invariants — UI drill targets match the number shown");
  {
    const d = (await get("/api/metrics")).json;

    for (const t of d.teams) {
      check(`roll-up ${t.teamId} active`, (await count(`teamId=${t.teamId}&activeOnly=true`)) === t.active);
      check(`roll-up ${t.teamId} total`, (await count(`teamId=${t.teamId}`)) === t.total);
      check(
        `roll-up ${t.teamId} critical aged`,
        (await count(`teamId=${t.teamId}&severity=Critical&agedOnly=true`)) === t.criticalAged,
      );

      const pod = (await get(`/api/metrics?teamId=${t.teamId}`)).json;
      for (const b of pod.severity.filter((x) => x.count > 0))
        check(
          `POD detail ${t.teamId} severity ${b.key}`,
          (await count(`teamId=${t.teamId}&severity=${encodeURIComponent(b.key)}`)) === b.count,
        );
      for (const b of pod.environment.filter((x) => x.count > 0))
        check(
          `POD detail ${t.teamId} env ${b.key}`,
          (await count(`teamId=${t.teamId}&environment=${encodeURIComponent(b.key)}`)) === b.count,
        );
      // The chip prints the OPEN count, so its query must carry activeOnly.
      for (const a of pod.assignees.slice(0, 4))
        check(
          `POD detail ${t.teamId} assignee ${a.name}`,
          (await count(`teamId=${t.teamId}&assignee=${encodeURIComponent(a.name)}&activeOnly=true`)) === a.active,
          `shows ${a.active}`,
        );
    }

    // The leaderboard shows whichever figure it ranks by, so all three sorts
    // must drill to the number displayed. Ranking on one and showing another
    // made a correctly sorted list look broken.
    for (const a of d.assignees.slice(0, 5)) {
      const who = encodeURIComponent(a.name);
      check(`leaderboard ${a.name} · Volume`, (await count(`assignee=${who}`)) === a.total, `shows ${a.total}`);
      check(`leaderboard ${a.name} · Ageing`, (await count(`assignee=${who}&agedOnly=true`)) === a.aged, `shows ${a.aged}`);
      check(
        `leaderboard ${a.name} · Critical`,
        (await count(`assignee=${who}&severity=Critical&activeOnly=true`)) === a.critical,
        `shows ${a.critical}`,
      );
    }

    // The ageing spine on the health card reuses the ageing bucket queries.
    const AGE_Q = {
      "0-3 days": "activeOnly=true&maxAgeDays=3",
      "4-7 days": "activeOnly=true&minAgeDays=3&maxAgeDays=7",
      "8-14 days": "activeOnly=true&minAgeDays=7&maxAgeDays=14",
      "15-30 days": "activeOnly=true&minAgeDays=14&maxAgeDays=30",
      "30+ days": "activeOnly=true&minAgeDays=30",
    };
    for (const b of d.ageing.filter((x) => x.count > 0))
      check(`ageing spine ${b.key}`, (await count(AGE_Q[b.key])) === b.count, `shows ${b.count}`);

    // Trend points drill on an exact createdDate window, not on day-granularity
    // age maths — approximating it returned more items than the point plotted.
    for (const grain of ["daily", "weekly"]) {
      const pts = d.trend[grain];
      for (const p of [pts[pts.length - 2], pts[Math.floor(pts.length / 2)]].filter(Boolean)) {
        const start = new Date(p.date);
        const end = new Date(start.getTime() + (grain === "daily" ? 1 : 7) * 86400000);
        const q = `createdFrom=${encodeURIComponent(start.toISOString())}&createdTo=${encodeURIComponent(end.toISOString())}`;
        check(`trend ${grain} ${p.date} raised`, (await count(q)) === p.raised, `shows ${p.raised}`);
      }
    }

    check("createdFrom/To reject junk rather than 500", (await get("/api/items?createdFrom=nonsense&createdTo=x")).status === 200);
  }

  section("invariants — trend and sort");
  const d = (await get("/api/metrics")).json;
  check("daily has 31 points", d.trend.daily.length === 31, `=${d.trend.daily.length}`);
  check("weekly has 13 points", d.trend.weekly.length === 13, `=${d.trend.weekly.length}`);
  check("no negative trend counts", d.trend.daily.every((x) => x.raised >= 0 && x.closed >= 0));
  check("daily dates ascending", d.trend.daily.every((x, i, a) => i === 0 || x.date > a[i - 1].date));

  const RANK = { Critical: 0, Major: 1, Minor: 2, Unknown: 3 };
  const oldest = (await get("/api/items?sort=oldest&limit=200")).json.items;
  const newest = (await get("/api/items?sort=newest&limit=200")).json.items;
  const sev = (await get("/api/items?sort=severity&limit=200")).json.items;
  check("oldest ascends by createdDate", oldest.every((x, i, a) => i === 0 || x.createdDate >= a[i - 1].createdDate));
  check("newest descends by createdDate", newest.every((x, i, a) => i === 0 || x.createdDate <= a[i - 1].createdDate));
  check("severity sorts worst first", sev.every((x, i, a) => i === 0 || RANK[x.severity] >= RANK[a[i - 1].severity]));
  const page = (await get("/api/items?limit=500")).json;
  check("page never exceeds the true total", page.items.length === Math.min(page.total, 500), `${page.items.length} of ${page.total}`);
  check("no duplicate ids in a page", new Set(page.items.map((i) => i.id)).size === page.items.length);
}

// --------------------------------------------------------------------- input

async function input(session) {
  const get = (p) => call(session, p);
  const post = (p, body) =>
    call(session, p, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const del = (p) => call(session, p, { method: "DELETE" });
  const sane = (r) => r.status < 500 && r.json !== null;

  section("search finds the POD that holds the answer");
{
  const all = await get("/api/search/pods?q=Ananya");
  check("a person with items resolves to their POD", all.status === 200);
  const first = all.json?.matches?.[0];
  check("...naming the POD", first?.teamId === "amc-pod", first?.teamId ?? "none");
  check("...with a count of what is there", (first?.items ?? 0) > 0, `${first?.items}`);
  check("...and why it matched", (first?.people ?? []).some((n) => /Ananya/i.test(n)));

  /*
   * The case this was built for: a person on a roster with **no assigned work
   * at all**. They match no items anywhere, so an items-only search reports
   * "nowhere" about somebody plainly on the team — which is what the dashboard
   * did, showing an empty board and no hint of where to look.
   *
   * The person is **planted**, not borrowed from the seed. The first version of
   * this check searched a seeded name, and every seeded person has items — so
   * it passed just as happily with roster matching removed entirely. A check
   * that cannot fail is worse than none.
   */
  {
    const ghost = "Zzqx Rosteronly";
    const pod = await post("/api/teams", {
      name: "Chk Roster POD",
      members: [{ name: ghost, designation: "QA Engineer", role: "member" }],
    });
    const podId = pod.json?.team?.id;
    check("a POD with a roster and no items was created", Boolean(podId), `${pod.status}`);

    if (podId) {
      const roster = await get(`/api/search/pods?q=${encodeURIComponent("Zzqx")}`);
      const found = roster.json?.matches?.find((m) => m.teamId === podId);
      check("a roster-only person is still found", Boolean(found), JSON.stringify(roster.json?.matches ?? []));
      check("...with no items, because they have none", found?.items === 0, `${found?.items}`);
      check("...and named as a roster match", (found?.people ?? []).some((n) => n === ghost));

      // Nothing planted survives the run.
      await del(`/api/teams/${podId}`);
      const gone = await get(`/api/search/pods?q=${encodeURIComponent("Zzqx")}`);
      check("...and the planted POD is cleaned up", (gone.json?.matches ?? []).length === 0);
    }
  }

  // Most items first, so "the first POD" is the one with the most to show.
  const broad = await get("/api/search/pods?q=a");
  const counts = (broad.json?.matches ?? []).map((m) => m.items);
  check("matches are ordered, busiest POD first", counts.every((n, i) => i === 0 || counts[i - 1] >= n), counts.join(" "));

  // Nothing typed is not an error, and nothing matched is not either.
  check("an empty term matches nothing, without failing", (await get("/api/search/pods?q=")).json?.matches?.length === 0);
  const none = await get("/api/search/pods?q=zzzznotathing");
  check("a term nobody matches returns an empty list", none.status === 200 && none.json.matches.length === 0);

  // The same hostile values the filters take, on the new surface.
  for (const hostile of ["%00", "%24ne", "*", "((((", "%2E%2E%2F", "a".repeat(300)]) {
    const res = await get(`/api/search/pods?q=${hostile}`);
    check(`q=${hostile.slice(0, 12)} does not 5xx`, res.status < 500, `${res.status}`);
  }
}

section("a JSON body can carry an object where a string is expected");
  {
    /*
     * The gap a query string does not have.
     *
     * Every hostile-value check above goes through `?param=…`, where the value
     * is always a string. A **JSON body** can carry `{"$ne": null}`, and Mongo
     * accepts an operator object exactly where an id was expected — matching
     * the first document in the collection rather than nothing.
     *
     * Verified by removing the guard: `POST /api/sync` with
     * `{"teamId": {"$ne": null}}` returned **200** and named a POD the caller
     * never asked for. The controllers refuse a non-string id, and these keep
     * them refusing it.
     */
    const OPERATORS = [{ $ne: null }, { $gt: "" }, { $regex: ".*" }, ["amc-pod"], 42, true];

    for (const value of OPERATORS) {
      const label = JSON.stringify(value);

      const sync = await post("/api/sync", { teamId: value });
      check(`sync with teamId=${label} is refused`, sync.status >= 400, `${sync.status}`);
      /*
       * And nothing leaks on the way out. A 200 that happens to error inside
       * would still have named a POD in its body, which is the actual harm —
       * an unauthorised caller learning what PODs exist.
       */
      const body = JSON.stringify(sync.json ?? {});
      check(`...and names no POD`, !/teamName|amc-pod|payments-pod/i.test(body), body.slice(0, 80));

      const upload = await post("/api/upload", { teamId: value });
      /*
       * 4xx, not merely "not 2xx". A 500 also satisfies `>= 400`, which is how
       * this passed while the route was throwing a TypeError out of
       * `req.formData()` and quoting our internals back at the caller.
       */
      check(`upload with teamId=${label} is refused in prose`, upload.status >= 400 && upload.status < 500, `${upload.status}`);
    }

    /*
     * The same shape on the account routes. These already answered in prose,
     * except `/api/users`, which called `.includes` on the object and returned
     * a **500 quoting our own internals** — a hostile value must be refused,
     * never crash the handler.
     */
    for (const value of OPERATORS) {
      const label = JSON.stringify(value);
      for (const path of ["/api/users", "/api/users/password", "/api/account/password"]) {
        const res = await post(path, { email: value, password: "irrelevant123" });
        check(`${path} with email=${label} does not 5xx`, res.status < 500, `${res.status}`);
      }
    }
  }

section("one person on several PODs, with work on only one");
{
  /*
   * The reported case, planted rather than borrowed.
   *
   * Somebody is on two PODs and has items on only one of them. Every query is
   * scoped to a single POD, so the board must open the POD that holds the
   * **work**, not the first POD that happens to hold the name — and switching
   * to the other must show that other POD's truth, not a cached version of the
   * first.
   *
   * Planted because the seed gives every person items: borrowing one would make
   * this pass whatever the ordering did.
   */
  const WHO = "Zzqx Twopods";
  const podA = await post("/api/teams", { name: "Chk Empty POD", members: [{ name: WHO, role: "member" }] });
  const podB = await post("/api/teams", { name: "Chk Busy POD", members: [{ name: WHO, role: "member" }] });
  const a = podA.json?.team?.id;
  const b = podB.json?.team?.id;
  check("two PODs were created for the multi-POD case", Boolean(a && b), `${podA.status}/${podB.status}`);

  if (a && b) {
    /*
     * Two items on B only, one open and one closed — so the health of the
     * filtered board is checkable by hand: 1 of 2 closed is 50.
     */
    /*
     * A real CSV through the real route — `/api/upload` takes multipart form
     * data, not JSON. Two rows, one open and one closed, so the filtered
     * board's health is checkable by hand: 1 of 2 closed is 50.
     */
    const day = 86_400_000;
    const iso = (t) => new Date(t).toISOString().slice(0, 10);
    const csv = [
      "Work Item ID,Title,Assignee,Severity,Status,Created Date,Closed Date",
      `Zx-1,Multi-pod fixture one,${WHO},Critical,Open,${iso(Date.now() - 20 * day)},`,
      `Zx-2,Multi-pod fixture two,${WHO},Major,Closed,${iso(Date.now() - 30 * day)},${iso(Date.now() - day)}`,
    ].join("\n");

    const form = new FormData();
    form.set("file", new File([csv], "multipod.csv"));
    form.set("teamId", b);
    const upRes = await fetch(BASE + "/api/upload", {
      method: "POST",
      body: form,
      headers: { cookie: session.header() },
    });
    const up = { status: upRes.status, json: await upRes.json().catch(() => null) };
    check("items landed on the busy POD", up.status === 200 && up.json?.imported === 2, `${up.status} imported=${up.json?.imported}`);

    // Where does the search send you?
    const where = await get(`/api/search/pods?q=${encodeURIComponent("Zzqx")}`);
    const matches = (where.json?.matches ?? []).filter((m) => m.teamId === a || m.teamId === b);
    check("both PODs are found", matches.length === 2, matches.map((m) => `${m.name}:${m.items}`).join(" "));
    check("...and the one holding the work comes first", matches[0]?.teamId === b, matches[0]?.name ?? "none");
    check("...with its item count", (matches[0]?.items ?? 0) === 2, `${matches[0]?.items}`);
    check("...and the empty one is still listed", matches[1]?.items === 0, `${matches[1]?.items}`);

    /*
     * Each POD reports **its own** truth for the same search. This is the whole
     * question: the same person, two scopes, two different right answers.
     */
    const busy = await get(`/api/metrics?teamId=${b}&search=${encodeURIComponent("Zzqx")}`);
    check("the busy POD shows their items", busy.json?.totals?.total === 2, `${busy.json?.totals?.total}`);
    check("...with a real score", busy.json?.health === 50, `${busy.json?.health}`);
    check("...and only them on the leaderboard", (busy.json?.assignees ?? []).length === 1, `${(busy.json?.assignees ?? []).length}`);

    const empty = await get(`/api/metrics?teamId=${a}&search=${encodeURIComponent("Zzqx")}`);
    check("the empty POD reports nothing, not the other POD's items", empty.json?.totals?.total === 0, `${empty.json?.totals?.total}`);
    check("...and has no score at all", empty.json?.health === null, `${empty.json?.health}`);
    check("...while still listing them from the roster", (empty.json?.assignees ?? []).some((x) => x.name === WHO));

    // The drill-down agrees with the busy POD's count, as every number must.
    const drill = await get(`/api/items?teamId=${b}&search=${encodeURIComponent("Zzqx")}&size=10`);
    check("the drill-down returns exactly those items", drill.json?.total === 2, `${drill.json?.total}`);
    check("...all of them on the busy POD", (drill.json?.items ?? []).every((i) => i.teamId === b));

    // Nothing planted survives the run.
    for (const id of [a, b]) await del(`/api/teams/${id}`);
    const after = await get(`/api/search/pods?q=${encodeURIComponent("Zzqx")}`);
    check("...and both PODs are cleaned up", (after.json?.matches ?? []).length === 0, JSON.stringify(after.json?.matches ?? []));
  }
}

section("input — every filter param survives hostile values");
  // Sixteen params × twenty shapes of junk. Any of them reaching the query layer
  // unguarded is a 500, and several already did: NaN in `size`, negative days in
  // date math, an unparseable date. Nothing here may 5xx or return non-JSON.
  {
    const PARAMS = [
      "teamId", "kind", "severity", "environment", "status", "assignee",
      "activeOnly", "closedOnly", "agedOnly", "search",
      "minAgeDays", "maxAgeDays", "createdFrom", "createdTo", "limit", "sort",
    ];
    const HOSTILE = [
      "", "%20%20", "%00", "NaN", "Infinity", "-9999", "999999999999999999999",
      "3.99", "1e400", "%27%20OR%201%3D1--", "%3Cscript%3E", "*", ".*%2B%3F",
      "%F0%9F%90%9B", "..%2F..%2Fetc%2Fpasswd", "a%0Ab", "a".repeat(400),
    ];
    let broke = 0;
    let tried = 0;
    for (const p of PARAMS) {
      for (const v of HOSTILE) {
        for (const route of ["/api/items", "/api/metrics"]) {
          tried++;
          const r = await get(`${route}?${p}=${v}&limit=5`);
          if (r.status >= 500 || r.json === null) {
            broke++;
            if (broke <= 3) console.log(`    ${route} ${p}=${v.slice(0, 20)} -> ${r.status}`);
          }
        }
      }
    }
    check(`${tried} hostile filter values, none 5xx`, broke === 0, `${broke} broke`);
  }

  section("input — scope cannot be widened by param trickery");
  for (const attempt of ["teamId[]=payments-pod", "teamid=payments-pod", "TEAMID=payments-pod"]) {
    const r = await get(`/api/metrics?${attempt}`);
    // An unrecognised spelling must be ignored, never silently honoured.
    check(`${attempt} is ignored, not honoured`, r.status === 200 && (r.json.teams?.length ?? 0) !== 1);
  }
  {
    // Duplicated keys: URLSearchParams.get takes the first, so the tighter of
    // the two wins rather than the caller getting to append a wider one.
    const r = await get("/api/metrics?teamId=amc-pod&teamId=payments-pod");
    check("duplicate teamId takes the first", r.json.teams?.every((t) => t.teamId === "amc-pod"));
  }

  section("input — malformed numerics must never reach date math or [size]");
  for (const q of [
    "limit=abc", "limit=-5", "limit=0", "limit=NaN", "limit=Infinity", "limit=1e400",
    "minAgeDays=abc", "minAgeDays=-3", "minAgeDays=Infinity", "minAgeDays=3.7",
    "maxAgeDays=abc", "maxAgeDays=-99", "maxAgeDays=1e400",
  ]) {
    const r = await get(`/api/items?${q}`);
    check(`items?${q}`, sane(r), `[${r.status}] ${String(r.json?.error ?? "").slice(0, 60)}`);
  }
  for (const q of ["kind=%00", "kind=bogus", "severity=Nonsense", "search=*", "search=%3F"]) {
    const r = await get(`/api/metrics?${q}`);
    check(`metrics?${q}`, sane(r), `[${r.status}]`);
  }
  check("unknown teamId is a 404", (await get("/api/items?teamId=no-such-pod")).status === 404);

  section("input — POD identity");
  const made = [];
  const mk = async (name, extra) => {
    const r = await post("/api/teams", { name, ...extra });
    if (r.json?.team) made.push(r.json.team.id);
    return r;
  };
  check("empty name refused", (await mk("")).status === 400);
  check("whitespace name refused", (await mk("   ")).status === 400);

  // Names with no ASCII letters must not all collapse onto one shared id.
  const ids = [];
  for (const n of ["团队", "チーム", "!!!"]) ids.push((await mk(n)).json?.team?.id);
  check("symbol-only names get distinct ids", new Set(ids).size === 3, ids.join(", "));
  check("slug is stable for the same name", (await mk("团队")).json?.team?.id === ids[0]);

  const long = await mk("X".repeat(300));
  check("long name yields a short id", (long.json?.team?.id?.length ?? 999) <= 48);
  check("long name is truncated", (long.json?.team?.name?.length ?? 999) <= 80);
  // Compare against a snapshot, not against seed specifics — this POD is a real
  // one that people edit, so a hardcoded member count would rot immediately.
  const before = (await get("/api/teams")).json.teams.find((t) => t.id === "amc-pod");
  check("near-collision on an existing slug is refused", (await post("/api/teams", { name: "AMC/POD" })).status === 409);
  const after = (await get("/api/teams")).json.teams.find((t) => t.id === "amc-pod");
  check(
    "the existing POD survived that attempt",
    after?.name === before?.name && after?.members.length === before?.members.length,
    `${before?.name}/${before?.members.length} -> ${after?.name}/${after?.members.length}`,
  );

  section("input — ageing threshold is clamped to 1..365");
  /*
   * `ageingThresholdDays` left the admin form, but the API still accepts it —
   * as shorthand for "every severity without a rule of its own". It is clamped
   * exactly as before; the clamp just lands on the severities now.
   *
   * A **fresh POD per value**, because the fold is deliberately one-way: once a
   * POD's ageing lives in explicit per-severity rules, a legacy POD-level
   * number must not silently overwrite them. Reusing one POD would test that
   * stickiness rather than the clamp, and pass while measuring nothing.
   */
  for (const [i, [v, want]] of [[-5, 1], [0, 1], [0.5, 1], [99999, 365], ["abc", 7], [14, 14]].entries()) {
    const r = await mk(`Thresh POD ${i}`, { ageingThresholdDays: v });
    const folded = r.json?.team?.severityThresholdDays ?? {};
    // 7 is the default, and the default folds to nothing — an empty map *is* 7.
    const got = want === 7 ? (folded.Critical ?? 7) : folded.Critical;
    check(`threshold ${JSON.stringify(v)} -> ${want}`, got === want, `got ${JSON.stringify(folded)}`);
    check(`...applied to every severity`, want === 7 || ["Critical", "Major", "Minor", "Unknown"].every((sev) => folded[sev] === want), JSON.stringify(folded));
  }

  /* And the stored default is pinned, so the fold cannot run twice. */
  const pinned = await mk("Thresh POD", { ageingThresholdDays: 14 });
  check("the stored POD default is pinned to 7", pinned.json?.team?.ageingThresholdDays === 7, `${pinned.json?.team?.ageingThresholdDays}`);

  /*
   * Explicit severity rules beat the legacy number, in the same request and in
   * a later one. This is the whole reason the second control was removed: there
   * is now exactly one answer to "how old is old here", and it is this map.
   */
  const both = await post("/api/teams", { id: "thresh-pod", name: "Thresh POD", ageingThresholdDays: 30, severityThresholdDays: { Critical: 2 } });
  check("an explicit severity rule wins over the legacy number", both.json?.team?.severityThresholdDays?.Critical === 2, JSON.stringify(both.json?.team?.severityThresholdDays));
  const later = await post("/api/teams", { id: "thresh-pod", name: "Thresh POD", ageingThresholdDays: 30 });
  check("...and is not overwritten by a later one", later.json?.team?.severityThresholdDays?.Critical === 2, JSON.stringify(later.json?.team?.severityThresholdDays));

  check("a clamped threshold still queries", sane(await get("/api/metrics?teamId=thresh-pod")));

  section("input — user records");
  check("email without @ refused", (await post("/api/users", { email: "nope" })).status === 400);
  // A bare string survives `.includes()` as a substring test, which would grant
  // access to any POD whose id is a substring of it.
  await post("/api/users", { email: "chk-sub@x.com", name: "S", teamIds: "amc-pod-archive" });
  const sub = (await get("/api/users")).json.users.find((u) => u.email === "chk-sub@x.com");
  check("teamIds coerced to an array", Array.isArray(sub?.teamIds), JSON.stringify(sub?.teamIds));
  check("no substring access grant", !sub?.teamIds?.includes("amc-pod"));
  await post("/api/users", { email: "chk-role@x.com", name: "R", role: "root" });
  const role = (await get("/api/users")).json.users.find((u) => u.email === "chk-role@x.com");
  check("unknown role falls back to member", role?.role === "member", `=${role?.role}`);
  const mem = await mk("Roles POD", { members: [{ name: "A", email: "a@x.com", designation: "D", role: "superadmin" }] });
  check("unknown member role falls back", mem.json?.team?.members?.[0]?.role === "member");

  section("input — uploads");
  // Uploads go into a throwaway POD, so deleting it at the end takes the
  // imported rows with it and the demo board is left exactly as found.
  const sandbox = await mk("Check Upload POD");
  const SANDBOX = sandbox.json?.team?.id;
  const upload = async (name, body, teamId = SANDBOX) => {
    const form = new FormData();
    form.set("file", new File([body], name));
    form.set("teamId", teamId);
    const res = await fetch(BASE + "/api/upload", { method: "POST", body: form, headers: { cookie: session.header() } });
    let json = null;
    const text = await res.text();
    try { json = JSON.parse(text); } catch { /* crash page */ }
    return { status: res.status, json };
  };
  /*
   * Named `.xlsx`, but the bytes are plain text — so the sniffer reads it as a
   * single-column CSV and the complaint moves to the missing Title column,
   * quoting the header it actually found. That is a *better* answer than "could
   * not read it": the reader learns what the file looked like from here.
   *
   * What must not change is the shape of the failure — a 400 that names the
   * problem, never a 500 leaking a parser's internals.
   */
  const corrupt = await upload("junk.xlsx", Buffer.from("definitely not a zip"));
  check("mislabelled file is a 400, not a 500", corrupt.status === 400, `[${corrupt.status}]`);
  check(
    "mislabelled file explains itself",
    /Could not read|No "Title" column/.test(corrupt.json?.error ?? ""),
    corrupt.json?.error,
  );

  // Actual binary rubbish cannot be mistaken for text, and gets the export advice.
  const binary = await upload("junk.xlsx", Buffer.from([0, 1, 2, 3, 4, 5, 6, 7, 8]));
  check("binary rubbish is a 400", binary.status === 400, `[${binary.status}]`);
  check("binary rubbish is told to export as CSV", /Export it as CSV/.test(binary.json?.error ?? ""), binary.json?.error);

  // A CSV under any name at all — the point of sniffing the bytes.
  for (const name of ["board.txt", "board.tsv", "board"]) {
    const res = await upload(name, Buffer.from("Title\nRenamed row\n"));
    check(`a CSV named ${name} still imports`, res.status === 200 && res.json?.imported === 1, `[${res.status}] ${JSON.stringify(res.json)}`);
  }

  /*
   * ...and the format somebody without Excel actually has. On a Mac, Numbers is
   * often the only spreadsheet app installed, so its own format is read
   * directly rather than bounced back with export instructions.
   */
  const raised = new Date(Date.UTC(2026, 4, 20));
  const real = await upload(
    "board.numbers",
    numbersBundle([
      ["Work Item ID", "Title", "Severity", "Created Date"],
      ["77001", "Imported straight from Numbers", "Critical", raised],
    ]),
  );
  check("a Numbers file imports", real.status === 200 && real.json?.imported === 1, `[${real.status}] ${JSON.stringify(real.json)}`);
  check("its columns map like any other sheet", (real.json?.columns ?? []).includes("severity"), JSON.stringify(real.json?.columns));

  // The dates have to survive too — read against the wrong epoch they land 31
  // years early, which looks plausible right up until the ageing chart is wrong.
  const landed = (await get(`/api/items?teamId=${SANDBOX}&search=${encodeURIComponent("Imported straight from Numbers")}&limit=5`)).json;
  const row = landed?.items?.[0];
  check("a Numbers row lands with its own data", row?.workItemId === "77001" && row?.severity === "Critical", JSON.stringify(row ?? null));
  check("its date survives the epoch", row?.createdDate?.startsWith("2026-05-20"), row?.createdDate);

  // A bundle it cannot decode still gets the way out, rather than a 500.
  const stub = await upload(
    "old.numbers",
    Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.alloc(26), Buffer.from("Index/Document.iwa")]),
  );
  check("an unreadable Numbers file is a 400", stub.status === 400, `[${stub.status}]`);
  check("it says how to export from Numbers", /Export To/.test(stub.json?.error ?? ""), stub.json?.error);
  check("empty file is a 400", (await upload("e.xlsx", Buffer.alloc(0))).status === 400);
  check("missing Title column is a 400", (await upload("n.csv", Buffer.from("Foo,Bar\n1,2\n"))).status === 400);
  check("no teamId is a 400", (await upload("t.csv", Buffer.from("Title\nx\n"), "")).status === 400);
  check("unknown teamId is a 404", (await upload("t.csv", Buffer.from("Title\nx\n"), "ghost-pod")).status === 404);
  const dup = await upload("d.csv", Buffer.from("Id,Title\n1,a\n1,b\n1,c\n"));
  check("duplicate ids counted once, not thrice", dup.json?.imported === 1 && dup.json?.duplicates === 2, JSON.stringify(dup.json));

  section("input — a date window must be half-open, or buckets double-count");
  // Seeded items never land on an exact midnight, so a `lte` upper bound looks
  // correct against real data. This plants an item precisely on a bucket edge,
  // which is the only way the off-by-one actually shows itself.
  {
    const edge = new Date(Date.UTC(2026, 0, 15)).toISOString(); // exact UTC midnight
    const prev = new Date(Date.UTC(2026, 0, 14)).toISOString();
    const next = new Date(Date.UTC(2026, 0, 16)).toISOString();
    await upload("edge.csv", Buffer.from(`Id,Title,Created Date\n9001,Boundary probe,${edge}\n`));

    const q = (from, to) => `teamId=${SANDBOX}&createdFrom=${encodeURIComponent(from)}&createdTo=${encodeURIComponent(to)}`;
    const before = (await get(`/api/items?${q(prev, edge)}&limit=10`)).json.total;
    const after = (await get(`/api/items?${q(edge, next)}&limit=10`)).json.total;
    const whole = (await get(`/api/items?${q(prev, next)}&limit=10`)).json.total;

    check("an item on the edge belongs to the later bucket only", before === 0 && after === 1, `before=${before} after=${after}`);
    check("adjacent windows do not double-count", before + after === whole, `${before}+${after} vs ${whole}`);
  }

  section("input — ageing buckets are half-open at their shared edge");
  // The ageing bounds are absolute, floored to UTC midnight, so `lt` and `lte`
  // differ only for an item created exactly on a bucket edge. Nothing seeded
  // lands there, which made the boundary silently untested — plant one.
  {
    const DAY = 86_400_000;
    const floorDay = (ms) => Math.floor(ms / DAY) * DAY;
    const edge = new Date(floorDay(Date.now() - 7 * DAY)).toISOString();
    await upload("ageedge.csv", Buffer.from(`Id,Title,Created Date,Status\n9100,Ageing edge probe,${edge},Open\n`));

    const inBucket = async (q) =>
      (await get(`/api/items?teamId=${SANDBOX}&${q}&search=Ageing%20edge%20probe&limit=10`)).json.total;

    // ageBound(7) opens the 4-7 bucket and closes the 8-14 one.
    const younger = await inBucket("activeOnly=true&minAgeDays=3&maxAgeDays=7");
    const older = await inBucket("activeOnly=true&minAgeDays=7&maxAgeDays=14");

    check("an item exactly on a bucket edge sits in the younger bucket", younger === 1, `got ${younger}`);
    check("and is excluded from the older one", older === 0, `got ${older}`);
    check("so adjacent ageing buckets never double-count it", younger + older === 1, `${younger}+${older}`);
  }

  section("input — webhook must never 5xx");
  const token = process.env.AZDO_WEBHOOK_TOKEN;
  const hook = async (body) => {
    const res = await fetch(`${BASE}/api/webhooks/azure?token=${token ?? ""}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: typeof body === "string" ? body : JSON.stringify(body),
    });
    let json = null;
    const text = await res.text();
    try { json = JSON.parse(text); } catch { /* crash page */ }
    return { status: res.status, json };
  };
  if (!token) {
    console.log("  – webhook checks skipped (set AZDO_WEBHOOK_TOKEN)");
  } else {
    check("no token is rejected", (await (await fetch(`${BASE}/api/webhooks/azure`, { method: "POST", body: "{}" })).status) === 401);
    for (const [label, body] of [
      ["null body", null], ["array body", [1, 2]], ["string body", '"hi"'],
      ["number body", "42"], ["not json", "<<<"], ["nested junk", { resource: { workItemId: { a: 1 } } }],
    ]) {
      const r = await hook(body);
      check(`webhook ${label}`, r.status < 500 && r.json !== null, `[${r.status}]`);
    }
    check("non-work-item event ignored", /ignored/.test((await hook({ eventType: "build.completed", resource: { workItemId: 5 } })).json?.skipped ?? ""));
    for (const id of ["abc", -1, 1.5, 0])
      check(`work item id ${JSON.stringify(id)} rejected`, /no usable/.test((await hook({ eventType: "workitem.updated", resource: { workItemId: id } })).json?.skipped ?? ""));
  }

  section("ageing by severity — the admin's clock, per severity");
  {
    /*
     * A Critical left for three days and a Minor left for three days are not
     * the same problem. An admin may hold one severity to a tighter clock than
     * the POD's own, and the tile, the drill-down behind it and the roll-up row
     * all have to agree about which items that catches.
     *
     * The POD waits 30 days by default and holds Critical to 2, so every
     * assertion below distinguishes the two rules — a fixture where they agreed
     * would pass no matter which one the code applied.
     */
    const day = 86_400_000;
    const iso = (t) => new Date(t).toISOString().slice(0, 10);
    const made0 = await post("/api/teams", {
      name: "Chk Severity POD",
      ageingThresholdDays: 30,
      severityThresholdDays: { Critical: 2 },
    });
    const pod = made0.json?.team?.id;
    check("the POD saved its severity rule", made0.json?.team?.severityThresholdDays?.Critical === 2, JSON.stringify(made0.json?.team?.severityThresholdDays));
    if (pod) made.push(pod);

    if (pod) {
      const csv = [
        "Work Item ID,Title,Assignee,Severity,Status,Created Date,Closed Date",
        `Sv-1,Sev fixture old critical,Sev Tester,Critical,Open,${iso(Date.now() - 5 * day)},`,
        `Sv-2,Sev fixture new critical,Sev Tester,Critical,Open,${iso(Date.now() - 1 * day)},`,
        `Sv-3,Sev fixture old minor,Sev Tester,Minor,Open,${iso(Date.now() - 5 * day)},`,
      ].join("\n");
      const form = new FormData();
      form.set("file", new File([csv], "severity.csv"));
      form.set("teamId", pod);
      const up = await fetch(BASE + "/api/upload", { method: "POST", body: form, headers: { cookie: session.header() } });
      check("the fixture landed", up.status === 200, `${up.status}`);

      const board = await get(`/api/metrics?teamId=${pod}`);
      check("only the critical past its own 2 days is aged", board.json?.totals?.criticalAged === 1, `${board.json?.totals?.criticalAged}`);
      check("...and the tile names 2 days, not the POD's 30", board.json?.criticalThresholdDays === 2, `${board.json?.criticalThresholdDays}`);
      check("...and the board reports the severity is tuned", board.json?.severityTuned === true);

      /* The drawer the tile opens must return exactly what the tile counted. */
      const drill = await get(`/api/items?teamId=${pod}&severity=Critical&agedOnly=true&limit=50`);
      check("the drill-down returns exactly that one", (drill.json?.items ?? []).length === 1, `${drill.json?.items?.length}`);
      check("...and it is the older one", drill.json?.items?.[0]?.workItemId === "Sv-1", `${drill.json?.items?.[0]?.workItemId}`);

      /* The 5-day Minor is inside the POD's own 30 days, so it is not aged. */
      const minors = await get(`/api/items?teamId=${pod}&severity=Minor&agedOnly=true&limit=50`);
      check("an untuned severity still waits the POD's 30 days", (minors.json?.items ?? []).length === 0, `${minors.json?.items?.length}`);

      /* The roll-up row carries the severity's clock, not the board's. */
      const rollup = (await get("/api/metrics")).json?.teams?.find((t) => t.teamId === pod);
      check("the roll-up row carries the tuned clock", rollup?.criticalThresholdDays === 2, `${rollup?.criticalThresholdDays}`);
      check("...and counts by it", rollup?.criticalAged === 1, `${rollup?.criticalAged}`);

      /*
       * Clearing the override must hand the severity back to the POD — the
       * whole point of storing a missing key rather than a number.
       */
      await post("/api/teams", { id: pod, name: "Chk Severity POD", ageingThresholdDays: 30, severityThresholdDays: {} });
      const cleared = await get(`/api/metrics?teamId=${pod}`);
      check("clearing the override restores the POD's 30 days", cleared.json?.totals?.criticalAged === 0, `${cleared.json?.totals?.criticalAged}`);
      check("...and the tile names 30 again", cleared.json?.criticalThresholdDays === 30, `${cleared.json?.criticalThresholdDays}`);
      check("...and the drill-down agrees", ((await get(`/api/items?teamId=${pod}&severity=Critical&agedOnly=true&limit=50`)).json?.items ?? []).length === 0);

      /* Out-of-range values are refused by the server, not only by the form. */
      const bad = await post("/api/teams", { id: pod, name: "Chk Severity POD", severityThresholdDays: { Critical: 0, Sev9: 5 } });
      check("a zero-day rule is not stored as zero", bad.json?.team?.severityThresholdDays?.Critical !== 0, `${bad.json?.team?.severityThresholdDays?.Critical}`);
      check("...and an unknown severity is dropped", bad.json?.team?.severityThresholdDays?.Sev9 === undefined);
    }
  }

  section("input — a failed sync must not corrupt the watermark");
  await post("/api/sync", { teamId: "amc-pod" });
  /*
   * Read through the store, so this works on whichever driver is configured.
   * It used to fetch `localhost:9200` directly — a leftover from the
   * OpenSearch days that the MongoDB migration missed, and which quietly
   * stopped testing anything once that database was gone.
   */
  const store = getStore();
  await store.init();
  const wm = (await store.sync.byId("amc-pod"))?.lastChangedDate;
  check("watermark is not the epoch", new Date(wm).getFullYear() > 2000, `=${wm}`);
  check("watermark stays within the first-run window", Date.now() - new Date(wm) < 370 * 86400000, `=${wm}`);

  for (const id of [...new Set(made)]) await del(`/api/teams/${id}`);
  for (const e of ["chk-sub@x.com", "chk-role@x.com"]) await del(`/api/users?email=${e}`);
}

// ---------------------------------------------------------------------- auth

async function auth(admin) {
  section("auth — member is confined to their PODs");
  await call(admin, "/api/users", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "chk-member@x.com", name: "Checker", password: "pw123456", role: "member", teamIds: ["amc-pod"] }),
  });
  const member = await signIn("chk-member@x.com", "pw123456");

  const reads = [
    ["metrics without a teamId", "/api/metrics", 200],
    ["metrics for their own POD", "/api/metrics?teamId=amc-pod", 200],
    ["metrics for another POD", "/api/metrics?teamId=payments-pod", 403],
    ["items for another POD", "/api/items?teamId=payments-pod", 403],
    ["the user list", "/api/users", 403],
  ];
  for (const [label, path, want] of reads) check(label, (await call(member, path)).status === want, `want ${want}`);

  const scoped = await call(member, "/api/metrics");
  check("their metrics cover only their POD", scoped.json.teams.every((t) => t.teamId === "amc-pod"));
  const teams = await call(member, "/api/teams");
  check("their POD list is scoped", teams.json.teams.length === 1 && teams.json.teams[0].id === "amc-pod");

  /*
   * "Where is this?" must not become "what PODs exist?".
   *
   * The endpoint answers with POD names, so an unscoped version would let any
   * member enumerate every POD in the instance — and, by searching a name, who
   * is on it. It is handed the caller's own accessible list rather than loading
   * its own, and this is what proves it.
   */
  {
    const where = await call(member, "/api/search/pods?q=a");
    check("search-scope is reachable by a member", where.status === 200, `${where.status}`);
    const named = (where.json?.matches ?? []).map((m) => m.teamId);
    check("...and names only PODs they can see", named.every((id) => id === "amc-pod"), named.join(", "));
  }

  section("auth — member cannot write");
  const json = (body) => ({ method: "POST", headers: { "Content-Type": "application/json" }, body });
  const writes = [
    ["create a POD", "/api/teams", json('{"name":"Sneaky"}')],
    ["delete a POD", "/api/teams/payments-pod", { method: "DELETE" }],
    ["create a user", "/api/users", json('{"email":"x@y.com","role":"admin"}')],
    ["delete a user", "/api/users?email=admin@example.com", { method: "DELETE" }],
    ["sync every POD", "/api/sync", json("{}")],
    ["sync another POD", "/api/sync", json('{"teamId":"payments-pod"}')],
    ["test another POD's connection", "/api/teams/payments-pod/test", { method: "POST" }],
    ["promote themselves", "/api/users", json('{"email":"chk-member@x.com","role":"admin"}')],
    // The one that matters most: a member must not be able to take over the
    // admin account by setting its password.
    ["reset the admin's password", "/api/users/password", json('{"email":"' + ADMIN_EMAIL + '","next":"takeover12345"}')],
    ["reset another member's password", "/api/users/password", json('{"email":"chk-sub@x.com","next":"takeover12345"}')],
  ];
  for (const [label, path, init] of writes) check(label, (await call(member, path, init)).status === 403);
  check("still blocked afterwards", (await call(member, "/api/metrics?teamId=payments-pod")).status === 403);

  /*
   * Uploading is a write, and the one a member could most plausibly mistake for
   * a read of their own POD. A spreadsheet row overwrites whatever item shares
   * its id, so an upload is a bulk edit of the board the whole POD is measured
   * by — from a file nobody else has seen. `amc-pod` is the member's *own* POD,
   * which is the point: the refusal is about the act, not the access.
   */
  const memberUpload = new FormData();
  memberUpload.set("file", new File(["Work Item ID,Title\nMx-1,Member upload"], "member.csv"));
  memberUpload.set("teamId", "amc-pod");
  const memberUp = await fetch(BASE + "/api/upload", {
    method: "POST",
    body: memberUpload,
    headers: { cookie: member.header() },
  });
  check("upload a spreadsheet to their own POD", memberUp.status === 403, `${memberUp.status}`);
  const memberSaid = await memberUp.json().catch(() => null);
  check("...and is told why, not given a stack trace", /admin/i.test(memberSaid?.error ?? ""), memberSaid?.error ?? "no body");

  /* The item did not land. A 403 that still wrote would be the worst outcome. */
  const after403 = await call(member, "/api/items?teamId=amc-pod&search=Member%20upload");
  check("...and nothing was written", (after403.json?.items ?? []).length === 0, `${after403.json?.items?.length}`);

  /* Reading is still theirs: the gate is on writing, not on the data. */
  check("downloading their own POD still works", (await call(member, "/api/export?teamId=amc-pod")).status === 200);

  section("auth — changing your own password");
  /*
   * Self-service, and the only route that touches the caller's own credentials.
   * The current password is verified rather than merely required: a live
   * session is not proof of who is at the keyboard, and an unlocked laptop
   * would otherwise be a complete account takeover.
   */
  {
    const post = (j, body) => call(j, "/api/account/password", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

    check("anonymous cannot change a password", (await post(anon, { current: "x", next: "whatever12345" })).status === 401);

    const wrong = await post(member, { current: "not-the-password", next: "brandNew12345" });
    check("a wrong current password is refused", wrong.status === 403, `[${wrong.status}]`);
    check("...and says so plainly", /not your current password/i.test(wrong.json?.error ?? ""), wrong.json?.error);

    check("a short new password is refused", (await post(member, { current: "pw123456", next: "tiny" })).status === 400);
    check("reusing the current password is refused", (await post(member, { current: "pw123456", next: "pw123456" })).status === 400);
    check("a blank current password is refused", (await post(member, { current: "", next: "brandNew12345" })).status === 400);
    check("malformed JSON is a 400, not a 500", (await call(member, "/api/account/password", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{{{" })).status === 400);

    /*
     * The escalation attempt. This route reads the account from the session,
     * never from the body, and writes only the hash — so a role or a POD list
     * sent alongside a legitimate password change must do nothing at all.
     */
    const smuggle = await post(member, { current: "pw123456", next: "changed12345", role: "admin", teamIds: ["payments-pod"], email: "admin@example.com" });
    check("a valid change succeeds", smuggle.status === 200, `[${smuggle.status}]`);

    const after = await signIn("chk-member@x.com", "changed12345");
    check("the new password works", (await call(after, "/api/metrics")).status === 200);
    check("the old password does not", (await call(await signIn("chk-member@x.com", "pw123456"), "/api/metrics")).status !== 200);
    check("the smuggled role did nothing", (await call(after, "/api/users")).status === 403);
    check("the smuggled POD did nothing", (await call(after, "/api/metrics?teamId=payments-pod")).status === 403);

    // Put it back, so the rest of the suite still signs in with pw123456.
    check("changing it back works", (await post(after, { current: "changed12345", next: "pw123456" })).status === 200);
  }

  section("auth — an admin setting somebody else's password");
  /*
   * There is no email reset in this product, so without this a forgotten
   * password is unrecoverable: the alternative is deleting the account and
   * recreating it, which drops the role and every POD they could see.
   */
  {
    const post = (j, body) => call(j, "/api/users/password", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

    check("a short password is refused", (await post(admin, { email: "chk-member@x.com", next: "tiny" })).status === 400);
    check("an unknown account is a 404", (await post(admin, { email: "ghost@nowhere.com", next: "longEnough123" })).status === 404);

    /*
     * An account with no password hash is either an SSO account or one somebody
     * created with the field left blank. They are indistinguishable here, so
     * the rule turns on whether SSO is configured at all.
     *
     * This suite runs with `AUTH_MODE=password`, so there are no SSO accounts
     * and setting a password is right — refusing it made a mistyped account
     * unrecoverable. The SSO-configured branch is covered directly in
     * `check-ui.mjs`, where the policy can be exercised without standing up an
     * identity provider.
     */
    await call(admin, "/api/users", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: "chk-sso@x.com", name: "SSO", role: "member" }) });
    const noHash = await post(admin, { email: "chk-sso@x.com", next: "longEnough123" });
    check("with SSO off, an account with no password can be given one", noHash.status === 200, `[${noHash.status}] ${noHash.json?.error ?? ""}`);

    const done = await post(admin, { email: "chk-member@x.com", next: "resetByAdmin7" });
    check("a valid reset succeeds", done.status === 200, `[${done.status}]`);
    check("it names whose password moved", done.json?.email === "chk-member@x.com");
    check("it flags that this was not self", done.json?.self === false);

    const reset = await signIn("chk-member@x.com", "resetByAdmin7");
    check("the reset password works", (await call(reset, "/api/metrics")).status === 200);

    // The whole reason this beats delete-and-recreate.
    const row = (await call(admin, "/api/users")).json.users.find((u) => u.email === "chk-member@x.com");
    check("the role survived the reset", row?.role === "member", row?.role);
    check("their PODs survived the reset", JSON.stringify(row?.teamIds) === JSON.stringify(["amc-pod"]), JSON.stringify(row?.teamIds));
    check("they still have a password", row?.hasPassword === true);

    // Back to what the rest of the suite expects.
    await post(admin, { email: "chk-member@x.com", next: "pw123456" });
    check("restored for the rest of the run", (await call(await signIn("chk-member@x.com", "pw123456"), "/api/metrics")).status === 200);
  }

  /*
   * The "malformed stored user" case moved to `check-ui.mjs`.
   *
   * It used to write a corrupted record straight into the database to bypass
   * `saveUser`'s sanitising, which made it specific to whatever store was
   * underneath: against Mongo the schema cast the bad value back into an array,
   * so the poison never landed and the check passed without testing anything.
   *
   * `canSeeTeam` is a pure function, so the guard is now exercised directly —
   * every malformed shape, no server, no driver, nothing to race.
   */

  section("auth — an account created without a password is recoverable");
  {
    /*
     * Reported from a real instance: a member was added with the password field
     * left blank, could not sign in, and there was no way to fix it — the admin
     * route refused to set a password on an account that had none.
     *
     * Recreating them was the only route left, and that drops their role and
     * every POD they could see.
     */
    const post = (path, body) =>
      call(admin, path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

    const email = "chk-nopass@x.com";
    await post("/api/users", { email, name: "No Password", role: "member", teamIds: ["amc-pod"] });

    const listed = (await call(admin, "/api/users")).json.users.find((u) => u.email === email);
    check("an account can be created with no password", listed?.hasPassword === false, `${listed?.hasPassword}`);
    check("...and the list says so, so the row can show it", "hasPassword" in (listed ?? {}));

    /* They cannot sign in — which is the reported symptom. */
    const before = await signIn(email, "anything123");
    check("they cannot sign in yet", (await call(before, "/api/metrics")).status !== 200);

    /* The admin sets one, and that is the whole fix. */
    const set = await post("/api/users/password", { email, next: "granted12345" });
    check("an admin can set their password", set.status === 200, `${set.status} ${set.json?.error ?? ""}`);

    const after = await signIn(email, "granted12345");
    check("...and then they can sign in", (await call(after, "/api/metrics")).status === 200);

    /*
     * And the fix must not have cost them anything. Recreating the account was
     * the old workaround precisely because it did.
     */
    const kept = (await call(admin, "/api/users")).json.users.find((u) => u.email === email);
    check("their role survived", kept?.role === "member", kept?.role);
    check("their PODs survived", JSON.stringify(kept?.teamIds) === JSON.stringify(["amc-pod"]), JSON.stringify(kept?.teamIds));
    check("and they now have a password", kept?.hasPassword === true);

    await call(admin, `/api/users?email=${encodeURIComponent(email)}`, { method: "DELETE" });
  }

  section("auth — the instance cannot be left without an admin");
  {
    /*
     * A one-way door, found by walking through it: demoting the only admin
     * succeeded, and every admin route — including the one that would undo
     * it — then answered "Admins only." Recovery meant editing the store by
     * hand.
     */
    /* `post` belongs to the input section; this one has `call` and an admin. */
    const post = (path, body) =>
      call(admin, path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

    const before = (await call(admin, "/api/users")).json.users;
    const admins = before.filter((u) => u.role === "admin");
    check("the suite can see who the admins are", admins.length >= 1, `${admins.length}`);

    if (admins.length === 1) {
      const only = admins[0].email;
      const demote = await post("/api/users", { email: only, role: "member" });
      check("demoting the only admin is refused", demote.status === 409, `${demote.status}`);
      check("...in prose that says what to do first", /make somebody else an admin first/i.test(demote.json?.error ?? ""), demote.json?.error ?? "");

      const remove = await call(admin, `/api/users?email=${encodeURIComponent(only)}`, { method: "DELETE" });
      check("deleting the only admin is refused", remove.status >= 400, `${remove.status}`);

      /* And they are still an admin afterwards — a refusal that half-applied
       * would be worse than none. */
      const after = (await call(admin, "/api/users")).json.users.find((u) => u.email === only);
      check("...and they are still an admin", after?.role === "admin", after?.role);
    }

    /*
     * With a second admin, the first is free to step down — the guard must not
     * become "admins can never change role".
     */
    await post("/api/users", { email: "chk-admin2@x.com", name: "Second", password: "pw123456", role: "admin" });
    const second = (await call(admin, "/api/users")).json.users.find((u) => u.email === "chk-admin2@x.com");
    check("a second admin can be created", second?.role === "admin", second?.role);
    const demoteSecond = await post("/api/users", { email: "chk-admin2@x.com", role: "member" });
    check("...and demoted once they are not the last", demoteSecond.status === 200, `${demoteSecond.status}`);
    await call(admin, "/api/users?email=chk-admin2@x.com", { method: "DELETE" });
  }

  section("auth — page guards and anonymous access");
  /*
   * A fresh session: the password sections above changed this account's
   * password, and a password change now ends every session it had — including
   * the jar this suite was holding. Reusing it would test a signed-out caller.
   */
  const memberNow = await signIn("chk-member@x.com", "pw123456");
  const adminPage = await call(memberNow, "/admin");
  check("/admin redirects a member", adminPage.status === 307 && adminPage.location?.endsWith("/"));
  check("/admin allows an admin", (await call(admin, "/admin")).status === 200);
  for (const path of ["/api/metrics", "/api/items", "/api/users", "/api/teams"])
    check(`anonymous ${path} is 401`, (await call(anon, path)).status === 401);
  const home = await call(anon, "/");
  check("anonymous / redirects to login", home.status === 307 && home.location?.includes("/login"));

  // Every account this suite created, gone again — a run must leave the
  // instance exactly as it found it.
  for (const email of ["chk-member@x.com", "chk-sso@x.com"]) {
    await call(admin, `/api/users?email=${encodeURIComponent(email)}`, { method: "DELETE" });
  }
}

// --------------------------------------------------------------------- main

const probe = await fetch(BASE + "/api/metrics").catch(() => null);
if (!probe) {
  console.error(`Cannot reach ${BASE}. Start it with: pnpm dev`);
  process.exit(1);
}
const authOff = probe.status === 200;

let session = anon;
if (!authOff) {
  session = await signIn(ADMIN_EMAIL, ADMIN_PASSWORD);
  const who = await call(session, "/api/metrics");
  if (who.status !== 200) {
    console.error(`Could not sign in as ${ADMIN_EMAIL}. Set ADMIN_EMAIL / ADMIN_PASSWORD, or run pnpm seed.`);
    process.exit(1);
  }
}

if (!only || only === "invariants") await invariants(session);
if (!only || only === "input") await input(session);
if (!only || only === "auth") {
  if (authOff) console.log("\nauth — skipped, AUTH_MODE=off");
  else await auth(session);
}

console.log("\n" + "─".repeat(60));
console.log(failures === 0 ? `All ${checks} checks passed.` : `${failures} of ${checks} checks FAILED.`);
process.exit(failures ? 1 : 0);
