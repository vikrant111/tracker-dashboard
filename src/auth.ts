import NextAuth, { type NextAuthConfig } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import MicrosoftEntraID from "next-auth/providers/microsoft-entra-id";
import { ensureFirstAdmin, upsertSsoUser, verifyPassword, getUser } from "./lib/users";
import { resolveAuthSecret } from "./lib/auth-secret";
import { lockedFor, recordFailure, recordSuccess } from "./lib/login-throttle";
import { checkSession, type TokenClaims } from "./lib/session-policy";
import { SESSION } from "./lib/constants";
import { authCookies } from "./lib/auth-cookies";

export type AuthMode = "off" | "password" | "entra" | "both";

export const AUTH_MODE = (process.env.AUTH_MODE || "password") as AuthMode;
export const passwordEnabled = AUTH_MODE === "password" || AUTH_MODE === "both";
export const entraEnabled =
  (AUTH_MODE === "entra" || AUTH_MODE === "both") && !!process.env.AUTH_MICROSOFT_ENTRA_ID_ID;

const isProduction = process.env.NODE_ENV === "production";

/*
 * Resolved at module load, so a deployment without a real secret fails on the
 * first import rather than serving forgeable sessions. See `auth-secret.ts` for
 * why this is worth crashing over.
 */
const verdict = resolveAuthSecret(process.env.AUTH_SECRET, isProduction);
if (!verdict.ok) throw new Error(`Refusing to start: ${verdict.reason}`);
if (verdict.generated) {
  console.warn(
    "[auth] AUTH_SECRET is not set. Using a random key for this process — sessions will not survive a restart. " +
      "Set AUTH_SECRET (`openssl rand -base64 32`) before deploying.",
  );
}

const providers: NextAuthConfig["providers"] = [];

if (passwordEnabled) {
  providers.push(
    Credentials({
      name: "Email and password",
      credentials: { email: { label: "Email" }, password: { label: "Password", type: "password" } },
      async authorize(creds) {
        const email = String(creds?.email ?? "");
        const password = String(creds?.password ?? "");
        if (!email || !password) return null;

        /*
         * A fresh deployment has no users at all, so without this nobody could
         * ever sign in — the seeder is a local convenience, not something run
         * against production. Only ever fires when the store is empty.
         */
        await ensureFirstAdmin();

        /*
         * Refused before the hash is even computed. Checking the lock first is
         * what makes the lockout worth having — otherwise every attempt still
         * costs a bcrypt, and the throttle protects the account without
         * protecting the server.
         */
        if (lockedFor(email) > 0) return null;

        const user = await verifyPassword(email, password);
        if (!user) {
          recordFailure(email);
          return null;
        }

        recordSuccess(email);
        return { id: user.id, email: user.email, name: user.name };
      },
    }),
  );
}

if (entraEnabled) {
  providers.push(
    MicrosoftEntraID({
      clientId: process.env.AUTH_MICROSOFT_ENTRA_ID_ID,
      clientSecret: process.env.AUTH_MICROSOFT_ENTRA_ID_SECRET,
      issuer: process.env.AUTH_MICROSOFT_ENTRA_ID_ISSUER,
    }),
  );
}

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers,
  secret: verdict.secret,
  session: {
    strategy: "jwt",
    // The idle clock. Every refresh re-issues the cookie, so activity renews
    // it; `session-policy.ts` holds the absolute ceiling that activity cannot.
    maxAge: SESSION.idleSeconds,
    updateAge: SESSION.refreshSeconds,
  },
  // Explicit rather than inherited, so the flags that keep the token out of
  // JavaScript's reach are visible and checkable. See `auth-cookies.ts`.
  cookies: authCookies(isProduction),
  pages: { signIn: "/login" },
  callbacks: {
    async signIn({ user, account }) {
      if (account?.provider === "microsoft-entra-id" && user.email) {
        await upsertSsoUser(user.email, user.name || user.email);
      }
      return true;
    },

    /**
     * Runs on every refresh, which makes it the place session policy is
     * enforced. Returning `null` ends the session.
     *
     * Role and team scoping are re-read from OpenSearch here rather than being
     * written once at sign-in, so revoking access takes effect within
     * `SESSION.refreshSeconds` instead of whenever the person next signs in.
     */
    async jwt({ token, trigger }) {
      if (!token.email) return token;

      const account = await getUser(String(token.email));

      // Stamped once, at sign-in, and never renewed — this is what the absolute
      // timeout measures from.
      if (trigger === "signIn") {
        token.signedInAt = Date.now();
        token.passwordAt = account?.passwordChangedAt ? Date.parse(account.passwordChangedAt) : 0;
      }

      const verdict = checkSession(token as TokenClaims, !!account, account?.passwordChangedAt);
      if (!verdict.valid) return null;

      token.role = account?.role ?? "member";
      token.teamIds = account?.teamIds ?? [];
      return token;
    },

    async session({ session, token }) {
      if (session.user) {
        session.user.role = (token.role as "admin" | "member") ?? "member";
        session.user.teamIds = (token.teamIds as string[]) ?? [];
      }
      return session;
    },
  },
});

declare module "next-auth" {
  interface Session {
    user: {
      email: string;
      name?: string | null;
      image?: string | null;
      role: "admin" | "member";
      teamIds: string[];
    };
  }
}
