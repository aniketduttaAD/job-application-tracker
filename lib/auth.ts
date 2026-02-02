import { NextRequest } from "next/server";

const API_KEY = process.env.API_KEY ?? "";

/** Same-origin check: request is from our own host (browser same-origin). */
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

/** True if request sends the configured API key. */
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

/**
 * Authorizes mutating requests (POST, PATCH, DELETE).
 * - If API_KEY is set: require x-api-key (or Bearer) to match, OR same-origin (e.g. your own UI).
 * - If API_KEY is not set: require same-origin only (no open-by-default).
 */
export function isApiAuthorized(request: NextRequest): boolean {
  if (hasValidApiKey(request)) return true;
  if (isSameOrigin(request)) return true;
  return false;
}

/**
 * Use for read-only routes (GET) when you want to protect data when API_KEY is set.
 * When API_KEY is set, requires key or same-origin. When not set, allows same-origin only.
 */
export function isReadAuthorized(request: NextRequest): boolean {
  return isApiAuthorized(request);
}
