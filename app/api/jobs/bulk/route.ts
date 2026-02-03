import { NextRequest, NextResponse } from "next/server";
import { isApiAuthorized } from "@/lib/auth";
import { validateUnlockToken } from "@/lib/unlock-auth";
import { deleteJobs } from "@/lib/storage";
import { validateUUID, MAX_BULK_IDS } from "@/lib/validation";

export async function DELETE(request: NextRequest) {
  if (!isApiAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!validateUnlockToken(request)) {
    return NextResponse.json({ error: "Unlock required" }, { status: 401 });
  }
  const body = await request.json();
  const raw = Array.isArray(body?.ids) ? body.ids : [];
  if (raw.length === 0) {
    return NextResponse.json({ error: "ids array required" }, { status: 400 });
  }
  const ids = raw
    .slice(0, MAX_BULK_IDS)
    .map((id: unknown) => validateUUID(id))
    .filter((id: string | null): id is string => id !== null);
  const removed = await deleteJobs(ids);
  return NextResponse.json({ deleted: removed });
}
