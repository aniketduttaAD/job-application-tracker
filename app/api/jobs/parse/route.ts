import { NextRequest, NextResponse } from "next/server";
import { isApiAuthorized } from "@/lib/auth";
import { parseJobDescription, parseResultToJobRecord } from "@/lib/openai-parse";
import { MAX_JD_PARSE_LENGTH } from "@/lib/validation";

export async function POST(request: NextRequest) {
  if (!isApiAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json({ error: "OPENAI_API_KEY is not configured" }, { status: 503 });
  }
  try {
    const body = await request.json();
    const raw = String(body?.jd ?? body?.text ?? "").trim();
    if (!raw) {
      return NextResponse.json(
        { error: "Job description text (jd or text) required" },
        { status: 400 }
      );
    }
    if (raw.length > MAX_JD_PARSE_LENGTH) {
      return NextResponse.json(
        { error: `Job description must be at most ${MAX_JD_PARSE_LENGTH} characters` },
        { status: 400 }
      );
    }
    const result = await parseJobDescription(raw);
    const record = parseResultToJobRecord(result, raw);
    return NextResponse.json({ parsed: result, record });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Parse failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
