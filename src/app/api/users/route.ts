import { refuseIfLastAdmin } from "@/lib/admin-guard";
import { errorResponse, requireAdmin } from "@/lib/session";
import { deleteUser, listUsers, saveUser } from "@/lib/users";
import type { User } from "@/lib/types";

export const dynamic = "force-dynamic";

const redact = ({ passwordHash, ...rest }: User) => ({ ...rest, hasPassword: !!passwordHash });

export async function GET() {
  try {
    await requireAdmin();
    return Response.json({ users: (await listUsers()).map(redact) });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function POST(req: Request) {
  try {
    await requireAdmin();
    const body = await req.json();
    /*
     * The type first, then the shape.
     *
     * `body.email?.includes("@")` assumed a string, so an email of
     * `{"$ne": null}` — which JSON can carry and a query string cannot — threw
     * a TypeError and came back as a 500 quoting our own internals. A hostile
     * value must be refused in prose, never crash the handler.
     */
    if (typeof body?.email !== "string" || !body.email.includes("@")) {
      return Response.json({ error: "A valid email is required." }, { status: 400 });
    }
    /*
     * The instance must keep an admin. Demoting the last one locks everybody
     * out of every admin route — including this one, which is the only way to
     * put the role back.
     */
    if (body.role === "member") {
      const refusal = refuseIfLastAdmin(await listUsers(), body.email, "demote");
      if (refusal) return Response.json({ error: refusal }, { status: 409 });
    }

    return Response.json({ user: redact(await saveUser(body)) });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function DELETE(req: Request) {
  try {
    const admin = await requireAdmin();
    const email = new URL(req.url).searchParams.get("email") || "";
    if (email.toLowerCase() === admin.email.toLowerCase()) {
      return Response.json({ error: "You cannot delete your own account." }, { status: 400 });
    }
    /* And not the last admin either, whoever is asking. */
    const refusal = refuseIfLastAdmin(await listUsers(), email, "delete");
    if (refusal) return Response.json({ error: refusal }, { status: 409 });
    await deleteUser(email);
    return Response.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
