import { AUTH_MODE, entraEnabled } from "@/auth";
import { refuseLocalPassword } from "@/lib/password-policy";
import { errorResponse, requireAdmin } from "@/lib/session";
import { getUser, setPassword } from "@/lib/users";
import { validatePasswordReset } from "@/lib/validation";

export const dynamic = "force-dynamic";

/**
 * An admin setting somebody else's password.
 *
 * There is no email-based reset in this product, so without this route a
 * forgotten password is **unrecoverable**: the only remaining move is deleting
 * the account and recreating it, which silently drops that person's role and
 * every POD they could see. That is a worse outcome than the one this route
 * carries, which is why it exists.
 *
 * No current password is asked for — the whole premise is that the account
 * holder cannot supply it. The control is therefore entirely on the *caller*:
 * `requireAdmin` throws for anybody else, before the body is even read.
 */
export async function POST(req: Request) {
  try {
    const admin = await requireAdmin();

    if (AUTH_MODE === "off") {
      return Response.json({ error: "Passwords are not used while AUTH_MODE is off." }, { status: 400 });
    }

    const body = await req.json().catch(() => null);
    const email = String(body?.email ?? "").trim();
    const next = String(body?.next ?? "");

    const problem = validatePasswordReset({ email, next });
    if (problem) return Response.json({ error: problem }, { status: 400 });

    const user = await getUser(email);
    if (!user) return Response.json({ error: `No account for ${email}.` }, { status: 404 });

    /*
     * An account with no hash is either an SSO account or one somebody created
     * with the password field left blank. They look identical here, so the rule
     * turns on whether SSO is configured at all — see `password-policy.ts`.
     *
     * This used to refuse both, which made a mistyped account unrecoverable:
     * the only way back was deleting the person and recreating them, losing
     * their role and every POD they could see.
     */
    const refusal = refuseLocalPassword(
      { hasPassword: Boolean(user.passwordHash), ssoEnabled: entraEnabled },
      email,
    );
    if (refusal) return Response.json({ error: refusal }, { status: 400 });

    const changed = await setPassword(email, next);
    if (!changed) return Response.json({ error: `No account for ${email}.` }, { status: 404 });

    /*
     * Say plainly whose password moved, including when an admin resets their
     * own — that is allowed, but it should never be something that happened
     * without a visible acknowledgement.
     */
    return Response.json({
      ok: true,
      email: user.email,
      self: user.email.toLowerCase() === admin.email.toLowerCase(),
    });
  } catch (err) {
    return errorResponse(err);
  }
}
