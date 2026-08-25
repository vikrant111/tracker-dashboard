import { AUTH_MODE } from "@/auth";
import { errorResponse, requireUser } from "@/lib/session";
import { getUser, setPassword, verifyPassword } from "@/lib/users";
import { validatePasswordChange } from "@/lib/validation";

export const dynamic = "force-dynamic";

/**
 * Change your own password.
 *
 * Self-service, and the only route that will touch the signed-in reader's own
 * credentials. Three things make it safe, and none of them is optional:
 *
 * 1. **The current password is verified, not merely required.** A live session
 *    is not enough on its own — an unlocked laptop would otherwise be a
 *    complete account takeover, and the session cookie outlives the moment the
 *    reader walked away from the desk.
 * 2. **The account is read from the request's own identity**, never from the
 *    body. There is no `email` field here on purpose: if the caller could name
 *    the account, this would be an admin route with no admin check.
 * 3. **It writes the hash and nothing else** — `setPassword`, not `saveUser`,
 *    so a role or a POD list cannot ride along in the same request.
 */
export async function POST(req: Request) {
  try {
    const session = await requireUser();

    /*
     * With auth off there is no account to change — everybody is the same local
     * admin, and pretending otherwise would write a hash nothing ever reads.
     */
    if (AUTH_MODE === "off") {
      return Response.json(
        { error: "Passwords are not used while AUTH_MODE is off." },
        { status: 400 },
      );
    }

    const body = await req.json().catch(() => null);
    const current = String(body?.current ?? "");
    const next = String(body?.next ?? "");

    // The same rules the form ran, re-run where they cannot be skipped.
    const problem = validatePasswordChange({ current, next, confirm: next });
    if (problem) return Response.json({ error: problem }, { status: 400 });

    /*
     * An SSO account has no password of its own — the identity provider holds
     * it. Setting one here would create a second way in that nobody is
     * expecting, and it would not be the one Entra revokes when the person
     * leaves. Say so rather than silently doing something surprising.
     */
    const user = await getUser(session.email);
    if (!user) return Response.json({ error: "That account no longer exists." }, { status: 404 });
    if (!user.passwordHash) {
      return Response.json(
        { error: "This account signs in with single sign-on, so it has no password here. Change it with your identity provider." },
        { status: 400 },
      );
    }

    // The check that matters. bcrypt's compare is constant-time for a given
    // hash, so a wrong guess costs the same as a right one.
    const verified = await verifyPassword(session.email, current);
    if (!verified) {
      return Response.json({ error: "That is not your current password." }, { status: 403 });
    }

    const changed = await setPassword(session.email, next);
    if (!changed) return Response.json({ error: "That account no longer exists." }, { status: 404 });

    // Nothing about the account comes back. There is nothing the caller needs
    // that they did not already have, and a password route is the last place to
    // start returning user records.
    return Response.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
