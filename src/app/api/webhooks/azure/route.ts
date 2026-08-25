import { timingSafeEqual } from "node:crypto";
import { deleteItem } from "@/controllers/items.controller";
import { syncSingleWorkItem, teamForAreaPath } from "@/lib/sync";

export const dynamic = "force-dynamic";

function tokenOk(req: Request): boolean {
  const expected = process.env.AZDO_WEBHOOK_TOKEN || "";
  if (!expected) return false; // no secret configured means the hook stays shut
  const got = new URL(req.url).searchParams.get("token") || "";
  const a = Buffer.from(got);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

type Payload = {
  eventType?: string;
  resource?: {
    id?: number;
    workItemId?: number;
    fields?: Record<string, unknown>;
    revision?: { fields?: Record<string, unknown> };
  };
};

/**
 * Azure DevOps Service Hook receiver: work item created / updated / deleted.
 * The payload shape varies by event, so we only read the id and area path from
 * it and re-fetch the canonical item through the REST API.
 */
export async function POST(req: Request) {
  if (!tokenOk(req)) return Response.json({ error: "Invalid webhook token." }, { status: 401 });

  // `req.json()` on a literal `null` body succeeds and returns null, so the
  // coalesce matters as much as the catch.
  const raw = await req.json().catch(() => null);
  const payload: Payload = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Payload) : {};

  const eventType = payload.eventType ?? "";
  if (eventType && !eventType.startsWith("workitem.")) {
    return Response.json({ ok: true, skipped: `ignored event ${eventType}` });
  }

  const r = payload.resource || {};
  const workItemId = Number(r.workItemId ?? r.id);
  if (!Number.isSafeInteger(workItemId) || workItemId <= 0) {
    return Response.json({ ok: true, skipped: "no usable work item id" });
  }

  const fields = { ...r.fields, ...r.revision?.fields } as Record<string, unknown>;
  const areaPath = String(fields["System.AreaPath"] ?? "");
  const project = String(fields["System.TeamProject"] ?? "");

  const team = await teamForAreaPath(areaPath, project);
  if (!team) return Response.json({ ok: true, skipped: "no matching POD" });

  if (payload.eventType === "workitem.deleted") {
    await deleteItem(`${team.id}:${workItemId}`).catch(() => {});
    return Response.json({ ok: true, deleted: workItemId });
  }

  try {
    const synced = await syncSingleWorkItem(team.id, workItemId);
    return Response.json({ ok: true, synced, teamId: team.id, workItemId });
  } catch (err) {
    // Never 500 back at Azure — it disables the subscription after repeated failures.
    console.error("webhook sync failed", err);
    return Response.json({ ok: false, error: err instanceof Error ? err.message : "sync failed" });
  }
}
