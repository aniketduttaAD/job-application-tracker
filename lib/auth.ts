import { NextRequest } from "next/server";

const API_KEY = process.env.API_KEY ?? "";

function isSameOrigin(request: NextRequest): boolean {
  const origin = request.headers.get("origin");
  const host = request.headers.get("host");
  if (!origin || !host) return false;
  try {
    const originHost = new URL(origin).host;
    return originHost === host;
  } catch {
    return false;
  }
}

function hasValidApiKey(request: NextRequest): boolean {
  if (!API_KEY) return false;
  const key =
    request.headers.get("x-api-key") ??
    request.headers
      .get("authorization")
      ?.replace(/^Bearer\s+/i, "")
      .trim();
  return key === API_KEY;
}

export function isApiAuthorized(request: NextRequest): boolean {
  if (hasValidApiKey(request)) return true;
  if (isSameOrigin(request)) return true;
  return false;
}

export function isReadAuthorized(request: NextRequest): boolean {
  return isApiAuthorized(request);
}
