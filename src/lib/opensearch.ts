import { Client } from "@opensearch-project/opensearch";

const PREFIX = process.env.OPENSEARCH_INDEX_PREFIX || "tracker";

export const IDX = {
  items: `${PREFIX}-items`,
  teams: `${PREFIX}-teams`,
  users: `${PREFIX}-users`,
  sync: `${PREFIX}-sync`,
};

let client: Client | null = null;

export function os(): Client {
  if (!client) {
    const node = process.env.OPENSEARCH_URL || "http://localhost:9200";
    const username = process.env.OPENSEARCH_USERNAME;
    const password = process.env.OPENSEARCH_PASSWORD;
    client = new Client({
      node,
      auth: username ? { username, password: password || "" } : undefined,
      ssl: { rejectUnauthorized: false },
    });
  }
  return client;
}

// Mappings live in JSON so `pnpm seed` can create identical indices without
// importing TypeScript. Keyword fields are what make the aggregations work —
// dynamic mapping would type `assignee` as text and every terms agg would fail.
import MAPPINGS from "./mappings.json";

let ready: Promise<void> | null = null;

/** Idempotent index bootstrap. Every entry point awaits this once per process. */
export function ensureIndices(): Promise<void> {
  if (!ready) {
    ready = (async () => {
      const specs: [string, object][] = [
        [IDX.items, MAPPINGS.items],
        [IDX.teams, MAPPINGS.teams],
        [IDX.users, MAPPINGS.users],
        [IDX.sync, MAPPINGS.sync],
      ];
      for (const [index, mappings] of specs) {
        const { body: exists } = await os().indices.exists({ index });
        if (!exists) {
          await os().indices.create({
            index,
            body: { settings: { number_of_shards: 1, number_of_replicas: 0 }, mappings },
          });
        }
      }
    })().catch((err) => {
      ready = null; // let the next request retry instead of caching the failure
      throw err;
    });
  }
  return ready;
}

export async function getDoc<T>(index: string, id: string): Promise<T | null> {
  try {
    const { body } = await os().get({ index, id });
    return body._source as T;
  } catch (err) {
    if ((err as { statusCode?: number }).statusCode === 404) return null;
    throw err;
  }
}

export async function putDoc(index: string, id: string, doc: unknown, refresh = true) {
  await os().index({ index, id, body: doc as Record<string, unknown>, refresh });
}

/**
 * The client types aggregations as a union of every possible aggregate shape,
 * which is unusable for reading our own known responses. We describe the shape
 * we asked for once, here, and keep the rest of the codebase typed against it.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
export type RawSearch<T> = {
  hits: {
    total: { value: number };
    /** `sort` is present when the query asked for one — it is the cursor `search_after` needs. */
    hits: { _source: T; sort?: unknown[] }[];
  };
  aggregations: Record<string, any>;
};

export async function search<T>(index: string, body: object): Promise<RawSearch<T>> {
  const res = await os().search({ index, body } as any);
  return res.body as unknown as RawSearch<T>;
}

export async function searchAll<T>(index: string, body: object, size = 1000): Promise<T[]> {
  const res = await search<T>(index, { size, ...body });
  return res.hits.hits.map((h) => h._source);
}

/** Bulk upsert by document id. Returns the number of failed items. */
export async function bulkIndex(index: string, docs: { id: string }[]): Promise<number> {
  if (!docs.length) return 0;
  const operations = docs.flatMap((doc) => [{ index: { _index: index, _id: doc.id } }, doc]);
  const { body } = await os().bulk({ body: operations, refresh: true });
  if (!body.errors) return 0;
  return body.items.filter((i: Record<string, { error?: unknown }>) => {
    const op = i.index || i.create || i.update;
    return op?.error;
  }).length;
}
