---
applyTo: "src/app/api/**,src/lib/{session,api,users,auth-secret,auth-cookies,session-policy,login-throttle,validation,roster,http-error}.ts,src/auth.ts,src/app/login/**,src/app/admin/**"
description: Route handler shape, authentication modes and POD scoping
---

# Route handlers, auth and scoping

## Handler shape

Every handler follows the same skeleton. Deviating means an unhandled throw
leaks a stack trace to the client.

```ts
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const user = await requireUser();          // or requireAdmin()
    const filters = await filtersFromRequest(req, user);
    return Response.json(await something(filters));
  } catch (err) {
    return errorResponse(err);
  }
}
```

- `requireUser()` → 401 when signed out. `requireAdmin()` → 403 for members.
- Throw `new HttpError(status, "User-facing sentence.")` for expected failures.
- `errorResponse()` maps `HttpError` to its status and logs only genuine 500s.
- Validation failures may also return `Response.json({ error }, { status: 400 })`
  directly — both styles are fine, the message must still be prose.

Handlers are **always the Node runtime**. Never add `export const runtime = "edge"`:
the OpenSearch client needs `node:https`.

## Scoping — the security boundary

`filtersFromRequest()` in `src/lib/api.ts` is the single place a request's team
scope is decided. It:

1. rejects an explicitly requested `teamId` the user cannot see (403),
2. defaults a non-admin with no `teamId` to their **first** POD — never to an
   unscoped query,
3. 403s a member who is assigned to no PODs,
4. loads the team so `thresholdDays` comes from that POD's own setting.

Any new endpoint reading items or metrics must route through it. Do not
reimplement the check, and do not rely on the UI to scope — the POD picker is
convenience, not enforcement.

`canSeeTeam(user, teamId)` is for handlers that take a `teamId` in a JSON body
(sync, upload) rather than the query string.

## Auth modes

`AUTH_MODE` in `.env.local` selects providers at module load in `src/auth.ts`:

| Mode | Behaviour |
|---|---|
| `off` | `currentUser()` returns a synthetic local admin, no session lookup. Local dev only. |
| `password` | Credentials provider, bcrypt hash in OpenSearch. |
| `entra` | Microsoft Entra ID SSO. |
| `both` | Both offered on `/login`. |

`entraEnabled` also requires `AUTH_MICROSOFT_ENTRA_ID_ID` to be set, so turning
the mode on without credentials degrades rather than crashes.

Role and `teamIds` are re-read from OpenSearch on every JWT refresh, so an
access change in Admin takes effect without the user signing out. Do not move
them into the token as write-once values.

With SSO the first user to sign in becomes admin (`upsertSsoUser`); everyone
after joins as a member with no PODs.

## The signing secret

`src/lib/auth-secret.ts` resolves `AUTH_SECRET` and is the reason the app can be
handed over safely. It **throws in production** when the secret is missing,
under 32 characters, or one of the known placeholders; in development it
generates a random per-process key instead, so nobody has a reason to commit
one.

This replaced `AUTH_SECRET || "dev-only-insecure-secret"`. That fallback meant
anybody who read the repo could forge an admin session in any deployment where
the variable had not been set — and nothing would have looked wrong.

Never add a fallback here, and never make the throw conditional. `/api/health`
returns **503** when this resolver fails, so a container with a bad secret is
never marked healthy.

## Sessions — two clocks

`src/lib/session-policy.ts` holds `checkSession()`, pure and testable. Both
timeouts come from `SESSION` in `src/lib/constants/auth.ts`:

| Clock | Value | Why |
|---|---|---|
| **Idle**, rolling | 12h | renewed by activity; a laptop left on a train is signed out by morning |
| **Absolute**, hard ceiling | 7d | the idle clock alone is renewed by use, so a *stolen token that is being used* would never expire |

`checkSession()` returns a `reason` — `expired-absolute`, `password-changed`,
`no-account`, `malformed` — and every one of them is asserted separately.
Returning a bare `false` lets a guard be deleted while a different branch keeps
the test green.

Three things end a session before its time: the account is gone, the password
changed since the token was issued (`passwordChangedAt`), or the claims are
unreadable. **A missing or future `signedInAt` is `malformed`, not trusted** —
absent evidence of when a session started is not evidence that it is fresh.

## Cookies

`src/lib/auth-cookies.ts` states every flag explicitly rather than relying on
defaults, so they can be checked: `httpOnly`, `sameSite: "lax"`, `secure` and a
`__Secure-` prefix in production; `__Host-` for the CSRF token, which is scoped
to the origin with no domain.

**The token never reaches JavaScript.** No token in `localStorage`, no token in
a response body, no token in a URL. If a component appears to need one, it does
not — it needs a route handler.

## Login throttle

`src/lib/login-throttle.ts` — 8 failures locks an account for 15 minutes, and a
15-minute quiet spell clears the count. The lockout is checked **before** the
bcrypt compare: checking after it means an attacker still gets the ~100ms of
work done on every attempt, and the throttle only shapes the response.

Tracking is capped at 10,000 accounts and evicts oldest-first, so the map cannot
be grown without bound by an attacker inventing addresses.

The failure message is identical for a wrong password, an unknown account and a
locked one. Distinguishing them enumerates valid addresses.

## Changing a password

`/api/account/password` — a signed-in user changing their own, requiring the
current one. `/api/users/password` — an admin setting someone else's, which does
not. Both stamp `passwordChangedAt`, which is what invalidates every existing
session for that account through `checkSession()`.

## Secrets

- PATs are redacted by `/api/teams` before serialising. A value starting `••`
  coming back from the UI means "keep the stored one" and is stripped on save.
- The Azure webhook compares its token with `timingSafeEqual`, and refuses all
  requests when `AZDO_WEBHOOK_TOKEN` is unset — an unset secret must never mean
  "allow".
- The webhook returns `200 { ok: false }` on internal failure. Azure disables a
  subscription that keeps receiving 5xx.

## Uploads

`/api/upload` caps files at 20 MB, requires a `teamId` the caller can see, and
returns `{ imported, skipped, failed, columns, ignoredHeaders }`. Report
`ignoredHeaders` back to the user — a silently dropped column reads as data loss.
