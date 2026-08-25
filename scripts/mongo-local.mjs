/**
 * A local MongoDB, with nothing installed.
 *
 *     pnpm mongo:local
 *
 * For the machine that cannot install a database and cannot run Docker. It
 * downloads a `mongod` binary the first time (about 100 MB, cached in
 * `node_modules/.cache`) and runs it against a data directory in the repo, so
 * the data survives restarts.
 *
 * Leave it running in its own terminal — it is the database. Stop it with
 * Ctrl-C; nothing is lost.
 *
 * This is a **development convenience**, never production. Production points
 * `MONGODB_URI` at a real cluster — Atlas, or one your organisation runs.
 */
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DATA_DIR = join(ROOT, ".mongo-data");
const PORT = Number(process.env.MONGO_LOCAL_PORT || 27017);

async function main() {
  let MongoMemoryServer;
  try {
    ({ MongoMemoryServer } = await import("mongodb-memory-server"));
  } catch {
    console.error(
      "mongodb-memory-server is not installed. Run `pnpm install` first.\n" +
        "If you already have a MongoDB, you do not need this — set MONGODB_URI and skip it.",
    );
    process.exit(1);
  }

  mkdirSync(DATA_DIR, { recursive: true });

  console.log("Starting MongoDB…");
  console.log("(the first run downloads a mongod binary; after that it is instant)");

  const server = await MongoMemoryServer.create({
    instance: {
      port: PORT,
      /*
       * A real directory, so the data outlives the process. Without `dbPath`
       * this package runs entirely in memory — fine for a test suite, and
       * quietly infuriating for a developer who seeds a board and restarts.
       */
      dbPath: DATA_DIR,
      storageEngine: "wiredTiger",
    },
  });

  const uri = server.getUri();
  console.log(`\nMongoDB is listening.\n`);
  console.log(`  MONGODB_URI=mongodb://127.0.0.1:${PORT}\n`);
  console.log(`Data lives in .mongo-data/ (git-ignored).`);
  console.log(`Next: pnpm seed, then pnpm dev. Ctrl-C here stops the database.\n`);

  const stop = async () => {
    console.log("\nStopping MongoDB…");
    await server.stop().catch(() => {});
    process.exit(0);
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);

  /* Hold the process open; the server runs as a child of it. */
  setInterval(() => {}, 1 << 30);
  return uri;
}

main().catch((err) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`\nCould not start MongoDB: ${message}\n`);
  if (/download|ENOTFOUND|certificate|ETIMEDOUT|EACCES/i.test(message)) {
    console.error(
      "The mongod binary could not be downloaded. Behind a TLS-inspecting proxy,\n" +
        "set NODE_EXTRA_CA_CERTS first — see docs/restricted-environments.md.\n" +
        "Or skip this entirely and point MONGODB_URI at a hosted cluster.",
    );
  }
  if (/address already in use|EADDRINUSE/i.test(message)) {
    console.error(`Something is already listening on port ${PORT}. It may already be running.`);
  }
  process.exit(1);
});
