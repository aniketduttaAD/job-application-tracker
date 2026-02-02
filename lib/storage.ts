import { neon } from "@neondatabase/serverless";
import type { JobsData, JobRecord, TechStackNormalized } from "./types";

const sql = process.env.DATABASE_URL
  ? neon(process.env.DATABASE_URL)
  : null;

function rowToJob(row: Record<string, unknown>): JobRecord {
  return {
    id: String(row.id ?? ""),
    title: String(row.title ?? ""),
    company: String(row.company ?? ""),
    companyPublisher: row.company_publisher != null ? String(row.company_publisher) : null,
    location: String(row.location ?? ""),
    salaryMin: row.salary_min != null ? Number(row.salary_min) : null,
    salaryMax: row.salary_max != null ? Number(row.salary_max) : null,
    salaryCurrency: row.salary_currency != null ? String(row.salary_currency) : null,
    salaryPeriod:
      row.salary_period === "hourly" ||
      row.salary_period === "monthly" ||
      row.salary_period === "yearly"
        ? row.salary_period
        : undefined,
    techStack: Array.isArray(row.tech_stack) ? row.tech_stack.map(String) : [],
    techStackNormalized:
      row.tech_stack_normalized != null && typeof row.tech_stack_normalized === "object"
        ? (row.tech_stack_normalized as TechStackNormalized)
        : null,
    role: String(row.role ?? ""),
    experience: String(row.experience ?? "Not specified"),
    jobType: row.job_type != null ? String(row.job_type) : null,
    availability: row.availability != null ? String(row.availability) : null,
    product: row.product != null ? String(row.product) : null,
    seniority: row.seniority != null ? String(row.seniority) : null,
    collaborationTools: Array.isArray(row.collaboration_tools)
      ? row.collaboration_tools.map(String)
      : null,
    status: String(row.status ?? "applied") as JobRecord["status"],
    appliedAt: row.applied_at instanceof Date ? row.applied_at.toISOString() : String(row.applied_at ?? ""),
    postedAt: row.posted_at != null ? String(row.posted_at) : null,
    applicantsCount: row.applicants_count != null ? Number(row.applicants_count) : null,
    education: row.education != null ? String(row.education) : null,
    source: row.source != null ? String(row.source) : undefined,
    jdRaw: row.jd_raw != null ? String(row.jd_raw) : undefined,
    notes: row.notes != null ? String(row.notes) : undefined,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at ?? ""),
    updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : String(row.updated_at ?? ""),
  };
}

export async function getJobsPath(): Promise<string> {
  return process.env.DATABASE_URL ? "postgres" : "";
}

export async function readJobs(): Promise<JobsData> {
  if (!sql) {
    return { jobs: [], updatedAt: new Date().toISOString() };
  }
  const rows = (await sql.query(
    "SELECT * FROM jobs ORDER BY applied_at DESC"
  )) as Record<string, unknown>[];
  const jobs = rows.map(rowToJob);
  const updatedAt =
    jobs.length > 0
      ? jobs.reduce((latest, j) => (j.updatedAt > latest ? j.updatedAt : latest), jobs[0].updatedAt)
      : new Date().toISOString();
  return { jobs, updatedAt };
}

export async function writeJobs(data: JobsData): Promise<void> {
  if (!sql) return;
  await sql.query("DELETE FROM jobs");
  for (const job of data.jobs) {
    await sql.query(
      `INSERT INTO jobs (
        id, title, company, company_publisher, location,
        salary_min, salary_max, salary_currency, salary_period,
        tech_stack, tech_stack_normalized, role, experience,
        job_type, availability, product, seniority, collaboration_tools,
        status, applied_at, posted_at, applicants_count, education, source,
        jd_raw, notes, created_at, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17,
        $18, $19, $20, $21, $22, $23, $24, $25, $26, $27
      )`,
      [
        job.id,
        job.title,
        job.company,
        job.companyPublisher ?? null,
        job.location,
        job.salaryMin ?? null,
        job.salaryMax ?? null,
        job.salaryCurrency ?? null,
        job.salaryPeriod ?? null,
        JSON.stringify(job.techStack ?? []),
        job.techStackNormalized != null ? JSON.stringify(job.techStackNormalized) : null,
        job.role,
        job.experience,
        job.jobType ?? null,
        job.availability ?? null,
        job.product ?? null,
        job.seniority ?? null,
        job.collaborationTools != null ? JSON.stringify(job.collaborationTools) : null,
        job.status,
        job.appliedAt,
        job.postedAt ?? null,
        job.applicantsCount ?? null,
        job.education ?? null,
        job.source ?? null,
        job.jdRaw ?? null,
        job.notes ?? null,
        job.createdAt,
        job.updatedAt,
      ]
    );
  }
}

export async function addJob(job: JobRecord): Promise<JobRecord> {
  if (!sql) return job;
  await sql.query(
    `INSERT INTO jobs (
      id, title, company, company_publisher, location,
      salary_min, salary_max, salary_currency, salary_period,
      tech_stack, tech_stack_normalized, role, experience,
      job_type, availability, product, seniority, collaboration_tools,
      status, applied_at, posted_at, applicants_count, education, source,
      jd_raw, notes, created_at, updated_at
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17,
      $18, $19, $20, $21, $22, $23, $24, $25, $26, $27
    )`,
    [
      job.id,
      job.title,
      job.company,
      job.companyPublisher ?? null,
      job.location,
      job.salaryMin ?? null,
      job.salaryMax ?? null,
      job.salaryCurrency ?? null,
      job.salaryPeriod ?? null,
      JSON.stringify(job.techStack ?? []),
      job.techStackNormalized != null ? JSON.stringify(job.techStackNormalized) : null,
      job.role,
      job.experience,
      job.jobType ?? null,
      job.availability ?? null,
      job.product ?? null,
      job.seniority ?? null,
      job.collaborationTools != null ? JSON.stringify(job.collaborationTools) : null,
      job.status,
      job.appliedAt,
      job.postedAt ?? null,
      job.applicantsCount ?? null,
      job.education ?? null,
      job.source ?? null,
      job.jdRaw ?? null,
      job.notes ?? null,
      job.createdAt,
      job.updatedAt,
    ]
  );
  return job;
}

export async function updateJob(
  id: string,
  updates: Partial<JobRecord>
): Promise<JobRecord | null> {
  if (!sql) return null;
  const existing = (await sql.query("SELECT * FROM jobs WHERE id = $1", [id])) as Record<string, unknown>[];
  if (!existing.length) return null;

  const current = rowToJob(existing[0]);
  const merged: JobRecord = {
    ...current,
    ...updates,
    id,
    updatedAt: new Date().toISOString(),
  };

  await sql.query(
    `UPDATE jobs SET
      title = $2, company = $3, company_publisher = $4, location = $5,
      salary_min = $6, salary_max = $7, salary_currency = $8, salary_period = $9,
      tech_stack = $10, tech_stack_normalized = $11, role = $12, experience = $13,
      job_type = $14, availability = $15, product = $16, seniority = $17,
      collaboration_tools = $18, status = $19, applied_at = $20, posted_at = $21,
      applicants_count = $22, education = $23, source = $24, jd_raw = $25, notes = $26,
      updated_at = $27
    WHERE id = $1`,
    [
      id,
      merged.title,
      merged.company,
      merged.companyPublisher ?? null,
      merged.location,
      merged.salaryMin ?? null,
      merged.salaryMax ?? null,
      merged.salaryCurrency ?? null,
      merged.salaryPeriod ?? null,
      JSON.stringify(merged.techStack ?? []),
      merged.techStackNormalized != null ? JSON.stringify(merged.techStackNormalized) : null,
      merged.role,
      merged.experience,
      merged.jobType ?? null,
      merged.availability ?? null,
      merged.product ?? null,
      merged.seniority ?? null,
      merged.collaborationTools != null ? JSON.stringify(merged.collaborationTools) : null,
      merged.status,
      merged.appliedAt,
      merged.postedAt ?? null,
      merged.applicantsCount ?? null,
      merged.education ?? null,
      merged.source ?? null,
      merged.jdRaw ?? null,
      merged.notes ?? null,
      merged.updatedAt,
    ]
  );
  return merged;
}

export async function deleteJob(id: string): Promise<boolean> {
  if (!sql) return false;
  const result = (await sql.query("DELETE FROM jobs WHERE id = $1 RETURNING id", [id])) as { id: string }[];
  return result.length > 0;
}

export async function deleteJobs(ids: string[]): Promise<number> {
  if (!sql || ids.length === 0) return 0;
  const result = (await sql.query(
    "DELETE FROM jobs WHERE id = ANY($1::text[]) RETURNING id",
    [ids]
  )) as { id: string }[];
  return result.length;
}
