import { neon } from "@neondatabase/serverless";

const sql = process.env.DATABASE_URL ? neon(process.env.DATABASE_URL) : null;
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export async function isTelegramChatUnlocked(chatId: number): Promise<boolean> {
  if (!sql) return false;
  const id = String(chatId);
  const rows = (await sql.query(
    "SELECT chat_id FROM telegram_sessions WHERE chat_id = $1 AND expires_at > NOW()",
    [id]
  )) as { chat_id: string }[];
  return rows.length > 0;
}

export async function setTelegramChatUnlocked(
  chatId: number,
  ttlMs: number = SESSION_TTL_MS
): Promise<void> {
  if (!sql) return;
  const id = String(chatId);
  const expiresAt = new Date(Date.now() + ttlMs).toISOString();
  await sql.query(
    `INSERT INTO telegram_sessions (chat_id, expires_at)
     VALUES ($1, $2)
     ON CONFLICT (chat_id) DO UPDATE SET expires_at = $2`,
    [id, expiresAt]
  );
}

export async function clearTelegramChatSession(chatId: number): Promise<void> {
  if (!sql) return;
  await sql.query("DELETE FROM telegram_sessions WHERE chat_id = $1", [String(chatId)]);
}
