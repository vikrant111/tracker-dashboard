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

## Secrets

- `AUTH_SECRET` signs the JWT. Generate with `openssl rand -base64 32`.
- PATs are redacted by `/api/teams` before serialising; a value starting `••`
  coming back means "keep the stored one" and is stripped on save.
- Passwords are never returned. `/api/users` sends `hasPassword: boolean`.
- The webhook token is compared with `timingSafeEqual`, and an unset token
  rejects all requests.
- An admin cannot delete their own account.
