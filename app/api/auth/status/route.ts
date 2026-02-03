import { NextRequest, NextResponse } from "next/server";
import { isReadAuthorized } from "@/lib/auth";
import { isUnlockRequired } from "@/lib/unlock-auth";

export async function GET(request: NextRequest) {
  if (!isReadAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json({ unlockRequired: isUnlockRequired() });
}
