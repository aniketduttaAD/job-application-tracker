import { NextRequest } from "next/server";
import { randomBytes } from "crypto";

const APP_PASSWORD = process.env.APP_PASSWORD ?? "";
const TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

const tokens = new Map<string, number>();

function pruneExpired(): void {
  const now = Date.now();
  for (const [token, expiry] of tokens.entries()) {
    if (expiry <= now) tokens.delete(token);
  }
}

export function isUnlockRequired(): boolean {
  return APP_PASSWORD.length > 0;
}

export function createUnlockToken(): string {
  pruneExpired();
  const token = randomBytes(32).toString("hex");
  tokens.set(token, Date.now() + TOKEN_TTL_MS);
  return token;
}

export function validateUnlockToken(request: NextRequest): boolean {
  if (!isUnlockRequired()) return true;
  const token = request.headers.get("x-unlock-token")?.trim();
  if (!token) return false;
  const expiry = tokens.get(token);
  if (expiry == null || expiry <= Date.now()) {
    tokens.delete(token);
    return false;
  }
  return true;
}

export function checkPassword(password: unknown): boolean {
  if (typeof password !== "string") return false;
  return password === APP_PASSWORD;
}
