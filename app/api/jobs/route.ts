import { NextRequest, NextResponse } from "next/server";
import { isApiAuthorized, isReadAuthorized } from "@/lib/auth";
import { validateUnlockToken } from "@/lib/unlock-auth";
import { readJobs, addJob } from "@/lib/storage";
import { v4 as uuidv4 } from "uuid";
import {
  trimCap,
  trimCapArray,
  MAX_STRING_LENGTH,
  MAX_LONG_TEXT_LENGTH,
  MAX_ARRAY_ITEMS,
} from "@/lib/validation";
import type { JobRecord, TechStackNormalized, JobStatus } from "@/lib/types";

const VALID_STATUSES: JobStatus[] = [
  "applied",
  "screening",
  "interview",
  "offer",
  "rejected",
  "withdrawn",
];

function normalizeTechStackFromBody(raw: unknown): TechStackNormalized | undefined {
  if (raw == null || typeof raw !== "object") return undefined;
  const o = raw as Record<string, unknown>;
  const keys: (keyof TechStackNormalized)[] = [
    "languages",
    "frameworks",
    "stateManagement",
    "data",
    "apis",
    "buildTools",
    "packageManagers",
    "styling",
    "testing",
    "concepts",
    "versionControl",
    "databases",
    "architecture",
    "devOps",
    "methodologies",
    "designPrinciples",
    "operatingSystems",
    "collaborationTools",
  ];
  const result: TechStackNormalized = {};
  let hasAny = false;
  for (const key of keys) {
    const val = o[key];
    if (Array.isArray(val)) {
      const arr = val.map((t) => String(t).trim()).filter(Boolean);
      if (arr.length) {
        result[key] = arr;
        hasAny = true;
      }
    }
  }
  return hasAny ? result : undefined;
}

export async function GET(request: NextRequest) {
  if (!isReadAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!validateUnlockToken(request)) {
    return NextResponse.json({ error: "Unlock required" }, { status: 401 });
  }
  const data = await readJobs();
  return NextResponse.json(data);
}

export async function POST(request: NextRequest) {
  if (!isApiAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!validateUnlockToken(request)) {
    return NextResponse.json({ error: "Unlock required" }, { status: 401 });
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Invalid JSON";
    return NextResponse.json({ error: "Invalid payload", detail: msg }, { status: 400 });
  }
  if (body == null || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json(
      { error: "Invalid payload", detail: "Body must be a JSON object" },
      { status: 400 }
    );
  }
  const b = body as Record<string, unknown>;
  try {
    const now = new Date().toISOString();
    const trim = (v: unknown) => (v != null ? String(v).trim() : "");
    const trimOpt = (v: unknown, maxLen = MAX_STRING_LENGTH) => trimCap(v, maxLen);
    const job: JobRecord = {
      id: uuidv4(),
      title: trimCap(b.title, MAX_STRING_LENGTH) ?? "",
      company: trimCap(b.company, MAX_STRING_LENGTH) ?? "",
      companyPublisher: trimOpt(b.companyPublisher) ?? null,
      location: trimCap(b.location, MAX_STRING_LENGTH) ?? "",
      salaryMin:
        typeof b.salaryMin === "number" && Number.isFinite(b.salaryMin) && b.salaryMin >= 0
          ? b.salaryMin
          : undefined,
      salaryMax:
        typeof b.salaryMax === "number" && Number.isFinite(b.salaryMax) && b.salaryMax >= 0
          ? b.salaryMax
          : undefined,
      salaryCurrency: b.salaryCurrency === null ? null : trim(b.salaryCurrency) || undefined,
      salaryPeriod:
        b.salaryPeriod === "hourly" || b.salaryPeriod === "monthly" || b.salaryPeriod === "yearly"
          ? b.salaryPeriod
          : "yearly",
      techStack: trimCapArray(b.techStack, MAX_ARRAY_ITEMS),
      techStackNormalized: normalizeTechStackFromBody(b.techStackNormalized),
      role: trimCap(b.role) || trimCap(b.title) || "",
      experience: trimCap(b.experience) ?? "Not specified",
      jobType: trimOpt(b.jobType) ?? null,
      availability: trimOpt(b.availability) ?? null,
      product: trimOpt(b.product) ?? null,
      seniority: trimOpt(b.seniority) ?? null,
      collaborationTools: trimCapArray(b.collaborationTools, MAX_ARRAY_ITEMS) || undefined,
      status: VALID_STATUSES.includes(b.status as JobStatus) ? (b.status as JobStatus) : "applied",
      appliedAt: typeof b.appliedAt === "string" && b.appliedAt.trim() ? b.appliedAt.trim() : now,
      postedAt: trimOpt(b.postedAt) ?? null,
      applicantsCount:
        typeof b.applicantsCount === "number" &&
        Number.isInteger(b.applicantsCount) &&
        b.applicantsCount >= 0
          ? b.applicantsCount
          : undefined,
      education: trimOpt(b.education) ?? null,
      source: trimOpt(b.source) ?? undefined,
      jdRaw: trimCap(b.jdRaw, MAX_LONG_TEXT_LENGTH) ?? undefined,
      notes: trimCap(b.notes, MAX_LONG_TEXT_LENGTH) ?? undefined,
      createdAt: now,
      updatedAt: now,
    };
    await addJob(job);
    return NextResponse.json(job);
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: "Invalid payload", detail }, { status: 400 });
  }
}
