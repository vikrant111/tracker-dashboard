/**
 * Do both drivers store the same document?
 *
 *     pnpm parity              check the driver in .env.local
 *     DB_DRIVER=mongodb pnpm parity > /tmp/mongo.json
 *     DB_DRIVER=json    pnpm parity > /tmp/json.json
 *     diff /tmp/mongo.json /tmp/json.json     # must be empty
 *
 * Run it before switching a real deployment from files to MongoDB. It writes
 * one POD and one item through the configured driver, reads them back, and
 * prints them. If the two outputs differ, something is stored differently and
 * the migration will not be clean.
 *
 * The fixture is chosen to catch the things that usually drift: a numeric
 * string that has to become a number, an empty object that must survive, a date
 * that has to come back as a Date, and a severity outside the vocabulary that
 * both drivers must refuse.
 *
 * Everything it writes is removed again, so it is safe against a real store.
 */
import { getStore } from "../src/db/store/index.ts";

const POD = "parity-probe-pod";
const store = getStore();

const team = {
  id: POD,
  name: "Parity Probe POD",
  description: "Written and removed by pnpm parity.",
  members: [{ name: "A Person", email: "a@example.com", designation: "QA", role: "lead" }],
  azure: { orgUrl: "", project: "", pat: "", areaPath: "", workItemTypes: ["Bug"] },
  fieldMap: { severity: "s", environment: "e", status: "st" },
  // An empty map has to survive. `minimize: false` is what keeps it, and losing
  // it would turn "no severity overrides" into "field absent".
  valueMap: { severity: {}, environment: {}, status: {} },
  ageingThresholdDays: 7,
  severityThresholdDays: { Critical: 2 },
  createdAt: "2026-01-01T00:00:00.000Z",
};

const item = {
  id: `${POD}:9001`,
  workItemId: "9001",
  teamId: POD,
  source: "excel",
  kind: "bug",
  type: "Bug",
  title: "Parity fixture",
  url: "",
  assignee: "A Person",
  assigneeEmail: "a@example.com",
  severity: "Critical",
  environment: "Production",
  status: "Open",
  state: "Active",
  // A string on purpose: a spreadsheet gives text, and both drivers must store
  // the number MongoDB's schema says this is.
  priority: "2",
  tags: ["fixture"],
  createdDate: new Date("2026-01-01T00:00:00.000Z"),
  changedDate: null,
  closedDate: null,
  isActive: true,
};

try {
  await store.init();

  await store.teams.save(team);
  const failed = await store.items.bulkUpsert([item]);
  const refused = await store.items.bulkUpsert([{ ...item, id: `${POD}:9002`, severity: "Blocker" }]);

  const savedTeam = await store.teams.byId(POD);
  const [savedItem] = await store.items.find({ teamId: POD }, Date.now());

  // Dates print as ISO so two runs are comparable as text.
  const asText = (value) => JSON.stringify(value, (_key, v) => (v instanceof Date ? v.toISOString() : v), 2);

  console.log(
    asText({
      failedWrites: failed,
      refusedBadSeverity: refused,
      dateCameBackAsDate: savedItem?.createdDate instanceof Date,
      team: savedTeam,
      item: savedItem,
    }),
  );
} finally {
  // Always, even if a check above threw. A probe that leaves a POD behind is
  // worse than no probe.
  await store.items.deleteByTeam(POD).catch(() => {});
  await store.teams.remove(POD).catch(() => {});
  await store.close().catch(() => {});
}

process.exit(0);
