/**
 * Release-branch announcements.
 *
 * Anyone signed in reads them — being told a release is cut is the point.
 * Posting, editing and deleting are admin-only.
 */
import { deleteAnnouncementDoc } from "@/controllers/announcements.controller";
import { listAnnouncements, saveAnnouncement } from "@/lib/devops/announcements";
import type { Announcement } from "@/lib/devops/types";
import { errorResponse, requireAdmin, requireUser } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    await requireUser();
    const repoId = new URL(req.url).searchParams.get("repoId") ?? "";
    return Response.json({ announcements: await listAnnouncements(repoId || undefined) });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireAdmin();

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return Response.json({ error: "Send the announcement as a JSON object." }, { status: 400 });
    }

    const saved = await saveAnnouncement(body as Partial<Announcement>, user.email);
    return Response.json({ announcement: saved });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function DELETE(req: Request) {
  try {
    await requireAdmin();

    const id = new URL(req.url).searchParams.get("id") ?? "";
    if (!id) return Response.json({ error: "Which announcement?" }, { status: 400 });

    await deleteAnnouncementDoc(id);
    return Response.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
