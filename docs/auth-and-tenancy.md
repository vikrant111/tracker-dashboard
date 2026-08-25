# Auth and multi-POD tenancy

One instance serves many PODs. Admins see all of them; members see only the PODs
assigned to them. **The enforcement is server-side** — the POD picker in the UI
is convenience, not a boundary.

## Modes

`AUTH_MODE` in `.env.local`, read at module load in [`src/auth.ts`](../src/auth.ts):

| Mode | Behaviour |
|---|---|
| `off` | `currentUser()` returns a synthetic local admin. No session lookup, `/login` redirects home. **Local development only.** |
| `password` | Credentials provider, bcrypt (cost 10), users in OpenSearch. |
| `entra` | Microsoft Entra ID (Azure AD) SSO. |
| `both` | Both offered on `/login`. |

`entraEnabled` additionally requires `AUTH_MICROSOFT_ENTRA_ID_ID`, so switching
the mode on before the app registration exists degrades instead of crashing.

Providers are pushed into the array conditionally, so an unconfigured provider is
never constructed.

## Roles

- **admin** — onboards PODs, manages access, sees every POD and the cross-POD
  roll-up. Lands on the "All PODs" view.
- **member** — sees only assigned PODs. Lands on their first one. `/admin`
  redirects home.

Role and `teamIds` are re-read from OpenSearch on **every JWT refresh**:

```ts
async jwt({ token }) {
  const user = await getUser(token.email);
  token.role = user?.role ?? "member";
  token.teamIds = user?.teamIds ?? [];
  return token;
}
```

So an access change in Admin takes effect without the user signing out. Do not
"optimise" this into a write-once claim.

With SSO, `upsertSsoUser()` makes the **first** person to sign in an admin —
there is nobody to grant it otherwise. Everyone after joins as a member with no
PODs until an admin assigns them.

## The scoping boundary

`filtersFromRequest()` in [`src/lib/api.ts`](../src/lib/api.ts) is the single
place a request's team scope is decided:

1. An explicitly requested `teamId` the user cannot see → **403**.
2. A non-admin with no `teamId` → defaults to their **first** POD. Never an
   unscoped query — silently widening would leak other PODs.
3. A member assigned to no PODs → **403**, not an empty result.
4. Loads the team so `thresholdDays` is that POD's own setting.

Any endpoint that reads items or metrics must go through it. `canSeeTeam()`
covers handlers that take `teamId` in a JSON body (sync, upload) rather than the
query string.

### Verified behaviour

A member scoped to `amc-pod` gets:

| Request | Result |
|---|---|
| `/api/metrics` (no teamId) | 200, scoped to `amc-pod` only |
| `/api/metrics?teamId=payments-pod` | 403 |
| `/api/items?teamId=payments-pod` | 403 |
| `/api/users` | 403 |
| `POST /api/teams` | 403 |
| `POST /api/sync` (all PODs) | 403 |
| `/api/teams` | only their POD |
| `/admin` | 307 → `/` |

Re-run this after touching auth or `api.ts`; the commands are in
[operations.md](operations.md#verifying-scoping).

## Route guards

There is no `middleware.ts`. Guarding happens in two places:

- **Server components** — `currentUser()` then `redirect("/login")`, plus a role
  check for `/admin`.
- **Route handlers** — `requireUser()` / `requireAdmin()`, throwing `HttpError`
  that `errorResponse()` maps.

Middleware was skipped deliberately: NextAuth v5 on the Edge runtime would need
the config split into an Edge-safe half, because the credentials provider reads
OpenSearch. Two guard lines beat that split. See [decisions.md](decisions.md).

## Sessions

JWT strategy — the session lives in a signed cookie, not in a server-side store.
That is what makes a horizontally-scaled deploy simple, and it is also why the
rules below exist: a JWT cannot be deleted, so it has to be *refused*.

### Two clocks

| | Setting | Renewed by activity? |
|---|---|---|
| **Idle** | `SESSION.idleSeconds` — 12 hours | yes, on every refresh |
| **Absolute** | `SESSION.absoluteSeconds` — 7 days | **no** |

One is not enough. The idle clock protects the machine somebody walked away
from, but it is renewed by use — so a **stolen token that is being used steadily
never expires under it**, which is precisely the token you want gone. The
absolute clock is measured from `signedInAt`, stamped once at sign-in and never
renewed.

The token is re-read every `SESSION.refreshSeconds` (15 minutes), which is also
the worst-case delay between an admin revoking access and the session noticing.

### What ends a session early

`checkSession()` in [`lib/session-policy.ts`](../src/lib/session-policy.ts) runs
on every refresh. Returning `null` from the `jwt` callback ends the session.

| Reason | When |
|---|---|
| `expired-absolute` | past `absoluteSeconds` since sign-in |
| `password-changed` | the token predates the account's `passwordChangedAt` |
| `no-account` | the account was deleted |
| `malformed` | no sign-in stamp, or one in the future |

**A password change ends every session, including the one that made it.** That
is deliberate: somebody changing a password because it leaked wants the
intruder's session gone, and there is no way to end "all of them except mine"
without keeping a privileged exception alive. The dialog says so and sends you
back to sign in.

A **deleted account** ends its session rather than degrading to a member with no
PODs. The degraded state 403s on every request but still renders a signed-in
shell, which is a confusing way to learn your account is gone.

### The signing secret

`AUTH_SECRET` is **mandatory in production and the process refuses to start
without it.** It used to fall back to a hardcoded string, and that was the worst
bug this codebase has had — not because it was subtle, but because **nothing
looked broken**. Sign-in worked, sessions worked, every check passed, and a
deployment that forgot the variable was signing tokens with a key committed to
this repository. Anyone who could read the source could forge `role: "admin"`.

[`lib/auth-secret.ts`](../src/lib/auth-secret.ts) refuses, in production:

- an unset or empty value;
- the placeholder `.env.example` ships — copying that file and not editing it is
  the likeliest way to arrive with a "set" but public secret;
- anything under 32 characters.

In development a missing secret generates a **random** key per process. Sessions
do not survive a restart, which is mildly annoying and much better than a shared
constant that could follow the code into production.

### Cookies

Stated explicitly in [`lib/auth-cookies.ts`](../src/lib/auth-cookies.ts) rather
than inherited from NextAuth's defaults — they are the same values, but stated
they can be checked, and they are the difference between "an XSS bug is a bug"
and "an XSS bug is every account".

| Flag | Stops |
|---|---|
| `httpOnly` | JavaScript reading the token at all. `document.cookie` cannot see it, so an injected script cannot steal a session |
| `sameSite: "lax"` | the cookie riding along on a cross-site POST, which is what CSRF is |
| `secure` (production) | the cookie crossing plain HTTP, where anything on the path can read it |
| `__Secure-` prefix | a non-HTTPS origin overwriting it |
| `__Host-` on the CSRF cookie | any other origin or subdomain setting it |

`lax` rather than `strict` on purpose: `strict` withholds the cookie on the
redirect back from Entra, so SSO sign-in would loop back to the login page.
`lax` still refuses cross-site POSTs, which is the attack.

**The token is never handed to client JavaScript.** `/api/auth/session` returns
the session's *claims* — email, name, role, teamIds — never the signed token,
and nothing in `src/` reads `document.cookie` or stores a credential in
`localStorage`. A check asserts that.

### Password guessing

bcrypt at cost 10 is about 100ms a guess, which is a bad rate for an attacker —
but "bad rate" is not "no rate", and an unattended script has all night.
[`lib/login-throttle.ts`](../src/lib/login-throttle.ts) locks an account after
`LOGIN.maxAttempts` consecutive failures for `LOGIN.lockoutSeconds`.

The lock is checked **before** the hash is computed, so a locked account costs
the server nothing. A correct password clears the count; a quiet
`LOGIN.windowSeconds` also clears it, so this morning's typo does not combine
with this afternoon's.

Counted **per account, not per IP** — an attacker rotating IPs against one
account is the case worth stopping.

> ⚠️ **In-memory, so it is per-process.** Behind several instances an attacker
> gets `maxAttempts` per instance, and a restart forgets everything. The
> alternative — a write to OpenSearch on every failed sign-in — hands an
> unauthenticated caller a way to make the cluster do work. For a single
> instance the trade is right; behind a load balancer, rate-limit at the proxy
> and treat this as the second line.

## Changing a password

Two routes, and the difference between them is the whole design.

| | `POST /api/account/password` | `POST /api/users/password` |
|---|---|---|
| Who | anyone signed in | admins only |
| Whose password | **their own, always** | anybody's |
| Current password | **required and verified** | not asked for |
| Names the account | never — read from the session | `email` in the body |

### Self-service verifies, it does not merely ask

The current password is checked with `verifyPassword` before anything is
written. **A live session is not proof of who is at the keyboard** — the cookie
outlives the moment somebody walks away from an unlocked laptop, so a route that
trusted the session alone would be a complete account takeover.

There is deliberately **no `email` field**. The account is read from the
request's own identity, so there is nothing for a caller to point somewhere
else. If the body could name the account, this would be the admin route without
the admin check.

### Both write the hash and nothing else

Neither route goes through `saveUser`, which rewrites the role and the POD list
from whatever the caller sent. They call `setPassword`, which spreads the
**stored** user and replaces one field:

```ts
await putDoc(IDX.users, id, { ...user, passwordHash: await bcrypt.hash(password, 10) });
```

Without that, a member changing their own password could smuggle
`role: "admin"` through the same request. A check asserts neither route
mentions `saveUser`, and the e2e suite actually attempts the escalation.

### The admin reset exists because there is no email reset

Nothing in this product sends mail, so a forgotten password would otherwise be
**unrecoverable** — the only remaining move being to delete the account and
recreate it, which silently drops that person's role and every POD they could
see. The reset keeps all of it and changes one field.

It asks for no current password, because the premise is that the account holder
cannot supply one. The entire control is on the caller: `requireAdmin()` throws
before the body is read. It also reports whether the admin just changed *their
own* password, which the UI says out loud.

### SSO accounts are refused, on both routes

An account with no `passwordHash` signs in through the identity provider.
Setting a local password would create a **second way in — one that survives the
person being disabled in Entra**, which is the opposite of what anybody doing it
expects. Both routes refuse with a message naming the reason.

With `AUTH_MODE=off` there are no accounts at all, and both routes say so rather
than writing a hash nothing will ever read.

## Secrets

- `AUTH_SECRET` signs the JWT. Generate with `openssl rand -base64 32`.
- PATs are redacted by `/api/teams` before serialising; a value starting `••`
  coming back means "keep the stored one" and is stripped on save.
- Passwords are never returned. `/api/users` sends `hasPassword: boolean`, which
  is also what decides whether a reset control is offered for that row.
- The webhook token is compared with `timingSafeEqual`, and an unset token
  rejects all requests.
- An admin cannot delete their own account.
