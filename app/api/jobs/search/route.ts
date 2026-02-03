import { NextRequest, NextResponse } from "next/server";
import { isReadAuthorized } from "@/lib/auth";
import { validateUnlockToken } from "@/lib/unlock-auth";
import { readJobs } from "@/lib/storage";
import { fuzzySearchJobs } from "@/lib/search";
import { trimCap, MAX_STRING_LENGTH } from "@/lib/validation";
import type { JobStatus } from "@/lib/types";

const VALID_STATUSES: JobStatus[] = [
  "applied",
  "screening",
  "interview",
  "offer",
  "rejected",
  "withdrawn",
];

export async function GET(request: NextRequest) {
  if (!isReadAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!(await validateUnlockToken(request))) {
    return NextResponse.json({ error: "Unlock required" }, { status: 401 });
  }
  const { searchParams } = new URL(request.url);
  const q = trimCap(searchParams.get("q") ?? "", MAX_STRING_LENGTH) ?? "";
  const statusParam = searchParams.get("status") ?? "";
  const limitParam = searchParams.get("limit");
  const offsetParam = searchParams.get("offset");

  const status: JobStatus | undefined =
    statusParam && VALID_STATUSES.includes(statusParam as JobStatus)
      ? (statusParam as JobStatus)
      : undefined;

  let limit = 20;
  if (limitParam != null) {
    const n = Number(limitParam);
    if (Number.isFinite(n) && n >= 1) limit = Math.min(Math.floor(n), 50);
  }

  let offset = 0;
  if (offsetParam != null) {
    const n = Number(offsetParam);
    if (Number.isFinite(n) && n >= 0) offset = Math.floor(n);
  }

  const data = await readJobs();
  const jobs = Array.isArray(data.jobs) ? data.jobs : [];
  const { jobs: results, total } = fuzzySearchJobs(jobs, q, {
    limit,
    offset,
    status,
    threshold: 0.4,
  });

  return NextResponse.json({ jobs: results, total });
}
