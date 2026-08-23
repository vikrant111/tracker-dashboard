import { syncAllTeams } from "./sync";

/**
 * Background Azure poller, so the board keeps up without a public URL for
 * Service Hooks. Started from the metrics route rather than instrumentation.ts:
 * route handlers are always the Node runtime, and the OpenSearch client cannot
 * be bundled for the Edge one.
 *
 * Stashed on globalThis so dev's module reloading cannot start a second timer.
 */
const KEY = Symbol.for("pod-tracker.poller");

type Global = typeof globalThis & { [KEY]?: NodeJS.Timeout };

export function startPoller() {
  const g = globalThis as Global;
  if (g[KEY]) return;

  const seconds = Number(process.env.SYNC_POLL_SECONDS ?? 120);
  if (!Number.isFinite(seconds) || seconds <= 0) return;

  let running = false;
  const tick = async () => {
    if (running) return; // a slow sync must not stack up behind itself
    running = true;
    try {
      const results = await syncAllTeams();
      const imported = results.reduce((n, r) => n + r.imported, 0);
      if (imported) console.log(`[sync] imported ${imported} work item(s)`);
      for (const r of results.filter((r) => r.error)) console.error(`[sync] ${r.teamName}: ${r.error}`);
    } catch (err) {
      console.error("[sync] poll failed", err);
    } finally {
      running = false;
    }
  };

  g[KEY] = setInterval(tick, seconds * 1000);
  g[KEY]?.unref?.();
  console.log(`[sync] polling Azure DevOps every ${seconds}s`);
  void tick();
}
