import OpenAI from "openai";
import type { JobRecord, TechStackNormalized } from "./types";

const JD_PARSE_MODEL = "gpt-4o-mini";
const MAX_JD_CHARS = 60_000;
const OPENAI_TIMEOUT_MS = 45_000;
const MAX_RETRIES = 2;
const BASE_RETRY_DELAY_MS = 1000;
const MAX_TOKENS_RESPONSE = 3000;
const EXCHANGE_RATE_TIMEOUT_MS = 5000;
const EXCHANGE_RATE_CACHE_TTL_MS = 3600_000;

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY ?? "",
  timeout: OPENAI_TIMEOUT_MS,
});

const SYSTEM_PROMPT = `Extract structured data from job description. Return valid JSON only—no markdown.

Search ALL sections for salary/compensation: header, benefits, requirements. Look for: LPA, lakhs, per annum/year/month, hourly rate, salary ranges, competitive salary.

Salary handling:
- Found in JD: Extract exactly, set salaryEstimated: false
- Not found: Estimate from role/location/company, set salaryEstimated: true, NEVER leave null if estimatable
- Extract in original currency/period - conversion handled programmatically
- If estimating, use INR yearly

Output format:
{
  "title": "exact title or ''",
  "company": "company name or ''",
  "companyPublisher": "publisher or null",
  "location": "full location or ''",
  "salaryMin": number_or_null,
  "salaryMax": number_or_null,
  "salaryCurrency": "USD|EUR|GBP|INR|etc or null",
  "salaryPeriod": "yearly|monthly|hourly or null",
  "salaryEstimated": boolean,
  "techStack": ["all tech/tools/skills"],
  "techStackNormalized": {
    "languages": [], "frameworks": [], "databases": [], "devOps": [],
    "data": [], "apis": [], "testing": [], "styling": [], "collaborationTools": []
  },
  "role": "role name or title",
  "experience": "0-2 years|Not specified",
  "jobType": "full-time|part-time|contract|etc or null",
  "availability": "ASAP|Immediate|etc or null",
  "product": "product name or null",
  "seniority": "junior|mid|senior or null",
  "collaborationTools": ["Slack","Jira"] or null,
  "source": "LinkedIn|Indeed|etc or ''",
  "applicantsCount": number_or_null,
  "education": "degree requirements or null",
  "postedAt": "YYYY-MM-DD|relative date or null"
}

Seniority inference: lead/senior/principal/architect/manager→senior, junior/entry/associate/intern/0-2yrs→junior, mid/3-6yrs→mid
Missing data: null for optional, "" for required strings, [] for arrays. No placeholders like "Unknown" or "N/A".`;

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
  salaryEstimated?: boolean;
}

class ParseError extends Error {
  constructor(
    message: string,
    public readonly isRetryable: boolean = false
  ) {
    super(message);
    this.name = "ParseError";
  }
}

const DEFAULT_EXCHANGE_RATES: Record<string, number> = {
  USD: 83.5,
  EUR: 90.2,
  GBP: 105.3,
  CAD: 61.5,
  AUD: 54.8,
  SGD: 61.2,
  JPY: 0.56,
  CHF: 93.5,
};

let exchangeRateCache: { rates: Record<string, number>; timestamp: number } | null = null;

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  errorMsg: string
): Promise<T> {
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new ParseError(errorMsg, true)), timeoutMs);
  });
  return Promise.race([promise, timeoutPromise]);
}

async function getExchangeRatesToINR(): Promise<Record<string, number>> {
  const now = Date.now();

  if (exchangeRateCache && now - exchangeRateCache.timestamp < EXCHANGE_RATE_CACHE_TTL_MS) {
    return exchangeRateCache.rates;
  }

  try {
    const response = await withTimeout(
      openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: `Return ONLY valid JSON with current exchange rates to INR. Format: {"USD": 83.5, "EUR": 90.2, ...}`,
          },
          {
            role: "user",
            content: `Current exchange rates to INR as of ${new Date().toISOString().split("T")[0]}?`,
          },
        ],
        response_format: { type: "json_object" },
        temperature: 0.1,
        max_tokens: 200,
      }),
      EXCHANGE_RATE_TIMEOUT_MS,
      "Exchange rate fetch timeout"
    );

    const content = response.choices[0]?.message?.content;
    if (!content) throw new Error("Empty exchange rate response");

    const rates = JSON.parse(content) as Record<string, number>;
    const validatedRates: Record<string, number> = {};

    for (const [currency, rate] of Object.entries(rates)) {
      const numRate = typeof rate === "number" ? rate : parseFloat(String(rate));
      if (Number.isFinite(numRate) && numRate > 0 && numRate < 10000) {
        validatedRates[currency.toUpperCase()] = numRate;
      }
    }

    if (Object.keys(validatedRates).length > 0) {
      exchangeRateCache = { rates: validatedRates, timestamp: now };
      return validatedRates;
    }
  } catch (error) {
    if (process.env.NODE_ENV === "development") {
      console.warn("[Parse] Exchange rate fetch failed, using defaults");
    }
  }

  return DEFAULT_EXCHANGE_RATES;
}

function isRetryableError(error: Error): boolean {
  const retryablePatterns = [
    "timeout",
    "rate limit",
    "429",
    "500",
    "502",
    "503",
    "service unavailable",
    "network",
    "ECONNRESET",
    "ETIMEDOUT",
  ];
  return retryablePatterns.some((pattern) => error.message.includes(pattern));
}

function isNonRetryableError(error: Error): boolean {
  const nonRetryablePatterns = [
    "Empty response",
    "Invalid response structure",
    "content policy",
    "authentication failed",
    "OPENAI_API_KEY is not set",
    "Job description text is empty",
    "must be a string",
    "Response too short",
  ];
  return nonRetryablePatterns.some((pattern) => error.message.includes(pattern));
}

async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries: number = MAX_RETRIES
): Promise<T> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      if (attempt > 0) {
        const delay = BASE_RETRY_DELAY_MS * Math.pow(2, attempt - 1);
        if (process.env.NODE_ENV === "development") {
          console.log(`[Parse] Retry attempt ${attempt} after ${delay}ms`);
        }
        await sleep(delay);
      }

      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (isNonRetryableError(lastError)) throw lastError;
      if (!isRetryableError(lastError) || attempt === maxRetries) throw lastError;

      if (process.env.NODE_ENV === "development") {
        console.error(`[Parse] Attempt ${attempt + 1} failed:`, lastError.message);
      }
    }
  }

  throw lastError || new Error("Parse failed after retries");
}

function extractJSON(rawContent: string): string {
  let content = rawContent.trim();

  if (content.startsWith("```")) {
    const lines = content.split("\n");
    const startIdx = lines[0].toLowerCase().includes("json") ? 1 : 0;
    const endIdx = lines[lines.length - 1].trim() === "```" ? lines.length - 1 : lines.length;
    content = lines.slice(startIdx, endIdx).join("\n").trim();
  }

  if (!content.startsWith("{")) {
    const jsonStart = content.indexOf("{");
    const jsonEnd = content.lastIndexOf("}");
    if (jsonStart !== -1 && jsonEnd !== -1 && jsonEnd > jsonStart) {
      content = content.substring(jsonStart, jsonEnd + 1);
    }
  }

  return content;
}

async function callOpenAI(content: string): Promise<ParseResult> {
  const completion = await withTimeout(
    openai.chat.completions.create({
      model: JD_PARSE_MODEL,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content },
      ],
      response_format: { type: "json_object" },
      temperature: 0.15,
      max_tokens: MAX_TOKENS_RESPONSE,
    }),
    OPENAI_TIMEOUT_MS,
    "Request timeout - parsing took too long"
  );

  if (!completion?.choices?.length) {
    throw new ParseError("Invalid response structure from OpenAI");
  }

  const rawContent = completion.choices[0]?.message?.content;
  if (!rawContent) throw new ParseError("Empty response from OpenAI");

  const finishReason = completion.choices[0]?.finish_reason;
  if (finishReason === "content_filter") {
    throw new ParseError("Response filtered by OpenAI content policy");
  }
  if (finishReason === "stop" && rawContent.length < 10) {
    throw new ParseError("Response too short - likely incomplete");
  }
  if (finishReason === "length" && process.env.NODE_ENV === "development") {
    console.warn(`[Parse] Response truncated (${rawContent.length} chars)`);
  }

  try {
    return JSON.parse(rawContent) as ParseResult;
  } catch {
    const fixedContent = extractJSON(rawContent);
    try {
      return JSON.parse(fixedContent) as ParseResult;
    } catch (parseError) {
      if (process.env.NODE_ENV === "development") {
        console.error("[Parse] JSON parse failed:", rawContent.slice(0, 500));
      }
      throw new ParseError("Invalid JSON in parse response", true);
    }
  }
}

function validateAndFixRequired(parsed: ParseResult | Record<string, unknown>): void {
  const obj = parsed as Record<string, unknown>;
  if (typeof obj.title !== "string") obj.title = "";
  if (typeof obj.company !== "string") obj.company = "";
  if (typeof obj.location !== "string") obj.location = "";
}

function normalizeString(value: unknown, required: boolean = false): string | null {
  if (value == null) return required ? "" : null;
  const s = String(value).trim();
  if (!s || s === "null" || s === "undefined") return required ? "" : null;
  return s;
}

function capString(s: string | null, maxLen: number, required: boolean = false): string | null {
  if (s == null) return required ? "" : null;
  if (s.length <= maxLen) return s;
  const capped = s.slice(0, maxLen).trim();
  return capped || (required ? "" : null);
}

function dedupeArray(items: string[], maxLen: number = 128): string[] {
  const seen = new Set<string>();
  return items
    .map((t) => String(t).trim().slice(0, maxLen))
    .filter((s) => {
      if (!s) return false;
      const key = s.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
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
  for (const key of keys) {
    const val = o[key];
    if (Array.isArray(val)) {
      const arr = dedupeArray(val);
      if (arr.length) {
        result[key] = arr;
        hasAny = true;
      }
    }
  }

  return hasAny ? result : null;
}

function normalizeNumber(
  value: unknown,
  min: number = 0,
  max: number = 1_000_000_000
): number | null {
  if (value == null) return null;
  const num = typeof value === "number" ? value : parseFloat(String(value));
  if (!Number.isFinite(num) || num < min || num > max) return null;
  return Math.round(num);
}

function convertToINRYearly(
  salaryMin: number | null,
  salaryMax: number | null,
  currency: string,
  period: "hourly" | "monthly" | "yearly",
  exchangeRates: Record<string, number>
): { min: number | null; max: number | null } {
  if (salaryMin == null && salaryMax == null) {
    return { min: null, max: null };
  }

  let min = salaryMin;
  let max = salaryMax;

  if (currency && currency.toUpperCase() !== "INR") {
    const rate = exchangeRates[currency.toUpperCase()];
    if (rate && Number.isFinite(rate) && rate > 0) {
      if (min != null) min = Math.round(min * rate);
      if (max != null) max = Math.round(max * rate);
    }
  }

  const periodMultipliers: Record<string, number> = {
    hourly: 2080,
    monthly: 12,
    yearly: 1,
  };

  const multiplier = periodMultipliers[period] || 1;
  if (min != null) {
    const converted = min * multiplier;
    min = Number.isFinite(converted) && converted <= 1_000_000_000 ? Math.round(converted) : null;
  }
  if (max != null) {
    const converted = max * multiplier;
    max = Number.isFinite(converted) && converted <= 1_000_000_000 ? Math.round(converted) : null;
  }

  if (min != null && max != null && max < min) {
    [min, max] = [max, min];
  }

  return { min, max };
}

async function normalizeParseResult(raw: ParseResult): Promise<ParseResult> {
  const title = capString(normalizeString(raw.title, true), 256, true) as string;
  const company = capString(normalizeString(raw.company, true), 256, true) as string;
  const location = capString(normalizeString(raw.location, true), 256, true) as string;
  const roleRaw = capString(normalizeString(raw.role, true), 256, true) as string;
  const role = roleRaw || title;
  const experienceRaw = normalizeString(raw.experience, true) as string;
  const experience = experienceRaw && experienceRaw.length <= 256 ? experienceRaw : "Not specified";
  const source = capString(normalizeString(raw.source, true), 512, true) as string;

  let salaryCurrency = normalizeString(raw.salaryCurrency, true) as string;
  if (salaryCurrency && !/^[A-Z]{3}$/i.test(salaryCurrency)) {
    salaryCurrency = "";
  }

  let salaryPeriod: "hourly" | "monthly" | "yearly" = "yearly";
  if (["hourly", "monthly", "yearly"].includes(raw.salaryPeriod as string)) {
    salaryPeriod = raw.salaryPeriod as "hourly" | "monthly" | "yearly";
  }

  let salaryMin = normalizeNumber(raw.salaryMin);
  let salaryMax = normalizeNumber(raw.salaryMax);

  const hasSalary = salaryMin != null || salaryMax != null;

  if (hasSalary && salaryCurrency) {
    const exchangeRates = await getExchangeRatesToINR();
    const converted = convertToINRYearly(
      salaryMin,
      salaryMax,
      salaryCurrency,
      salaryPeriod,
      exchangeRates
    );
    salaryMin = converted.min;
    salaryMax = converted.max;
    salaryCurrency = "INR";
    salaryPeriod = "yearly";
  }

  const techStack = Array.isArray(raw.techStack) ? dedupeArray(raw.techStack) : [];

  const collaborationTools = Array.isArray(raw.collaborationTools)
    ? dedupeArray(raw.collaborationTools, 64)
    : null;

  return {
    title,
    company,
    companyPublisher: capString(normalizeString(raw.companyPublisher), 256),
    location,
    salaryMin,
    salaryMax,
    salaryCurrency: hasSalary ? salaryCurrency || null : null,
    salaryPeriod: hasSalary ? salaryPeriod : null,
    techStack,
    techStackNormalized: normalizeTechStackNormalized(raw.techStackNormalized),
    role,
    experience,
    jobType: capString(normalizeString(raw.jobType), 64),
    availability: capString(normalizeString(raw.availability), 64),
    product: capString(normalizeString(raw.product), 256),
    seniority: capString(normalizeString(raw.seniority), 64),
    collaborationTools: collaborationTools?.length ? collaborationTools : null,
    source,
    applicantsCount: normalizeNumber(raw.applicantsCount),
    education: capString(normalizeString(raw.education), 2000),
    postedAt: capString(normalizeString(raw.postedAt), 128),
    salaryEstimated: raw.salaryEstimated ?? false,
  };
}

export async function parseJobDescription(jdText: string): Promise<ParseResult> {
  const startTime = Date.now();

  if (!process.env.OPENAI_API_KEY) {
    throw new ParseError("OPENAI_API_KEY is not set");
  }

  if (typeof jdText !== "string") {
    throw new ParseError("Job description must be a string");
  }

  const text = jdText.trim();
  if (!text) {
    throw new ParseError("Job description text is empty");
  }

  const content = text.length <= MAX_JD_CHARS ? text : text.slice(0, MAX_JD_CHARS);

  if (text.length > MAX_JD_CHARS && process.env.NODE_ENV === "development") {
    console.warn(`[Parse] JD truncated from ${text.length} to ${MAX_JD_CHARS} chars`);
  }

  try {
    const parsed = await retryWithBackoff(() => callOpenAI(content));

    validateAndFixRequired(parsed);

    const normalized = await normalizeParseResult(parsed);

    if (process.env.NODE_ENV === "development") {
      console.log(`[Parse] Completed in ${Date.now() - startTime}ms`);
    }

    return normalized;
  } catch (error) {
    if (process.env.NODE_ENV === "development") {
      console.error(`[Parse] Failed after ${Date.now() - startTime}ms`);
    }
    throw error;
  }
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
    salaryEstimated: result.salaryEstimated ?? false,
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
