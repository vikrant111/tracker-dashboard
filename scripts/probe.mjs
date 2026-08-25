/**
 * Reaching a host, and saying precisely why it failed.
 *
 * Its own module so `check-env.mjs` and the check suite share one copy. The
 * distinction that earns this file is **TLS versus everything else**: a proxy
 * that re-signs traffic produces a certificate error, and the fix for that
 * (trust the proxy's CA) has nothing in common with the fix for a blocked host
 * or a typo'd URL. Reporting both as "could not connect" sends people to the
 * wrong page.
 */

/**
 * Why a `fetch` threw.
 *
 * Node nests the real cause several levels down — the top-level error is a flat
 * `TypeError: fetch failed` — so the whole `cause` chain is flattened before
 * matching. Reading only `err.code` finds nothing at all.
 *
 * @returns {"tls"|"dns"|"refused"|"timeout"|"error"}
 */
export function classify(err) {
  const chain = [];
  for (let e = err; e; e = e.cause) {
    if (e.code) chain.push(e.code);
    if (e.message) chain.push(e.message);
  }
  const text = chain.join(" | ");

  /*
   * `UNABLE_TO_GET_ISSUER_CERT_LOCALLY` is the one a TLS-inspecting corporate
   * proxy produces, and the one people paste into a search box. The others are
   * its neighbours — the same cause, reported differently depending on where in
   * the chain verification gave up.
   */
  if (/UNABLE_TO_GET_ISSUER_CERT|UNABLE_TO_VERIFY_LEAF|SELF_SIGNED_CERT|DEPTH_ZERO_SELF_SIGNED|CERT_UNTRUSTED|CERT_HAS_EXPIRED|ERR_TLS/i.test(text))
    return "tls";
  if (/ENOTFOUND|EAI_AGAIN/i.test(text)) return "dns";
  if (/ECONNREFUSED/i.test(text)) return "refused";
  if (/TimeoutError|ETIMEDOUT|AbortError|The operation was aborted/i.test(text)) return "timeout";
  return "error";
}

/** The detail worth showing beside the verdict — the CA code, not the wrapper. */
export function detailOf(err) {
  for (let e = err; e; e = e.cause) {
    if (e.code && /CERT|SIGNED|ECONN|ENOTFOUND|EAI_AGAIN|ETIMEDOUT/i.test(e.code)) return e.code;
  }
  for (let e = err; e; e = e.cause) if (e.code) return e.code;
  return (err?.message ?? "unknown").slice(0, 120);
}

/**
 * Try a URL. Never throws — a failure is a return value, because every caller
 * wants to carry on and report the rest of its checks.
 */
export async function probe(url, { timeout = 8000 } = {}) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(timeout), redirect: "follow" });
    return { kind: "http", status: res.status };
  } catch (err) {
    return { kind: classify(err), detail: detailOf(err) };
  }
}
