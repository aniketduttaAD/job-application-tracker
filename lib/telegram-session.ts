import {
  createSession,
  deleteSessionByIdentifier,
  getSessionByIdentifier,
  cleanupExpiredSessionsIfNeeded,
} from "./session";

const SESSION_TTL_MS = 15 * 24 * 60 * 60 * 1000;

export async function isTelegramChatUnlocked(chatId: number): Promise<boolean> {
  await cleanupExpiredSessionsIfNeeded();
  const identifier = String(chatId);
  const session = await getSessionByIdentifier("telegram", identifier);
  return session !== null;
}

export async function setTelegramChatUnlocked(
  chatId: number,
  ttlMs: number = SESSION_TTL_MS
): Promise<void> {
  await cleanupExpiredSessionsIfNeeded();
  const identifier = String(chatId);
  await createSession("telegram", identifier, ttlMs);
}

/**
 * Clear telegram chat session
 */
export async function clearTelegramChatSession(chatId: number): Promise<void> {
  const identifier = String(chatId);
  await deleteSessionByIdentifier("telegram", identifier);
}
