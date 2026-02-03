import { NextRequest, NextResponse } from "next/server";
import { isApiAuthorized } from "@/lib/auth";
import { validateUnlockToken } from "@/lib/unlock-auth";
import { parseJobDescription, parseResultToJobRecord } from "@/lib/openai-parse";
import { MAX_JD_PARSE_LENGTH } from "@/lib/validation";

const API_TIMEOUT_MS = 50_000;

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timeoutId: NodeJS.Timeout | null = null;

  const timeoutPromise = new Promise<T>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error("Request timeout - parsing took too long. Please try again."));
    }, timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}

export async function POST(request: NextRequest) {
  if (!isApiAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!(await validateUnlockToken(request))) {
    return NextResponse.json({ error: "Unlock required" }, { status: 401 });
  }
  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json({ error: "OPENAI_API_KEY is not configured" }, { status: 503 });
  }

  try {
    let body;
    try {
      body = await request.json();
    } catch (jsonError) {
      return NextResponse.json({ error: "Invalid JSON in request body" }, { status: 400 });
    }

    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Request body must be an object" }, { status: 400 });
    }

    const raw = String(body?.jd ?? body?.text ?? "").trim();
    if (!raw) {
      return NextResponse.json(
        { error: "Job description text (jd or text) required" },
        { status: 400 }
      );
    }

    if (raw.length > MAX_JD_PARSE_LENGTH) {
      return NextResponse.json(
        {
          error: `Job description must be at most ${MAX_JD_PARSE_LENGTH} characters (received ${raw.length})`,
        },
        { status: 400 }
      );
    }

    if (raw.length < 10) {
      return NextResponse.json(
        { error: "Job description is too short (minimum 10 characters)" },
        { status: 400 }
      );
    }

    const result = await withTimeout(parseJobDescription(raw), API_TIMEOUT_MS);

    // Validate result before converting
    if (!result || typeof result !== "object") {
      return NextResponse.json({ error: "Invalid parse result" }, { status: 500 });
    }

    const record = parseResultToJobRecord(result, raw);
    return NextResponse.json({ parsed: result, record });
  } catch (e) {
    const error = e instanceof Error ? e : new Error(String(e));

    // Provide user-friendly error messages
    let message = "Parse failed";
    let status = 500;

    if (error.message.includes("timeout")) {
      message = "Parsing took too long. Please try again or use a shorter job description.";
      status = 504; // Gateway Timeout
    } else if (
      error.message.includes("authentication failed") ||
      error.message.includes("API key")
    ) {
      message = "API authentication failed. Please check configuration.";
      status = 503;
    } else if (error.message.includes("rate limit")) {
      message = "Rate limit exceeded. Please try again later.";
      status = 429;
    } else if (error.message.includes("service unavailable")) {
      message = "Service temporarily unavailable. Please try again later.";
      status = 503;
    } else if (error.message.includes("content policy")) {
      message = "Content was filtered. Please check the job description.";
      status = 400;
    } else if (error.message) {
      message = error.message;
    }

    console.error("Parse error:", error);
    return NextResponse.json({ error: message }, { status });
  }
}
