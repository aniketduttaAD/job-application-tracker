import { NextRequest, NextResponse } from "next/server";
import { isApiAuthorized, isReadAuthorized } from "@/lib/auth";
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
  const data = await readJobs();
  return NextResponse.json(data);
}

export async function POST(request: NextRequest) {
  if (!isApiAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const body = await request.json();
    const now = new Date().toISOString();
    const trim = (v: unknown) => (v != null ? String(v).trim() : "");
    const trimOpt = (v: unknown, maxLen = MAX_STRING_LENGTH) => trimCap(v, maxLen);
    const job: JobRecord = {
      id: uuidv4(),
      title: trimCap(body.title, MAX_STRING_LENGTH) ?? "",
      company: trimCap(body.company, MAX_STRING_LENGTH) ?? "",
      companyPublisher: trimOpt(body.companyPublisher) ?? null,
      location: trimCap(body.location, MAX_STRING_LENGTH) ?? "",
      salaryMin:
        typeof body.salaryMin === "number" && Number.isFinite(body.salaryMin) && body.salaryMin >= 0
          ? body.salaryMin
          : undefined,
      salaryMax:
        typeof body.salaryMax === "number" && Number.isFinite(body.salaryMax) && body.salaryMax >= 0
          ? body.salaryMax
          : undefined,
      salaryCurrency: body.salaryCurrency === null ? null : trim(body.salaryCurrency) || undefined,
      salaryPeriod:
        body.salaryPeriod === "hourly" ||
        body.salaryPeriod === "monthly" ||
        body.salaryPeriod === "yearly"
          ? body.salaryPeriod
          : "yearly",
      techStack: trimCapArray(body.techStack, MAX_ARRAY_ITEMS),
      techStackNormalized: normalizeTechStackFromBody(body.techStackNormalized),
      role: trimCap(body.role) || trimCap(body.title) || "",
      experience: trimCap(body.experience) ?? "Not specified",
      jobType: trimOpt(body.jobType) ?? null,
      availability: trimOpt(body.availability) ?? null,
      product: trimOpt(body.product) ?? null,
      seniority: trimOpt(body.seniority) ?? null,
      collaborationTools: trimCapArray(body.collaborationTools, MAX_ARRAY_ITEMS) || undefined,
      status: VALID_STATUSES.includes(body.status as JobStatus)
        ? (body.status as JobStatus)
        : "applied",
      appliedAt: body.appliedAt ?? now,
      postedAt: trimOpt(body.postedAt) ?? null,
      applicantsCount:
        typeof body.applicantsCount === "number" &&
        Number.isInteger(body.applicantsCount) &&
        body.applicantsCount >= 0
          ? body.applicantsCount
          : undefined,
      education: trimOpt(body.education) ?? null,
      source: trimOpt(body.source) ?? undefined,
      jdRaw: trimCap(body.jdRaw, MAX_LONG_TEXT_LENGTH) ?? undefined,
      notes: trimCap(body.notes, MAX_LONG_TEXT_LENGTH) ?? undefined,
      createdAt: now,
      updatedAt: now,
    };
    await addJob(job);
    return NextResponse.json(job);
  } catch (e) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }
}
