import { NextRequest, NextResponse } from "next/server";
import { isApiAuthorized, isReadAuthorized } from "@/lib/auth";
import { validateUnlockToken } from "@/lib/unlock-auth";
import { readJobs, updateJob, deleteJob } from "@/lib/storage";
import { validateUUID, sanitizePatchBody, sanitizePatchValues } from "@/lib/validation";
import type { JobStatus } from "@/lib/types";

const VALID_STATUSES: JobStatus[] = [
  "applied",
  "screening",
  "interview",
  "offer",
  "rejected",
  "withdrawn",
];

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isReadAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!validateUnlockToken(request)) {
    return NextResponse.json({ error: "Unlock required" }, { status: 401 });
  }
  const { id } = await params;
  const safeId = validateUUID(id);
  if (!safeId) return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  const data = await readJobs();
  const job = data.jobs.find((j) => j.id === safeId);
  if (!job) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(job);
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isApiAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!validateUnlockToken(request)) {
    return NextResponse.json({ error: "Unlock required" }, { status: 401 });
  }
  const { id } = await params;
  const safeId = validateUUID(id);
  if (!safeId) return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  const body = await request.json();
  if (body == null || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }
  let sanitized = sanitizePatchValues(sanitizePatchBody(body as Record<string, unknown>));
  if (sanitized.status !== undefined && !VALID_STATUSES.includes(sanitized.status as JobStatus)) {
    const { status: _s, ...rest } = sanitized;
    sanitized = rest;
  }
  const updated = await updateJob(safeId, sanitized as Partial<import("@/lib/types").JobRecord>);
  if (!updated) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(updated);
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!isApiAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!validateUnlockToken(request)) {
    return NextResponse.json({ error: "Unlock required" }, { status: 401 });
  }
  const { id } = await params;
  const safeId = validateUUID(id);
  if (!safeId) return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  const ok = await deleteJob(safeId);
  if (!ok) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ deleted: true });
}
