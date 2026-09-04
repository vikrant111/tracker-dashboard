import { AUTH_MODE, auth } from "@/auth";
import { HttpError } from "./http-error";

export { HttpError };

export type SessionUser = {
  email: string;
  name: string;
  role: "admin" | "member";
  teamIds: string[];
};

const OPEN_USER: SessionUser = {
  email: "local@localhost",
  name: "Local",
  role: "admin",
  teamIds: [],
};

/** Null when signed out. In AUTH_MODE=off everybody is a local admin. */
export async function currentUser(): Promise<SessionUser | null> {
  if (AUTH_MODE === "off") return OPEN_USER;
  const session = await auth();
  if (!session?.user?.email) return null;
  return {
    email: session.user.email,
    name: session.user.name || session.user.email,
    role: session.user.role === "admin" ? "admin" : "member",
    teamIds: Array.isArray(session.user.teamIds) ? session.user.teamIds : [],
  };
}

export async function requireUser(): Promise<SessionUser> {
  const user = await currentUser();
  if (!user) throw new HttpError(401, "Sign in to continue.");
  return user;
}

export async function requireAdmin(): Promise<SessionUser> {
  const user = await requireUser();
  if (user.role !== "admin") throw new HttpError(403, "Admins only.");
  return user;
}

/**
 * Admins see every POD; members see only the ones they are assigned to.
 * The Array check is deliberate: on a non-array `teamIds`, `.includes()` is a
 * substring test, which would hand out access that was never granted.
 */
/* Re-exported so every existing call site is unchanged; the rule lives in a
 * pure module the check suite can import without the auth stack. */
export { canSeeTeam } from "./team-access";

export function errorResponse(err: unknown) {
  const status = err instanceof HttpError ? err.status : 500;
  const message = err instanceof Error ? err.message : "Something went wrong.";
  if (status === 500) console.error(err);
  return Response.json({ error: message }, { status });
}
