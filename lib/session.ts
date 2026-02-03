import { neon } from "@neondatabase/serverless";

const sql = process.env.DATABASE_URL ? neon(process.env.DATABASE_URL) : null;
const SESSION_TTL_MS = 15 * 24 * 60 * 60 * 1000;

let lastCleanupTime = 0;
const CLEANUP_INTERVAL_MS = 60 * 60 * 1000;
let cleanupPromise: Promise<void> | null = null;

export type SessionType = "browser" | "telegram";

export interface UserSession {
  sessionId: string;
  sessionType: SessionType;
  identifier: string;
  expiresAt: string;
  createdAt: string;
}

/**
 * Check if a session is valid (exists and not expired)
 */
export async function isValidSession(
  sessionId: string,
  sessionType: SessionType
): Promise<boolean> {
  if (!sql) return false;
  if (!sessionId || !sessionType) return false;
  if (sessionId.length > 128) return false;
  try {
    const rows = (await sql.query(
      "SELECT session_id FROM user_sessions WHERE session_id = $1 AND session_type = $2 AND expires_at > NOW()",
      [sessionId, sessionType]
    )) as { session_id: string }[];
    return rows.length > 0;
  } catch {
    return false;
  }
}

/**
 * Create a new session
 */
export async function createSession(
  sessionType: SessionType,
  identifier: string,
  ttlMs: number = SESSION_TTL_MS
): Promise<string> {
  if (!sql) {
    throw new Error("Database not configured");
  }
  if (!sessionType || !identifier) {
    throw new Error("Session type and identifier are required");
  }
  if (identifier.length > 255) {
    throw new Error("Identifier too long");
  }
  if (ttlMs <= 0 || ttlMs > 365 * 24 * 60 * 60 * 1000) {
    throw new Error("Invalid TTL");
  }

  const sessionId = generateSessionId();
  const expiresAt = new Date(Date.now() + ttlMs).toISOString();
  const createdAt = new Date().toISOString();

  try {
    await sql.query(
      `INSERT INTO user_sessions (session_id, session_type, identifier, expires_at, created_at)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (session_type, identifier) 
       DO UPDATE SET session_id = $1, expires_at = $4, created_at = $5`,
      [sessionId, sessionType, identifier, expiresAt, createdAt]
    );
  } catch (error) {
    console.error("Failed to create session:", error);
    throw new Error("Failed to create session");
  }

  return sessionId;
}

/**
 * Get session by session ID
 */
export async function getSession(sessionId: string): Promise<UserSession | null> {
  if (!sql) return null;
  if (!sessionId || sessionId.length > 128) return null;
  try {
    const rows = (await sql.query(
      "SELECT session_id, session_type, identifier, expires_at, created_at FROM user_sessions WHERE session_id = $1 AND expires_at > NOW()",
      [sessionId]
    )) as Array<{
      session_id: string;
      session_type: string;
      identifier: string;
      expires_at: string;
      created_at: string;
    }>;
    if (rows.length === 0) return null;
    const row = rows[0];
    return {
      sessionId: row.session_id,
      sessionType: row.session_type as SessionType,
      identifier: row.identifier,
      expiresAt: row.expires_at,
      createdAt: row.created_at,
    };
  } catch {
    return null;
  }
}

/**
 * Get session by type and identifier (e.g., browser token or telegram chat_id)
 */
export async function getSessionByIdentifier(
  sessionType: SessionType,
  identifier: string
): Promise<UserSession | null> {
  if (!sql) return null;
  if (!sessionType || !identifier || identifier.length > 255) return null;
  try {
    const rows = (await sql.query(
      "SELECT session_id, session_type, identifier, expires_at, created_at FROM user_sessions WHERE session_type = $1 AND identifier = $2 AND expires_at > NOW()",
      [sessionType, identifier]
    )) as Array<{
      session_id: string;
      session_type: string;
      identifier: string;
      expires_at: string;
      created_at: string;
    }>;
    if (rows.length === 0) return null;
    const row = rows[0];
    return {
      sessionId: row.session_id,
      sessionType: row.session_type as SessionType,
      identifier: row.identifier,
      expiresAt: row.expires_at,
      createdAt: row.created_at,
    };
  } catch {
    return null;
  }
}

/**
 * Delete a session
 */
export async function deleteSession(sessionId: string): Promise<void> {
  if (!sql) return;
  if (!sessionId || sessionId.length > 128) return;
  try {
    await sql.query("DELETE FROM user_sessions WHERE session_id = $1", [sessionId]);
  } catch (error) {
    console.error("Failed to delete session:", error);
  }
}

/**
 * Delete session by type and identifier
 */
export async function deleteSessionByIdentifier(
  sessionType: SessionType,
  identifier: string
): Promise<void> {
  if (!sql) return;
  if (!sessionType || !identifier || identifier.length > 255) return;
  try {
    await sql.query("DELETE FROM user_sessions WHERE session_type = $1 AND identifier = $2", [
      sessionType,
      identifier,
    ]);
  } catch (error) {
    console.error("Failed to delete session by identifier:", error);
  }
}

/**
 * Delete all expired sessions (cleanup function)
 */
export async function deleteExpiredSessions(): Promise<number> {
  if (!sql) return 0;
  const result = (await sql.query(
    "DELETE FROM user_sessions WHERE expires_at <= NOW() RETURNING session_id"
  )) as { session_id: string }[];
  return result.length;
}

/**
 * Cleanup expired sessions automatically (throttled to avoid performance issues)
 * This runs cleanup at most once per CLEANUP_INTERVAL_MS
 * Uses a promise to prevent concurrent cleanup operations
 */
export async function cleanupExpiredSessionsIfNeeded(): Promise<void> {
  const now = Date.now();
  if (now - lastCleanupTime < CLEANUP_INTERVAL_MS) {
    if (cleanupPromise) {
      return cleanupPromise;
    }
    return;
  }

  if (cleanupPromise) {
    return cleanupPromise;
  }

  lastCleanupTime = now;
  cleanupPromise = (async () => {
    try {
      await deleteExpiredSessions();
    } catch (error) {
      console.error("Failed to cleanup expired sessions:", error);
    } finally {
      cleanupPromise = null;
    }
  })();

  return cleanupPromise;
}

/**
 * Get all active sessions for a given identifier
 */
export async function getActiveSessionsByIdentifier(
  sessionType: SessionType,
  identifier: string
): Promise<UserSession[]> {
  if (!sql) return [];
  const rows = (await sql.query(
    "SELECT session_id, session_type, identifier, expires_at, created_at FROM user_sessions WHERE session_type = $1 AND identifier = $2 AND expires_at > NOW() ORDER BY created_at DESC",
    [sessionType, identifier]
  )) as Array<{
    session_id: string;
    session_type: string;
    identifier: string;
    expires_at: string;
    created_at: string;
  }>;
  return rows.map((row) => ({
    sessionId: row.session_id,
    sessionType: row.session_type as SessionType,
    identifier: row.identifier,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
  }));
}

/**
 * Generate a secure random session ID
 */
function generateSessionId(): string {
  const crypto = require("crypto");
  return crypto.randomBytes(32).toString("hex");
}
