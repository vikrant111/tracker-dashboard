import { getStore } from "@/db/store";
import { resolveAuthSecret } from "@/lib/auth-secret";

export const dynamic = "force-dynamic";

/**
 * Is this instance able to serve?
 *
 * Unauthenticated on purpose: a load balancer has no session, and a health check
 * that needs one reports "unhealthy" forever. It is therefore written to give an
 * anonymous caller **nothing worth having** — no versions, no hostnames, no
 * cluster details, no error text. Just whether it can work.
 *
 * Two questions, deliberately separated:
 *
 * - **`/api/health`** — can this process serve at all? No I/O, so a liveness
 *   probe does not restart a healthy container because the database is briefly
 *   slow.
 * - **`/api/health?ready=1`** — can it actually do its job? This one pings
 *   OpenSearch, and is what a readiness probe should use: an instance that
 *   cannot reach the store should stop receiving traffic without being killed.
 *
 * ## Why the config is checked here
 *
 * A misconfigured `AUTH_SECRET` makes `auth.ts` throw at module load, so every
 * real page returns 500 — but this route does not import it, so it happily
 * answered 200. The container was marked healthy and sent live traffic while
 * being completely unable to serve a single page.
 *
 * A health check that only proves *itself* healthy is worse than none: it
 * converts an obvious outage into a silent one.
 */
function configured(): { ok: true } | { ok: false; reason: string } {
  const verdict = resolveAuthSecret(process.env.AUTH_SECRET, process.env.NODE_ENV === "production");
  if (!verdict.ok) return { ok: false, reason: verdict.reason };
  return { ok: true };
}

export async function GET(req: Request) {
  const noStore = { "Cache-Control": "no-store" } as const;

  const config = configured();
  if (!config.ok) {
    // Logged in full, reported as a bare state — the reason names an
    // environment variable, and that is not for an anonymous caller.
    console.error(`[health] not serving: ${config.reason}`);
    return Response.json({ status: "misconfigured" }, { status: 503, headers: noStore });
  }

  if (!new URL(req.url).searchParams.has("ready")) {
    return Response.json({ status: "ok" }, { headers: noStore });
  }

  try {
    /*
     * Connect, then ping. `connectToDatabase` is a no-op once warm, so this is
     * cheap — and the ping is what proves the socket is still alive rather than
     * merely that we once opened one.
     */
    const store = getStore();
    await store.init();
    await store.ping();
    return Response.json({ status: "ok", store: "reachable" }, { headers: noStore });
  } catch {
    /*
     * 503, not 500: "not ready" is a state an orchestrator knows how to wait
     * out. The reason is logged rather than returned — an anonymous caller
     * learning the cluster URL from an error string is how a health endpoint
     * becomes reconnaissance.
     */
    console.error("[health] the store is not reachable");
    return Response.json({ status: "unavailable", store: "unreachable" }, { status: 503, headers: noStore });
  }
}
