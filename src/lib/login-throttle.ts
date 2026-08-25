import { LOGIN } from "./constants.ts";

/**
 * Slowing down password guessing.
 *
 * bcrypt at cost 10 already makes each guess cost about a tenth of a second,
 * which is a bad rate for an attacker — but "bad rate" is not "no rate", and an
 * unattended script has all night. Eight wrong answers and the account stops
 * accepting passwords for fifteen minutes, which turns a dictionary run into
 * something that would take longer than anybody is willing to wait.
 *
 * ## What this is not
 *
 * **In-memory, so it is per-process.** Behind several instances an attacker
 * gets `maxAttempts` per instance, and a restart forgets everything. That is a
 * real limitation and it is deliberate: the alternative is a write to
 * OpenSearch on every failed sign-in, which hands an unauthenticated caller a
 * way to make the cluster do work. For a single-instance internal dashboard the
 * trade is right; in front of many instances, put a rate limit at the proxy and
 * treat this as the second line rather than the first.
 *
 * Counted **per account, not per IP.** An attacker rotating IPs against one
 * account is the case worth stopping; one IP trying many accounts is a
 * different attack and one a reverse proxy is better placed to see.
 */

type Attempt = { failures: number; firstAt: number; lockedUntil: number };

const attempts = new Map<string, Attempt>();

/**
 * The map is only ever written on a *failed* sign-in, so it cannot grow from
 * ordinary traffic — but it can grow from an attack, which is exactly when we
 * do not want an unbounded map. Old entries are swept whenever it gets large.
 */
const MAX_TRACKED = 10_000;

function sweep(now: number) {
  if (attempts.size < MAX_TRACKED) return;
  for (const [key, entry] of attempts) {
    const expired = now > entry.lockedUntil && now - entry.firstAt > LOGIN.windowSeconds * 1000;
    if (expired) attempts.delete(key);
  }
  // Still full of live entries — that is an attack in progress, not a leak.
  // Drop the oldest rather than growing without limit.
  if (attempts.size >= MAX_TRACKED) {
    const oldest = [...attempts.entries()].sort((a, b) => a[1].firstAt - b[1].firstAt);
    for (const [key] of oldest.slice(0, Math.floor(MAX_TRACKED / 4))) attempts.delete(key);
  }
}

const keyFor = (email: string) => String(email ?? "").trim().toLowerCase();

/** Seconds left on a lockout, or 0 when the account may try again. */
export function lockedFor(email: string, now = Date.now()): number {
  const entry = attempts.get(keyFor(email));
  if (!entry || now >= entry.lockedUntil) return 0;
  return Math.ceil((entry.lockedUntil - now) / 1000);
}

/** Record a wrong password. Returns the seconds locked out, or 0. */
export function recordFailure(email: string, now = Date.now()): number {
  const key = keyFor(email);
  if (!key) return 0;
  sweep(now);

  const entry = attempts.get(key);

  // A quiet spell clears the count, so a typo this morning does not combine
  // with a typo this afternoon into a lockout.
  if (!entry || now - entry.firstAt > LOGIN.windowSeconds * 1000) {
    attempts.set(key, { failures: 1, firstAt: now, lockedUntil: 0 });
    return 0;
  }

  entry.failures += 1;
  if (entry.failures >= LOGIN.maxAttempts) {
    entry.lockedUntil = now + LOGIN.lockoutSeconds * 1000;
    // The window restarts with the lockout, so the next failure after it
    // expires begins a fresh count rather than locking again immediately.
    entry.firstAt = now;
    entry.failures = 0;
    return LOGIN.lockoutSeconds;
  }
  return 0;
}

/** A correct password clears the slate. */
export function recordSuccess(email: string) {
  attempts.delete(keyFor(email));
}

/** Test seam — the map outlives a single check otherwise. */
export function resetThrottle() {
  attempts.clear();
}
