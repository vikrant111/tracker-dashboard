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
      d.health === (t.total > 0 ? Math.round((t.closed / t.total) * 100) : 100),
      `${d.health} vs ${t.closed}/${t.total}`,
    );
    // Age and severity moved out of the score entirely. If either could still
    // reach it, a board with aged criticals would not match the plain division.
    check("nothing but closure moves the score", d.health === (t.total > 0 ? Math.round(((t.total - t.active) / t.total) * 100) : 100));
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
  for (const [v, want] of [[-5, 1], [0, 1], [0.5, 1], [99999, 365], ["abc", 7], [14, 14]]) {
    const r = await mk("Thresh POD", { ageingThresholdDays: v });
    check(`threshold ${JSON.stringify(v)} -> ${want}`, r.json?.team?.ageingThresholdDays === want, `got ${r.json?.team?.ageingThresholdDays}`);
  }
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

  section("input — a failed sync must not corrupt the watermark");
  await post("/api/sync", { teamId: "amc-pod" });
  const state = await (await fetch("http://localhost:9200/tracker-sync/_doc/amc-pod")).json();
  const wm = state._source?.lastChangedDate;
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
  ];
  for (const [label, path, init] of writes) check(label, (await call(member, path, init)).status === 403);
  check("still blocked afterwards", (await call(member, "/api/metrics?teamId=payments-pod")).status === 403);

  section("auth — a malformed stored user cannot widen access");
  // Written straight into OpenSearch, bypassing saveUser's sanitising, so this
  // exercises the guard in session.ts rather than the one on the write path.
  // Without it, `.includes()` on a string is a substring test and this user
  // would reach amc-pod.
  const OS = (process.env.OPENSEARCH_URL || "http://localhost:9200").replace(/\/+$/, "");
  const bcrypt = (await call(admin, "/api/users")).status === 200; // ensure admin still valid
  if (bcrypt) {
    await call(admin, "/api/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "chk-bad@x.com", name: "Bad", password: "pw123456", role: "member", teamIds: [] }),
    });
    const doc = await (await fetch(`${OS}/tracker-users/_doc/chk-bad@x.com`)).json();
    const poisoned = { ...doc._source, teamIds: "amc-pod-archive" };
    await fetch(`${OS}/tracker-users/_doc/chk-bad%40x.com?refresh=true`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(poisoned),
    });
    const bad = await signIn("chk-bad@x.com", "pw123456");
    check("string teamIds grants no POD access", (await call(bad, "/api/metrics?teamId=amc-pod")).status === 403,
      `[${(await call(bad, "/api/metrics?teamId=amc-pod")).status}]`);
    check("string teamIds is treated as no PODs", (await call(bad, "/api/metrics")).status === 403);
    await call(admin, "/api/users?email=chk-bad@x.com", { method: "DELETE" });
  }

  section("auth — page guards and anonymous access");
  const adminPage = await call(member, "/admin");
  check("/admin redirects a member", adminPage.status === 307 && adminPage.location?.endsWith("/"));
  check("/admin allows an admin", (await call(admin, "/admin")).status === 200);
  for (const path of ["/api/metrics", "/api/items", "/api/users", "/api/teams"])
    check(`anonymous ${path} is 401`, (await call(anon, path)).status === 401);
  const home = await call(anon, "/");
  check("anonymous / redirects to login", home.status === 307 && home.location?.includes("/login"));

  await call(admin, "/api/users?email=chk-member@x.com", { method: "DELETE" });
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
