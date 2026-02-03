import { NextRequest } from "next/server";
import {
  createSession,
  isValidSession,
  deleteSession,
  getSession,
  cleanupExpiredSessionsIfNeeded,
  type SessionType,
} from "./session";

const APP_PASSWORD = process.env.APP_PASSWORD ?? "";
const SESSION_TTL_MS = 15 * 24 * 60 * 60 * 1000;

export function isUnlockRequired(): boolean {
  return APP_PASSWORD.length > 0;
}

/**
 * Create a browser unlock session
 * @param deviceId - Unique identifier for the device/browser
 * @returns Session ID (token)
 */
export async function createUnlockToken(deviceId: string): Promise<string> {
  await cleanupExpiredSessionsIfNeeded();
  return await createSession("browser", deviceId, SESSION_TTL_MS);
}

/**
 * Validate unlock token from request
 */
export async function validateUnlockToken(request: NextRequest): Promise<boolean> {
  if (!isUnlockRequired()) return true;
  await cleanupExpiredSessionsIfNeeded();
  const token = request.headers.get("x-unlock-token")?.trim();
  if (!token) return false;
  return await isValidSession(token, "browser");
}

/**
 * Delete unlock session
 */
export async function deleteUnlockSession(sessionId: string): Promise<void> {
  await deleteSession(sessionId);
}

/**
 * Get session details
 */
export async function getUnlockSession(sessionId: string) {
  return await getSession(sessionId);
}

export function checkPassword(password: unknown): boolean {
  if (typeof password !== "string") return false;
  return password === APP_PASSWORD;
}
