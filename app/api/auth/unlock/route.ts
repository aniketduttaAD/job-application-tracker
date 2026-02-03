import { NextRequest, NextResponse } from "next/server";
import { isApiAuthorized } from "@/lib/auth";
import { isUnlockRequired, checkPassword, createUnlockToken } from "@/lib/unlock-auth";

export async function POST(request: NextRequest) {
  if (!isApiAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isUnlockRequired()) {
    return NextResponse.json({ unlocked: true, token: "" });
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }
  const password =
    body != null && typeof body === "object" && "password" in body
      ? (body as { password: unknown }).password
      : undefined;
  const deviceId =
    body != null && typeof body === "object" && "deviceId" in body
      ? String((body as { deviceId: unknown }).deviceId)
      : undefined;

  if (!checkPassword(password)) {
    return NextResponse.json({ error: "Invalid password" }, { status: 401 });
  }

  if (!deviceId) {
    return NextResponse.json({ error: "Device ID required" }, { status: 400 });
  }

  const token = await createUnlockToken(deviceId);
  return NextResponse.json({ unlocked: true, token });
}
