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
    if (!body.email?.includes("@")) return Response.json({ error: "A valid email is required." }, { status: 400 });
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
    await deleteUser(email);
    return Response.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
