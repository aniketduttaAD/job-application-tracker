import OpenAI from "openai";
import type { JobRecord, TechStackNormalized } from "./types";

const JD_PARSE_MODEL = "gpt-4o-mini";
const MAX_JD_CHARS = 60_000;
const OPENAI_TIMEOUT_MS = 45_000;
const SALARY_ESTIMATE_TIMEOUT_MS = 20_000;
const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 1000;
const MAX_TOKENS_RESPONSE = 3000;

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY ?? "",
  timeout: OPENAI_TIMEOUT_MS,
});

const SYSTEM_PROMPT = `Extract structured data from the job description. Return valid JSON only—no markdown, no code fences.

Read ALL sections: header, company info, job details, requirements, tech stack, salary, location.

Fields:
- title: exact job title ("" if not found)
- company: primary company name from header/title ("" if not found)
- companyPublisher: "Published by: X" → X, else null
- location: full location e.g. "Bengaluru, Karnataka, India" ("" if not found)
- salaryMin/Max: numbers only, null if not mentioned. Single value → use same for both. Monthly: keep as "monthly" period.
- salaryCurrency: "USD", "INR", "EUR", etc. Infer INR if India location. null if no salary.
- salaryPeriod: "yearly" (LPA/annual), "monthly", "hourly", or null
- techStack: string[] of ALL tech/skills mentioned. [] if none.
- techStackNormalized: categorize into languages, frameworks, stateManagement, data, apis, buildTools, styling, testing, databases, devOps, collaborationTools, etc. null if none.
- role: exact role or infer from context. Use title if no distinct role.
- experience: exact wording e.g. "0-3 years". "Not specified" if absent.
- jobType: "full-time", "part-time", "contract", etc. Infer "full-time" if permanent. null if unclear.
- availability: "ASAP", "Immediate", "2 weeks", etc. null if not mentioned.
- product: product name from "About [Company]" sections. null if not stated.
- seniority: infer from clues ("lead/manage"→senior, "0-2 years"→junior, "3-6 years"→mid). null if unclear.
- collaborationTools: string[] e.g. ["Slack","Notion","Jira"]. null if none.
- source: where JD is from ("" if unknown)
- applicantsCount: number e.g. "Over 100" → 100. null if not stated.
- education: e.g. "Bachelor's in CS/IT". null if not stated.
- postedAt: YYYY-MM-DD or relative "2 days ago". null if not stated.

Salary rules:
- LPA: 1 LPA = 100,000 INR. "7-11 LPA" → min:700000, max:1100000, currency:"INR", period:"yearly"
- Monthly: "80k/month" → min:80000, max:80000, period:"monthly" (keep monthly)
- Ranges: "80k-120k/month" → min:80000, max:120000, period:"monthly"
- Use absolute numbers: "80k" → 80000, not 80
- Infer INR for India locations if currency not stated

Missing data: null for optional, "" for required strings, [] for arrays. No placeholders like "Unknown" or "N/A".

Output: Single JSON object with all keys above. Use JSON null, not string "null".`;

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

interface EstimatedSalaryResult {
  salaryMin: number | null;
  salaryMax: number | null;
  salaryCurrency: string | null;
  salaryPeriod: "hourly" | "monthly" | "yearly" | null;
}

async function fetchEstimatedSalary(
  company: string,
  role: string,
  experience: string,
  location: string
): Promise<EstimatedSalaryResult | null> {
  if (!process.env.OPENAI_API_KEY) {
    return null;
  }

  try {
    const searchQuery = `What is the average salary range for ${role} position${company ? ` at ${company}` : ""} with ${experience} experience in ${location}? Search for current market salary data and return ONLY a valid JSON object with these exact keys: salaryMin (number), salaryMax (number), salaryCurrency (string like "USD" or "INR"), and salaryPeriod (string: "yearly", "monthly", or "hourly"). If salary data is not found, return: {"salaryMin": null, "salaryMax": null, "salaryCurrency": null, "salaryPeriod": null}`;

    let timeoutId: NodeJS.Timeout | null = null;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => {
        reject(new Error("Salary estimation timeout"));
      }, SALARY_ESTIMATE_TIMEOUT_MS);
    });

    let response;
    try {
      response = await Promise.race([
        (openai as any).responses.create({
          model: "gpt-5",
          tools: [{ type: "web_search" }],
          input: searchQuery,
        }),
        timeoutPromise,
      ]);
    } finally {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    }

    if (!response?.output_text) {
      return null;
    }

    const text = response.output_text.trim();

    let jsonStart = text.indexOf("{");
    let jsonEnd = text.lastIndexOf("}");

    if (jsonStart === -1 || jsonEnd === -1 || jsonEnd <= jsonStart) {
      const numbers = text.match(/\d{1,3}(?:,\d{3})*(?:\.\d+)?/g);
      if (numbers && numbers.length >= 2) {
        const min = parseFloat(numbers[0].replace(/,/g, ""));
        const max = parseFloat(numbers[1].replace(/,/g, ""));
        if (!isNaN(min) && !isNaN(max) && min > 0 && max > 0) {
          const locationLower = location.toLowerCase();
          const currency =
            locationLower.includes("india") ||
            locationLower.includes("inr") ||
            locationLower.includes("bangalore") ||
            locationLower.includes("bengaluru") ||
            locationLower.includes("mumbai") ||
            locationLower.includes("delhi") ||
            locationLower.includes("hyderabad") ||
            locationLower.includes("pune") ||
            locationLower.includes("chennai") ||
            locationLower.includes("karnataka") ||
            locationLower.includes("maharashtra")
              ? "INR"
              : "USD";
          return {
            salaryMin: min,
            salaryMax: max,
            salaryCurrency: currency,
            salaryPeriod: "yearly",
          };
        }
      }
      return null;
    }

    try {
      const jsonStr = text.substring(jsonStart, jsonEnd + 1);
      const parsed = JSON.parse(jsonStr) as EstimatedSalaryResult;

      if (parsed.salaryMin != null || parsed.salaryMax != null) {
        let currency = parsed.salaryCurrency;
        if (!currency) {
          const locationLower = location.toLowerCase();
          currency =
            locationLower.includes("india") ||
            locationLower.includes("inr") ||
            locationLower.includes("bangalore") ||
            locationLower.includes("bengaluru") ||
            locationLower.includes("mumbai") ||
            locationLower.includes("delhi") ||
            locationLower.includes("hyderabad") ||
            locationLower.includes("pune") ||
            locationLower.includes("chennai") ||
            locationLower.includes("karnataka") ||
            locationLower.includes("maharashtra")
              ? "INR"
              : "USD";
        }

        return {
          salaryMin: parsed.salaryMin ?? null,
          salaryMax: parsed.salaryMax ?? null,
          salaryCurrency: currency,
          salaryPeriod: parsed.salaryPeriod || "yearly",
        };
      }
    } catch (parseError) {
      if (process.env.NODE_ENV === "development") {
        console.log("Salary estimation JSON parse failed:", parseError);
        console.log("Raw response:", text);
      }

      const numbers = text.match(/\d{1,3}(?:,\d{3})*(?:\.\d+)?/g);
      if (numbers && numbers.length >= 2) {
        const min = parseFloat(numbers[0].replace(/,/g, ""));
        const max = parseFloat(numbers[1].replace(/,/g, ""));
        if (!isNaN(min) && !isNaN(max) && min > 0 && max > 0) {
          const locationLower = location.toLowerCase();
          const currency =
            locationLower.includes("india") ||
            locationLower.includes("inr") ||
            locationLower.includes("bangalore") ||
            locationLower.includes("bengaluru") ||
            locationLower.includes("mumbai") ||
            locationLower.includes("delhi") ||
            locationLower.includes("hyderabad") ||
            locationLower.includes("pune") ||
            locationLower.includes("chennai") ||
            locationLower.includes("karnataka") ||
            locationLower.includes("maharashtra")
              ? "INR"
              : "USD";
          return {
            salaryMin: min,
            salaryMax: max,
            salaryCurrency: currency,
            salaryPeriod: "yearly",
          };
        }
      }
    }
  } catch (e) {
    if (process.env.NODE_ENV === "development") {
      console.log(
        "Salary estimation failed (non-critical):",
        e instanceof Error ? e.message : String(e)
      );
    }
  }

  return null;
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function parseJobDescription(jdText: string): Promise<ParseResult> {
  const startTime = Date.now();

  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is not set");
  }

  // Validate input
  if (typeof jdText !== "string") {
    throw new Error("Job description must be a string");
  }

  const text = jdText.trim();
  if (!text) {
    throw new Error("Job description text is empty");
  }

  if (text.length > MAX_JD_CHARS) {
    if (process.env.NODE_ENV === "development") {
      console.warn(
        `[Parse] Job description truncated from ${text.length} to ${MAX_JD_CHARS} characters`
      );
    }
  }

  const content = text.length <= MAX_JD_CHARS ? text : text.slice(0, MAX_JD_CHARS);

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      if (attempt > 0) {
        const delay = RETRY_DELAY_MS * Math.pow(2, attempt - 1);
        if (process.env.NODE_ENV === "development") {
          console.log(`[Parse] Retry attempt ${attempt} after ${delay}ms delay`);
        }
        await sleep(delay);
      }

      const requestStartTime = Date.now();

      let timeoutId: NodeJS.Timeout | null = null;
      const timeoutPromise = new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => {
          reject(new Error("Request timeout - parsing took too long"));
        }, OPENAI_TIMEOUT_MS);
      });

      let completion;
      try {
        completion = await Promise.race([
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
          timeoutPromise,
        ]);
      } catch (apiError) {
        // Handle API-specific errors
        if (apiError instanceof Error) {
          if (apiError.message.includes("timeout")) {
            throw apiError; // Let retry logic handle it
          }
          if (apiError.message.includes("401") || apiError.message.includes("Unauthorized")) {
            throw new Error("OpenAI API authentication failed. Please check your API key.");
          }
          if (apiError.message.includes("429") || apiError.message.includes("rate limit")) {
            throw new Error("OpenAI API rate limit exceeded. Please try again later.");
          }
          if (apiError.message.includes("500") || apiError.message.includes("503")) {
            throw new Error("OpenAI API service unavailable. Please try again later.");
          }
        }
        throw apiError;
      } finally {
        // Always clear timeout to prevent memory leaks
        if (timeoutId) {
          clearTimeout(timeoutId);
          timeoutId = null;
        }
      }

      // Validate completion structure
      if (
        !completion ||
        !completion.choices ||
        !Array.isArray(completion.choices) ||
        completion.choices.length === 0
      ) {
        throw new Error("Invalid response structure from OpenAI");
      }

      const requestDuration = Date.now() - requestStartTime;
      if (process.env.NODE_ENV === "development") {
        console.log(
          `[Parse] OpenAI API call completed in ${requestDuration}ms (attempt ${attempt + 1})`
        );
      }

      const rawContent = completion.choices[0]?.message?.content;
      if (!rawContent || typeof rawContent !== "string") {
        throw new Error("Empty or invalid response from OpenAI");
      }

      const finishReason = completion.choices[0]?.finish_reason;
      if (finishReason === "length") {
        if (process.env.NODE_ENV === "development") {
          console.warn(
            `[Parse] Response may be truncated (finish_reason: length). Response length: ${rawContent.length} chars.`
          );
        }
        // Try to parse anyway - might still have valid JSON
      }

      if (finishReason === "content_filter") {
        throw new Error("Response was filtered by OpenAI content policy");
      }

      if (finishReason === "stop" && rawContent.length < 10) {
        throw new Error("Response too short - likely incomplete");
      }

      let parsed: unknown;
      try {
        parsed = JSON.parse(rawContent) as ParseResult;
      } catch (parseError) {
        // Try to fix common JSON issues
        let fixedContent = rawContent.trim();

        // Remove markdown code fences
        if (fixedContent.startsWith("```")) {
          const lines = fixedContent.split("\n");
          const startIdx = lines[0].toLowerCase().includes("json") ? 1 : 0;
          const endIdx = lines[lines.length - 1].trim() === "```" ? lines.length - 1 : lines.length;
          fixedContent = lines.slice(startIdx, endIdx).join("\n").trim();
        }

        // Try to extract JSON object if wrapped in text
        if (!fixedContent.startsWith("{")) {
          const jsonStart = fixedContent.indexOf("{");
          const jsonEnd = fixedContent.lastIndexOf("}");
          if (jsonStart !== -1 && jsonEnd !== -1 && jsonEnd > jsonStart) {
            fixedContent = fixedContent.substring(jsonStart, jsonEnd + 1);
          }
        }

        try {
          parsed = JSON.parse(fixedContent) as ParseResult;
        } catch (retryError) {
          const errorMsg = `Invalid JSON in parse response: ${parseError instanceof Error ? parseError.message : "Unknown error"}`;
          if (process.env.NODE_ENV === "development") {
            console.error(`[Parse] JSON parse error after fixes:`, errorMsg);
            console.error(`[Parse] Raw response length:`, rawContent.length);
            console.error(`[Parse] Raw response (first 1000 chars):`, rawContent.slice(0, 1000));
            console.error(`[Parse] Fixed content (first 500 chars):`, fixedContent.slice(0, 500));
          }
          throw new Error(errorMsg);
        }
      }

      // Validate parsed result has required fields
      if (!parsed || typeof parsed !== "object") {
        throw new Error("Parsed result is not an object");
      }

      const parsedObj = parsed as Record<string, unknown>;
      if (
        typeof parsedObj.title !== "string" ||
        typeof parsedObj.company !== "string" ||
        typeof parsedObj.location !== "string"
      ) {
        if (process.env.NODE_ENV === "development") {
          console.warn("[Parse] Parsed result missing required fields:", {
            hasTitle: typeof parsedObj.title === "string",
            hasCompany: typeof parsedObj.company === "string",
            hasLocation: typeof parsedObj.location === "string",
          });
        }
        // Try to fix - use empty strings for missing required fields
        if (typeof parsedObj.title !== "string") parsedObj.title = "";
        if (typeof parsedObj.company !== "string") parsedObj.company = "";
        if (typeof parsedObj.location !== "string") parsedObj.location = "";
      }

      const normalized = normalizeParseResult(parsed as ParseResult);

      const hasSalaryFromJD = normalized.salaryMin != null || normalized.salaryMax != null;

      // Only fetch salary estimation if salary is missing and we have required fields
      if (!hasSalaryFromJD && normalized.company && normalized.role && normalized.location) {
        // Validate required fields are not empty
        const hasValidFields =
          normalized.company.trim().length > 0 &&
          normalized.role.trim().length > 0 &&
          normalized.location.trim().length > 0 &&
          normalized.experience.trim().length > 0;

        if (hasValidFields) {
          try {
            const estimated = await fetchEstimatedSalary(
              normalized.company,
              normalized.role,
              normalized.experience,
              normalized.location
            );

            if (estimated && (estimated.salaryMin != null || estimated.salaryMax != null)) {
              // Validate estimated salary values
              if (
                (estimated.salaryMin == null ||
                  (Number.isFinite(estimated.salaryMin) && estimated.salaryMin >= 0)) &&
                (estimated.salaryMax == null ||
                  (Number.isFinite(estimated.salaryMax) && estimated.salaryMax >= 0))
              ) {
                normalized.salaryMin = estimated.salaryMin;
                normalized.salaryMax = estimated.salaryMax;
                normalized.salaryCurrency = estimated.salaryCurrency;
                normalized.salaryPeriod = estimated.salaryPeriod;
                normalized.salaryEstimated = true;
              } else {
                normalized.salaryEstimated = false;
              }
            } else {
              normalized.salaryEstimated = false;
            }
          } catch (salaryError) {
            // Don't fail the entire parse if salary estimation fails
            if (process.env.NODE_ENV === "development") {
              console.log(
                `[Parse] Salary estimation failed (non-critical):`,
                salaryError instanceof Error ? salaryError.message : String(salaryError)
              );
            }
            normalized.salaryEstimated = false;
          }
        } else {
          normalized.salaryEstimated = false;
        }
      } else {
        normalized.salaryEstimated = false;
      }

      const totalDuration = Date.now() - startTime;
      if (process.env.NODE_ENV === "development") {
        console.log(`[Parse] Total parse time: ${totalDuration}ms`);
      }

      return normalized;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // Classify errors for retry logic
      const isRetryable =
        error instanceof Error &&
        (error.message.includes("timeout") ||
          error.message.includes("rate limit") ||
          error.message.includes("429") ||
          error.message.includes("503") ||
          error.message.includes("502") ||
          error.message.includes("500") ||
          error.message.includes("service unavailable") ||
          error.message.includes("network") ||
          error.message.includes("ECONNRESET") ||
          error.message.includes("ETIMEDOUT") ||
          (error.message.includes("Invalid JSON") && attempt < MAX_RETRIES) ||
          (error.message.includes("truncated") && attempt < MAX_RETRIES));

      const isNonRetryable =
        error instanceof Error &&
        (error.message.includes("Empty response") ||
          error.message.includes("Invalid response structure") ||
          error.message.includes("content policy") ||
          error.message.includes("authentication failed") ||
          error.message.includes("OPENAI_API_KEY is not set") ||
          error.message.includes("Job description text is empty") ||
          error.message.includes("must be a string") ||
          error.message.includes("Response too short"));

      if (process.env.NODE_ENV === "development") {
        console.error(`[Parse] Attempt ${attempt + 1} failed:`, lastError.message);
      }

      if (isNonRetryable) {
        throw lastError;
      }

      if (isRetryable && attempt < MAX_RETRIES) {
        continue;
      }

      if (attempt === MAX_RETRIES || !isRetryable) {
        const totalDuration = Date.now() - startTime;
        if (process.env.NODE_ENV === "development") {
          console.error(`[Parse] Failed after ${totalDuration}ms and ${attempt + 1} attempts`);
        }
        throw lastError;
      }
    }
  }

  throw lastError || new Error("Parse failed after retries");
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

  // Validate and normalize salary values
  let salaryMin: number | null = null;
  let salaryMax: number | null = null;

  if (raw.salaryMin != null) {
    const minValue =
      typeof raw.salaryMin === "number" ? raw.salaryMin : parseFloat(String(raw.salaryMin));
    if (Number.isFinite(minValue) && minValue >= 0 && minValue <= 1_000_000_000) {
      salaryMin = Math.round(minValue);
    }
  }

  if (raw.salaryMax != null) {
    const maxValue =
      typeof raw.salaryMax === "number" ? raw.salaryMax : parseFloat(String(raw.salaryMax));
    if (Number.isFinite(maxValue) && maxValue >= 0 && maxValue <= 1_000_000_000) {
      salaryMax = Math.round(maxValue);
    }
  }

  // Validate salary range (max should be >= min)
  if (salaryMin != null && salaryMax != null && salaryMax < salaryMin) {
    // Swap if max < min (common error)
    [salaryMin, salaryMax] = [salaryMax, salaryMin];
  }

  // Convert monthly to yearly
  if (salaryPeriod === "monthly" && (salaryMin != null || salaryMax != null)) {
    if (salaryMin != null) {
      const yearlyMin = salaryMin * 12;
      salaryMin =
        Number.isFinite(yearlyMin) && yearlyMin <= 1_000_000_000 ? Math.round(yearlyMin) : null;
    }
    if (salaryMax != null) {
      const yearlyMax = salaryMax * 12;
      salaryMax =
        Number.isFinite(yearlyMax) && yearlyMax <= 1_000_000_000 ? Math.round(yearlyMax) : null;
    }
    salaryPeriod = "yearly";
  }

  // Convert hourly to yearly (2080 hours = 40 hours/week * 52 weeks)
  if (salaryPeriod === "hourly" && (salaryMin != null || salaryMax != null)) {
    if (salaryMin != null) {
      const yearlyMin = salaryMin * 2080;
      salaryMin =
        Number.isFinite(yearlyMin) && yearlyMin <= 1_000_000_000 ? Math.round(yearlyMin) : null;
    }
    if (salaryMax != null) {
      const yearlyMax = salaryMax * 2080;
      salaryMax =
        Number.isFinite(yearlyMax) && yearlyMax <= 1_000_000_000 ? Math.round(yearlyMax) : null;
    }
    salaryPeriod = "yearly";
  }

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

  if (hasSalary && !salaryCurrency) {
    const locationLower = location.toLowerCase();
    if (
      locationLower.includes("india") ||
      locationLower.includes("inr") ||
      locationLower.includes("bangalore") ||
      locationLower.includes("bengaluru") ||
      locationLower.includes("mumbai") ||
      locationLower.includes("delhi") ||
      locationLower.includes("hyderabad") ||
      locationLower.includes("pune") ||
      locationLower.includes("chennai") ||
      locationLower.includes("karnataka") ||
      locationLower.includes("maharashtra") ||
      locationLower.includes("tamil nadu") ||
      locationLower.includes("telangana")
    ) {
      salaryCurrency = "INR";
    }
  }

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
    salaryEstimated: raw.salaryEstimated ?? false,
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
