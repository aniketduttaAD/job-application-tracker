import OpenAI from "openai";
import type { JobRecord, TechStackNormalized } from "./types";

const JD_PARSE_MODEL = "gpt-4o-mini";
const MAX_JD_CHARS = 60_000;

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY ?? "",
});

const SYSTEM_PROMPT = `You are a precise job description parser. You receive the COMPLETE raw job description. Extract structured data from the ENTIRE text with exact accuracy. Respond with valid JSON only—no markdown, no code fences, no extra text.

CRITICAL - Missing or unknown data:
- For any field not present in the JD or not inferable from context: use null for optional fields, use "" (empty string) for required string fields, use [] for techStack when none listed. Do NOT use placeholders like "Unknown", "Not specified", "Pasted", "N/A". Empty or null means "not in JD".
- source: use "" when source is not stated in the JD (do not use "Pasted" unless the JD explicitly says so).
- salaryCurrency: use null when salary is not mentioned; use "USD" only when JD explicitly says USD (or $). Use "INR" when JD says INR, LPA, or Indian Rupees. Use "" only when salary range is given but currency not stated.
- salaryPeriod: use "yearly" only when JD states annual/yearly/LPA; use "monthly" or "hourly" when stated; otherwise null if unclear.

Required JSON keys (use exactly these):
- title: string (exact job title from JD; "" if not found)
- company: string (primary brand/company name as shown first; "" if not found)
- companyPublisher: string | null ("Published by: X" or "Parent company: X" → X; else null)
- location: string (exact location from JD; prefer full form e.g. "Pune, Maharashtra, India" when city + country/region are clear; "" if not found)
- salaryMin: number | null (numeric only; null if not mentioned)
- salaryMax: number | null (numeric only; null if not mentioned)
- salaryCurrency: string | null (exact from JD: "USD", "INR", "EUR", etc.; null when salary not mentioned; "" only when salary range is given but currency not stated)
- salaryPeriod: "hourly" | "monthly" | "yearly" | null (null if not stated)
- techStack: string[] (flat list of ALL skills/tech from JD; [] if none. Keep this complete.)
- techStackNormalized: object (see below; use null if you cannot categorize)
- role: string (exact role from JD when stated; when implied infer from context: e.g. "lead the development of X" → "Lead Front-End Developer" or "Front-End Developer (Lead)"; use title as fallback when no distinct role; never leave empty—use title if needed)
- experience: string (exact range/level from JD e.g. "2-4 years"; if not stated but role implies mid/senior, use e.g. "Mid-level (experience required, years not specified)"; use "Not specified" when JD gives no indication—never leave empty)
- jobType: string | null ("full-time", "part-time", "contract", etc.; infer "full-time" when JD implies permanent employment; null only if unclear)
- availability: string | null ("Immediate", "2 weeks", etc.; null if not mentioned)
- product: string | null (main product/system/project name from JD, e.g. "Duruper.com", "Acme Platform"; null if not stated)
- seniority: string | null (infer from clues: "lead and manage", "large scale", "provide feedback to peers", "mentor" → "mid-senior" or "senior"; "entry-level", "0-2 years" → "junior"; "3-6 years", "experienced" → "mid" or "mid-senior"; null if unclear)
- collaborationTools: string[] | null (tools mentioned in requirements: Slack, Notion, Jira, Confluence, etc.; [] or null if none)
- source: string (where JD is from, if stated; "" if unknown)
- applicantsCount: number | null (e.g. "222 Applicants" → 222; null if not stated)
- education: string | null (e.g. "Bachelor's in CS/IT or equivalent"; null if not stated)
- postedAt: string | null (exact date as YYYY-MM-DD when given; when only relative use as-is: "1 year ago", "2 months ago"; null if not stated)

Salary (must be exact):
- Indian LPA: 1 LPA = 100,000 INR. "7-11 LPA" → salaryMin: 700000, salaryMax: 1100000, salaryCurrency: "INR", salaryPeriod: "yearly". No rounding.
- Other: use absolute numbers (e.g. "80k-120k" USD → 80000, 120000). Never use thousands (e.g. 80 for 80k).

Experience & role:
- Use exact wording from JD for experience (e.g. "2-4 Years" → "2-4 years"). For role: infer from context when implied (e.g. "lead the development of X" → "Lead Front-End Developer"). If absent, use "Not specified" for experience; for role use title when no distinct role stated.

Tech stack (complete and accurate):
- techStack: flat string[] with EVERY technology, framework, tool, and skill. Include collaboration tools (Slack, Notion, Jira) in techStack when mentioned. Use canonical casing: "JUnit" not "Junit", "Design Patterns" not "design patterns", "REST" not "Rest". Frontend: languages, frameworks, state (Redux, Zustand), data (TanStack Query), APIs (REST, GraphQL), build tools, package managers, styling, testing, concepts, version control. Backend: languages (Java, Golang, C#), frameworks (Spring, Hibernate), databases (PostgreSQL, RDBMS), architecture (Microservices), APIs (REST), testing (JUnit, Cucumber, Mockito), devOps (Docker, Kubernetes, BASH), concepts (OOP, Design Patterns, RDBMS, System Design), methodologies (Agile). Deduplicate. [] if none.
- techStackNormalized: categorize into these keys (each optional string[]; omit key if empty): languages, frameworks, stateManagement, data, apis, buildTools, packageManagers, styling, testing, concepts, versionControl, databases, architecture, devOps, methodologies, designPrinciples, operatingSystems, collaborationTools. data = data-fetching/client data libs (e.g. TanStack Query). collaborationTools = Slack, Notion, Jira, Confluence, etc. Frontend example: frameworks: ["Next.js","Styled Components","Tailwind CSS"], stateManagement: ["Zustand","Recoil"], data: ["TanStack Query"], concepts: ["performance optimization","collaboration","testing","documentation","scaling"], collaborationTools: ["Slack","Notion","Jira"]. Use null for techStackNormalized only if JD has no tech/skills at all.

Output rules:
- Exactly one JSON object. No array wrapper. No extra keys. Include every key listed above (use null, "", or [] when missing).
- Extract only what is in the text. Do not guess or invent. Missing → null or "" or [] as above.
- Never use the string "null" or "N/A" for values—use JSON null for optional fields, "" for required strings when absent, [] for empty arrays.`;

export interface ParseResult {
  title: string;
  company: string;
  companyPublisher?: string | null;
  location: string;
  salaryMin: number | null;
  salaryMax: number | null;
  salaryCurrency: string | null;
  salaryPeriod: "hourly" | "monthly" | "yearly" | null;
  techStack: string[];
  techStackNormalized?: TechStackNormalized | null;
  role: string;
  experience: string;
  jobType?: string | null;
  availability?: string | null;
  product?: string | null;
  seniority?: string | null;
  collaborationTools?: string[] | null;
  source: string;
  applicantsCount?: number | null;
  education?: string | null;
  postedAt?: string | null;
}

export async function parseJobDescription(jdText: string): Promise<ParseResult> {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is not set");
  }
  const text = jdText.trim();
  if (!text) throw new Error("Job description text is empty");
  const content = text.length <= MAX_JD_CHARS ? text : text.slice(0, MAX_JD_CHARS);
  const completion = await openai.chat.completions.create({
    model: JD_PARSE_MODEL,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content },
    ],
    response_format: { type: "json_object" },
    temperature: 0.15,
  });
  const rawContent = completion.choices[0]?.message?.content;
  if (!rawContent) throw new Error("Empty response from OpenAI");
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawContent) as ParseResult;
  } catch {
    throw new Error("Invalid JSON in parse response");
  }
  return normalizeParseResult(parsed as ParseResult);
}

function dedupeTechStack(items: string[]): string[] {
  const seen = new Set<string>();
  return items.filter((t) => {
    const s = String(t).trim();
    if (!s) return false;
    const key = s.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function trimOrEmpty(value: unknown): string {
  if (value == null) return "";
  const s = String(value).trim();
  if (s === "null" || s === "undefined") return "";
  return s;
}

function trimOrNull(value: unknown): string | null {
  if (value == null) return null;
  const s = String(value).trim();
  if (!s || s === "null" || s === "undefined") return null;
  return s;
}

function normalizeTechStackNormalized(raw: unknown): TechStackNormalized | null {
  if (raw == null || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const result: TechStackNormalized = {};
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
  let hasAny = false;
  const maxItemLen = 128;
  for (const key of keys) {
    const val = o[key];
    if (Array.isArray(val)) {
      const arr = val.map((t) => String(t).trim().slice(0, maxItemLen)).filter(Boolean);
      if (arr.length) {
        result[key] = arr;
        hasAny = true;
      }
    }
  }
  return hasAny ? result : null;
}

const MAX_TITLE_LEN = 256;
const MAX_COMPANY_LEN = 256;
const MAX_LOCATION_LEN = 256;
const MAX_ROLE_LEN = 256;
const MAX_EXPERIENCE_LEN = 256;

function normalizeParseResult(raw: ParseResult): ParseResult {
  const title = capRequiredString(trimOrEmpty(raw.title), MAX_TITLE_LEN);
  const company = capRequiredString(trimOrEmpty(raw.company), MAX_COMPANY_LEN);
  const location = capRequiredString(trimOrEmpty(raw.location), MAX_LOCATION_LEN);
  const roleRaw = capRequiredString(trimOrEmpty(raw.role), MAX_ROLE_LEN);
  const role = roleRaw || title;
  const experienceRaw = trimOrEmpty(raw.experience);
  const experience =
    experienceRaw.length > 0 && experienceRaw.length <= MAX_EXPERIENCE_LEN
      ? experienceRaw
      : experienceRaw.length > MAX_EXPERIENCE_LEN
        ? experienceRaw.slice(0, MAX_EXPERIENCE_LEN).trim() || "Not specified"
        : "Not specified";
  const source = trimOrEmpty(raw.source);

  let salaryCurrency = trimOrEmpty(raw.salaryCurrency);
  if (salaryCurrency && !/^[A-Z]{3}$/i.test(salaryCurrency)) {
    salaryCurrency = "";
  }

  let salaryPeriod: "hourly" | "monthly" | "yearly" = "yearly";
  if (
    raw.salaryPeriod === "hourly" ||
    raw.salaryPeriod === "monthly" ||
    raw.salaryPeriod === "yearly"
  ) {
    salaryPeriod = raw.salaryPeriod;
  }

  const salaryMin =
    typeof raw.salaryMin === "number" && Number.isFinite(raw.salaryMin) && raw.salaryMin >= 0
      ? raw.salaryMin
      : null;
  const salaryMax =
    typeof raw.salaryMax === "number" && Number.isFinite(raw.salaryMax) && raw.salaryMax >= 0
      ? raw.salaryMax
      : null;

  const techStack = Array.isArray(raw.techStack)
    ? dedupeTechStack(
        raw.techStack.map((t) => String(t).trim().slice(0, 128)).filter((s) => s.length > 0)
      )
    : [];

  const applicantsCount =
    typeof raw.applicantsCount === "number" &&
    Number.isInteger(raw.applicantsCount) &&
    raw.applicantsCount >= 0
      ? raw.applicantsCount
      : null;

  const postedAtRaw = trimOrNull(raw.postedAt);
  const postedAt =
    postedAtRaw && postedAtRaw.length > 0 && postedAtRaw.length <= 128 ? postedAtRaw : null;

  const hasSalary = salaryMin != null || salaryMax != null;

  const collaborationTools =
    Array.isArray(raw.collaborationTools) && raw.collaborationTools.length > 0
      ? raw.collaborationTools.map((t) => String(t).trim().slice(0, 64)).filter((s) => s.length > 0)
      : null;

  return {
    title,
    company,
    companyPublisher: capOptionalString(trimOrNull(raw.companyPublisher), 256),
    location,
    salaryMin,
    salaryMax,
    salaryCurrency: hasSalary ? (salaryCurrency || "").trim() || null : null,
    salaryPeriod,
    techStack,
    techStackNormalized: normalizeTechStackNormalized(raw.techStackNormalized),
    role,
    experience,
    jobType: capOptionalString(trimOrNull(raw.jobType), 64),
    availability: capOptionalString(trimOrNull(raw.availability), 64),
    product: capOptionalString(trimOrNull(raw.product), 256),
    seniority: capOptionalString(trimOrNull(raw.seniority), 64),
    collaborationTools: collaborationTools?.length ? collaborationTools : null,
    source: source.length > 512 ? source.slice(0, 512).trim() || "" : source,
    applicantsCount,
    education: capOptionalString(trimOrNull(raw.education), 2000),
    postedAt,
  };
}

function capRequiredString(s: string, maxLen: number): string {
  if (s.length <= maxLen) return s;
  return s.slice(0, maxLen).trim() || "";
}

function capOptionalString(s: string | null, maxLen: number): string | null {
  if (s == null || s.length <= maxLen) return s;
  return s.slice(0, maxLen).trim() || null;
}

export function parseResultToJobRecord(
  result: ParseResult,
  jdRaw?: string
): Omit<JobRecord, "id" | "createdAt" | "updatedAt"> {
  const now = new Date().toISOString();
  return {
    title: result.title,
    company: result.company,
    companyPublisher: result.companyPublisher ?? undefined,
    location: result.location,
    salaryMin: result.salaryMin,
    salaryMax: result.salaryMax,
    salaryCurrency: result.salaryCurrency,
    salaryPeriod: result.salaryPeriod ?? "yearly",
    techStack: result.techStack,
    techStackNormalized: result.techStackNormalized ?? undefined,
    role: result.role,
    experience: result.experience,
    jobType: result.jobType ?? undefined,
    availability: result.availability ?? undefined,
    product: result.product ?? undefined,
    seniority: result.seniority ?? undefined,
    collaborationTools: result.collaborationTools ?? undefined,
    status: "applied",
    appliedAt: now,
    postedAt: result.postedAt ?? undefined,
    applicantsCount: result.applicantsCount ?? undefined,
    education: result.education ?? undefined,
    source: result.source || undefined,
    jdRaw: jdRaw ?? undefined,
  };
}
