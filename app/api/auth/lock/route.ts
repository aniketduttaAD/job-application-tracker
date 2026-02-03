import { NextRequest, NextResponse } from "next/server";
import { isApiAuthorized } from "@/lib/auth";
import { validateUnlockToken, deleteUnlockSession } from "@/lib/unlock-auth";
import { getSession } from "@/lib/session";

export async function POST(request: NextRequest) {
  if (!isApiAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!(await validateUnlockToken(request))) {
    return NextResponse.json({ error: "Unlock required" }, { status: 401 });
  }

  const token = request.headers.get("x-unlock-token")?.trim();
  if (!token) {
    return NextResponse.json({ error: "Token required" }, { status: 400 });
  }

  const session = await getSession(token);
  if (!session) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }
  if (session.sessionType !== "browser") {
    return NextResponse.json({ error: "Invalid session type" }, { status: 403 });
  }

  await deleteUnlockSession(token);

  return NextResponse.json({ locked: true, message: "Session locked successfully" });
}
