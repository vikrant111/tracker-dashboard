/**
 * Fills the store: the first admin, and (unless --no-demo) a worked example POD
 * with enough realistic history that every tile, chart and drill-down has
 * something to show.
 *
 *   pnpm seed
 *   pnpm seed --no-demo     only the admin
 *   pnpm seed --reset       empty the store first
 *
 * Works against whichever driver `DB_DRIVER` selects — files under `DB_store/`
 * by default, a real cluster with `DB_DRIVER=mongodb`. It goes through the same
 * store the app does, so what it writes and what the app reads cannot drift.
 */
import bcrypt from "bcryptjs";
import { getStore } from "../src/db/store/index.ts";

/** Deterministic PRNG so re-seeding produces the same board. */
let seed = 20260822;
const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
const weighted = (pairs) => {
  const total = pairs.reduce((n, [, w]) => n + w, 0);
  let r = rnd() * total;
  for (const [value, w] of pairs) if ((r -= w) <= 0) return value;
  return pairs[0][0];
};

const AMC_MEMBERS = [
  { name: "Ananya Rao", email: "ananya.rao@example.com", designation: "POD Lead", role: "lead" },
  { name: "Vikram Shetty", email: "vikram.shetty@example.com", designation: "Senior Engineer", role: "member" },
  { name: "Priya Nair", email: "priya.nair@example.com", designation: "QA Engineer", role: "member" },
  { name: "Rohit Malhotra", email: "rohit.malhotra@example.com", designation: "Engineer", role: "member" },
  { name: "Sneha Iyer", email: "sneha.iyer@example.com", designation: "Business Analyst", role: "member" },
];

const PAY_MEMBERS = [
  { name: "Kabir Menon", email: "kabir.menon@example.com", designation: "POD Lead", role: "lead" },
  { name: "Tara Bose", email: "tara.bose@example.com", designation: "Senior Engineer", role: "member" },
  { name: "Arjun Pillai", email: "arjun.pillai@example.com", designation: "QA Engineer", role: "member" },
];

const TITLES = [
  "Statement download returns an empty PDF",
  "Folio search times out beyond 500 results",
  "SIP mandate date shifts by one day in IST",
  "Redemption amount rounds down by a rupee",
  "KYC status stuck on pending after approval",
  "Portfolio chart renders before data arrives",
  "Duplicate transaction rows after retry",
  "Nominee percentage accepts more than 100",
  "Session drops on tab switch",
  "Export to Excel loses the currency format",
  "Bank mandate upload rejects valid IFSC codes",
  "Switch order confirmation email never sends",
  "NAV history missing for the last trading day",
  "Login lockout counter never resets",
  "Capital gains report double-counts bonus units",
  "Mobile OTP screen loses focus on paste",
  "Dashboard totals disagree with the ledger",
  "Purchase fails silently when the folio is dormant",
  "Search ignores diacritics in investor names",
  "Report scheduler fires twice at month end",
];

const ENVIRONMENTS = [
  ["IT-UAT", 30],
  ["BIZ-UAT", 26],
  ["CUG", 22],
  ["Production", 18],
  ["Unknown", 4],
];
const SEVERITIES = [
  ["Critical", 12],
  ["Major", 34],
  ["Minor", 44],
  ["Unknown", 10],
];
const OPEN_STATUSES = [
  ["Open", 44],
  ["Commented", 22],
  ["For QA Validation", 26],
  ["Unknown", 8],
];
const TYPES = [
  ["Bug", 68],
  ["Issue", 14],
  ["Task", 12],
  ["User Story", 6],
];

const DAY = 86_400_000;

function buildItems(team, members, count, startId) {
  const now = Date.now();
  const items = [];

  for (let i = 0; i < count; i++) {
    const id = startId + i;
    const member = pick(members);
    const type = weighted(TYPES);
    const severity = weighted(SEVERITIES);
    const environment = weighted(ENVIRONMENTS);

    // Weight creation toward the recent past, with a long tail that produces
    // the genuinely aged items the ageing board exists to surface.
    const ageDays = Math.floor(Math.pow(rnd(), 1.7) * 90);
    const createdDate = new Date(now - ageDays * DAY - Math.floor(rnd() * DAY));

    // Older items are likelier to be resolved; criticals close faster.
    const closeChance = Math.min(0.9, 0.25 + ageDays / 120 + (severity === "Critical" ? 0.18 : 0));
    const isClosed = rnd() < closeChance;

    let status;
    let closedDate = null;
    if (isClosed) {
      status = rnd() < 0.12 ? "Not a Bug" : "Closed";
      const openFor = Math.max(1, Math.floor(rnd() * Math.max(2, ageDays)));
      closedDate = new Date(createdDate.getTime() + openFor * DAY);
      if (closedDate.getTime() > now) closedDate = new Date(now - Math.floor(rnd() * DAY));
    } else {
      status = weighted(OPEN_STATUSES);
    }

    const kind = type === "Bug" ? "bug" : rnd() < 0.15 ? "cr" : "ticket";
    const tags = [environment.toLowerCase()];
    if (kind === "cr") tags.push("CR");

    items.push({
      id: `${team.id}:${id}`,
      workItemId: String(id),
      teamId: team.id,
      source: "excel",
      kind,
      type,
      title: `${pick(TITLES)}${rnd() < 0.3 ? ` (${environment})` : ""}`,
      url: `https://dev.azure.com/demo/_workitems/edit/${id}`,
      assignee: member.name,
      assigneeEmail: member.email,
      severity,
      environment,
      status,
      state: status,
      priority: severity === "Critical" ? 1 : severity === "Major" ? 2 : 3,
      tags,
      createdDate: createdDate.toISOString(),
      changedDate: (closedDate ?? createdDate).toISOString(),
      closedDate: closedDate ? closedDate.toISOString() : null,
      isActive: !isClosed,
    });
  }
  return items;
}

const team = (id, name, description, members, areaPath) => ({
  id,
  name,
  description,
  members,
  azure: {
    orgUrl: process.env.AZDO_ORG_URL || "",
    project: process.env.AZDO_PROJECT || "",
    pat: "",
    areaPath,
    workItemTypes: ["Bug", "Issue", "Task", "User Story"],
  },
  fieldMap: {
    severity: "Microsoft.VSTS.Common.Severity",
    environment: "Custom.Environment",
    status: "System.State",
  },
  valueMap: { severity: {}, environment: {}, status: {} },
  ageingThresholdDays: 7,
  createdAt: new Date().toISOString(),
});

async function main() {
  const args = process.argv.slice(2);
  const demo = !args.includes("--no-demo");

  const store = getStore();
  await store.init();
  console.log(`Store: ${store.driver} — ${store.describe()}`);

  if (args.includes("--reset")) {
    await store.dropAll();
    console.log("Emptied the store.");
  }

  await store.ensureIndexes(true);

  const email = (process.env.ADMIN_EMAIL || "admin@example.com").toLowerCase();
  const password = process.env.ADMIN_PASSWORD || "changeme";
  await store.users.save({
    id: email,
    email,
    name: "Administrator",
    passwordHash: await bcrypt.hash(password, 10),
    role: "admin",
    teamIds: [],
    createdAt: new Date().toISOString(),
  });
  console.log(`Admin ready: ${email} / ${password}`);

  if (!demo) {
    console.log("Skipped demo data.");
    return;
  }

  const amc = team("amc-pod", "AMC POD", "Asset management console", AMC_MEMBERS, "Demo\\AMC");
  const pay = team("payments-pod", "Payments POD", "Collections and settlement", PAY_MEMBERS, "Demo\\Payments");
  for (const t of [amc, pay]) await store.teams.save(t);

  const items = [...buildItems(amc, AMC_MEMBERS, 240, 41000), ...buildItems(pay, PAY_MEMBERS, 120, 52000)];

  /*
   * Real `Date`s, matching what the app writes. The JSON driver serialises them
   * back to ISO on the way to disk; Mongo stores them as dates. Handing either
   * a raw string here would work by accident on one driver and not the other.
   */
  const docs = items.map((item) => ({
    ...item,
    _id: item.id,
    createdDate: new Date(item.createdDate),
    changedDate: item.changedDate ? new Date(item.changedDate) : null,
    closedDate: item.closedDate ? new Date(item.closedDate) : null,
  }));

  const failed = await store.items.bulkUpsert(docs);
  if (failed) console.warn(`${failed} documents failed to write.`);

  const open = items.filter((i) => i.isActive).length;
  console.log(`Seeded ${items.length} work items across 2 PODs (${open} still open).`);
  console.log("Run `pnpm dev` and open http://localhost:3000");
}

main()
  .then(() => getStore().close())
  .catch(async (err) => {
    console.error(err.message);
    // Close, or the Mongo driver keeps the pool open and node never exits.
    await getStore().close().catch(() => {});
    process.exit(1);
  });
