import NextAuth, { type NextAuthConfig } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import MicrosoftEntraID from "next-auth/providers/microsoft-entra-id";
import { upsertSsoUser, verifyPassword, getUser } from "./lib/users";

export type AuthMode = "off" | "password" | "entra" | "both";

export const AUTH_MODE = (process.env.AUTH_MODE || "password") as AuthMode;
export const passwordEnabled = AUTH_MODE === "password" || AUTH_MODE === "both";
export const entraEnabled =
  (AUTH_MODE === "entra" || AUTH_MODE === "both") && !!process.env.AUTH_MICROSOFT_ENTRA_ID_ID;

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
        const user = await verifyPassword(email, password);
        return user ? { id: user.id, email: user.email, name: user.name } : null;
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
  secret: process.env.AUTH_SECRET || "dev-only-insecure-secret",
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  callbacks: {
    async signIn({ user, account }) {
      if (account?.provider === "microsoft-entra-id" && user.email) {
        await upsertSsoUser(user.email, user.name || user.email);
      }
      return true;
    },
    // Role and team scoping live in OpenSearch, so re-read them on every token
    // refresh — an admin change takes effect without the user signing out.
    async jwt({ token }) {
      if (token.email) {
        const user = await getUser(token.email);
        token.role = user?.role ?? "member";
        token.teamIds = user?.teamIds ?? [];
      }
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
